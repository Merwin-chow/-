// Phase 2 统一鉴权：由 event.token 解析真实 uid，不再信任 event.user_id / event.owner_id
async function resolveUid(context, event) {
  const token = event.token
  if (!token) {
    const uid = event.uid || ''
    return uid.startsWith('visitor_') ? { uid, isVisitor: true } : { code: 401 }
  }
  const uniIdCommon = require('uni-id-common')
  const uniID = uniIdCommon.createInstance({ context })
  const res = await uniID.checkToken(token)
  if (res.errCode) return { code: 401, message: '登录已失效' }
  return { uid: res.uid, isVisitor: false }
}

exports.main = async (event, context) => {
  const db = uniCloud.database()
  const cmd = db.command
  const u = await resolveUid(context, event)
  if (u.code) return u
  const uid = u.uid
  // token 身份覆盖 event.user_id / event.owner_id：以下所有 user_id/owner_id 均指已解析身份
  const user_id = uid
  // owner_id 仅作历史字段名兼容，强制等同解析后的身份，杜绝通过 owner_id 冒充他人
  const owner_id = uid
  const {
    action, title, date, start_time, end_time, type,
    scope, group_id, signup_enabled, reminders, member_name, description,
    schedule_id, month, keyword, form_data, sessions, signup_quota,
    signup_fields, signup_closed, signup_form, signup_deadline, view,
    draft_id, template_id, enabled, use_sessions
  } = event

  // 写操作/涉及他人数据操作：游客需登录
  const requiresLogin = [
    'create', 'update', 'delete', 'publishSignup', 'signup', 'cancelSignup',
    'updateActivity', 'saveSignupDraft', 'deleteSignupDraft', 'subscribeNotify'
  ]
  if (requiresLogin.includes(action) && u.isVisitor) {
    return { code: 401, message: '请先登录' }
  }

  const computeStatus = (item) => {
    const today = new Date().toISOString().slice(0, 10)
    const dateStr = item.date
    if (dateStr < today) return 'ended'
    if (dateStr > today) return 'not_started'
    const nowHM = new Date().toTimeString().slice(0, 5)
    const st = item.start_time || ''
    if (st && st <= nowHM) {
      const et = item.end_time || ''
      if (et && et <= nowHM) return 'ended'
      return 'in_progress'
    }
    return 'not_started'
  }

  const statusLabel = (s) => {
    const m = { ended: '已结束', in_progress: '进行中', not_started: '未开始' }
    return m[s] || '未开始'
  }

  const enrichWithStatus = (items) => {
    return items.map(item => {
      const s = computeStatus(item)
      return { ...item, schedule_status: s, status_label: statusLabel(s) }
    })
  }

  // 计算下一次提醒时间戳；无待发则返回 0（供 schedule_notify 按索引拉取）
  const computeNextRemindAt = (dateStr, startTime, reminders) => {
    if (!dateStr || !startTime || !Array.isArray(reminders) || reminders.length === 0) return 0
    const scheduleTime = new Date(`${dateStr}T${startTime}:00`).getTime()
    if (isNaN(scheduleTime)) return 0
    let next = 0
    for (const r of reminders) {
      if (r && r.sent) continue
      const fire = scheduleTime - (Number(r.minutes_before) || 0) * 60000
      if (fire > 0 && (next === 0 || fire < next)) next = fire
    }
    return next
  }

  const logHistory = async ({ schedule_id, action, before, after, changed_by }) => {
    await db.collection('schedule_history').add({
      schedule_id,
      action,
      before: before || null,
      after: after || null,
      changed_by,
      changeTime: Date.now()
    })
  }

  const logEvent = async ({ group_id, type, user_id, data }) => {
    await db.collection('group_events').add({
      group_id,
      type,
      user_id,
      data: data || {},
      createTime: Date.now()
    })
  }

  const cleanSessions = (arr) => {
    return (Array.isArray(arr) ? arr : [])
      .map(s => ({
        name: String((s && s.name) || '').trim(),
        quota: Math.max(Number(s && s.quota) || 0, 0),
        start_time: (s && s.start_time) || '',
        end_time: (s && s.end_time) || ''
      }))
      .filter(s => s.name)
  }

  // ===== 通用问卷 =====
  const FIELD_TYPE = { text: 1, textarea: 1, number: 1, date: 1, select: 1, checkbox: 1 }

  const cleanSignupForm = (arr, sess) => {
    const sNames = (sess || []).map(s => s && s.name).filter(Boolean)
    if (!Array.isArray(arr) || arr.length === 0) return []
    const seen = {}
    const out = []
    for (const f of arr) {
      if (!f || typeof f !== 'object') continue
      const key = String((f.key || '').trim())
      if (!key || seen[key]) continue
      seen[key] = true
      const label = String(f.label || '').trim() || key
      let ftype = String(f.type || 'text')
      if (!FIELD_TYPE[ftype]) ftype = 'text'
      let options = []
      if (Array.isArray(f.options)) options = f.options.map(o => String(o).trim()).filter(Boolean)
      if (ftype === 'select' && key === 'session' && options.length === 0) options = sNames
      // key 约定：预填来源 + 档案沉淀
      let prefill = 'manual'
      let save = ''
      if (key === 'name') prefill = 'group'
      else if (key === 'phone') prefill = 'profile'
      else if (key === 'birthday') { prefill = 'profile'; save = 'birthday' }
      if (f.prefill === 'group' || f.prefill === 'profile') prefill = f.prefill
      if (f.save_to_profile) save = String(f.save_to_profile).trim()
      out.push({
        key, label, type: ftype, required: !!f.required,
        options, prefill, save_to_profile: save
      })
    }
    return out
  }

  const defaultSignupForm = (t) => {
    const base = { key: 'name', label: '姓名', type: 'text', required: true, options: [], prefill: 'group', save_to_profile: '' }
    if (t === 'birthday') return [
      base,
      { key: 'birthday', label: '我的生日', type: 'date', required: true, options: [], prefill: 'profile', save_to_profile: 'birthday' },
      { key: 'note', label: '备注', type: 'textarea', required: false, options: [], prefill: 'manual', save_to_profile: '' }
    ]
    if (t === 'meeting') return [
      base,
      { key: 'phone', label: '联系方式', type: 'text', required: false, options: [], prefill: 'profile', save_to_profile: '' }
    ]
    if (t === 'event') return [
      base,
      { key: 'phone', label: '联系方式', type: 'text', required: false, options: [], prefill: 'profile', save_to_profile: '' },
      { key: 'session', label: '参加场次', type: 'select', required: false, options: [], prefill: 'manual', save_to_profile: '' }
    ]
    return [base]
  }

  const legacyToForm = (fields, sess) => {
    const map = {
      name: { label: '姓名', type: 'text', required: true, prefill: 'group' },
      identity: { label: '身份', type: 'text', required: true, prefill: 'manual' },
      phone: { label: '联系方式', type: 'text', required: false, prefill: 'profile' },
      session: { label: '参加场次', type: 'select', required: false, prefill: 'manual' }
    }
    const sNames = (sess || []).map(s => s && s.name).filter(Boolean)
    const arr = (Array.isArray(fields) ? fields : []).filter(f => map[f])
    if (arr.length === 0) return []
    return arr.map(k => ({
      key: k, label: map[k].label, type: map[k].type, required: map[k].required,
      options: k === 'session' ? sNames : [],
      prefill: map[k].prefill, save_to_profile: ''
    }))
  }

  const resolveSignupForm = (schedule) => {
    if (Array.isArray(schedule.signup_form) && schedule.signup_form.length > 0) return schedule.signup_form
    if (Array.isArray(schedule.signup_fields) && schedule.signup_fields.length > 0) return legacyToForm(schedule.signup_fields, schedule.sessions)
    return defaultSignupForm(schedule.type)
  }

  const getMyGroupIds = async (uid) => {
    if (!uid || uid.startsWith('visitor_')) return []
    const res = await db.collection('groups')
      .where({ 'members.user_id': uid })
      .field({ _id: true })
      .limit(100)
      .get()
    return (res.data || []).map(g => g._id)
  }

  const isGroupMember = async (gid, uid) => {
    if (!gid || !uid) return false
    const res = await db.collection('groups')
      .where({ _id: gid, 'members.user_id': uid })
      .field({ _id: true })
      .get()
    return res.data && res.data.length > 0
  }

  const getGroupInfo = async (gid) => {
    if (!gid) return null
    const res = await db.collection('groups').doc(gid).get()
    return res.data || null
  }

  const getGroupMemberIds = async (gid) => {
    const g = await getGroupInfo(gid)
    return ((g && g.members) || []).map(m => m.user_id).filter(Boolean)
  }

  // ===== 订阅消息（一次性模板，需用户在微信内先授权） =====
  const DCLOUD_APPID = '__UNI__87DED5E'
  // 发布报名通知（最近活动提醒：活动名称/活动时间/剩余天数）
  const SIGNUP_PUBLISH_TMPL = process.env.SIGNUP_PUBLISH_TMPL || '46MLVHkksG2sXsydt_CuGDdRlW1Pdhv5YjdHf1Ojpgc'
  // 报名成功通知发起人（复用「日程提醒」：提醒人/提醒日期/提醒事项）
  const SIGNUP_RESULT_TMPL = process.env.SIGNUP_RESULT_TMPL || 'UVDiKNJ5K6pYWCC94empCnhmVjMep3nfOmkgQmYd2J0'

  const getUniSubscribemsg = () => {
    try {
      const UniSubscribemsg = require('uni-subscribemsg')
      return new UniSubscribemsg({ dcloudAppid: DCLOUD_APPID, provider: 'weixin-mp' })
    } catch (e) {
      return null
    }
  }

  const sendSubMsg = async (touser, templateId, data) => {
    if (!templateId || !touser) return
    try {
      const sender = getUniSubscribemsg()
      if (!sender) return
      await sender.sendSubscribeMessage({
        touser,
        template_id: templateId,
        page: 'pages/schedule/schedule',
        miniprogram_state: 'formal',
        lang: 'zh_CN',
        data
      }).catch(() => {})
    } catch (e) {
      console.error('sendSubMsg fail:', touser, e)
    }
  }

  const sendPublishNotify = async (gid, title, date) => {
    if (!SIGNUP_PUBLISH_TMPL) return
    const ids = await getGroupMemberIds(gid)
    if (ids.length === 0) return
    const uRes = await db.collection('uni-id-users')
      .where({ _id: cmd.in(ids), subscribe_templates: SIGNUP_PUBLISH_TMPL })
      .field({ openid: true })
      .get()
    const today = new Date().toISOString().slice(0, 10)
    const daysLeft = Math.max(Math.ceil((new Date(date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000), 0)
    for (const u of uRes.data || []) {
      if (!u.openid) continue
      await sendSubMsg(u.openid, SIGNUP_PUBLISH_TMPL, {
        time1: { value: date || '' },
        number2: { value: String(daysLeft) },
        thing3: { value: (title || '').slice(0, 20) }
      })
    }
  }

  const sendSignupNotify = async (owner_id, title, name) => {
    if (!SIGNUP_RESULT_TMPL || !owner_id) return
    const uRes = await db.collection('uni-id-users')
      .where({ _id: owner_id, subscribe_templates: SIGNUP_RESULT_TMPL })
      .field({ openid: true })
      .get()
    const u = uRes.data && uRes.data[0]
    if (!u || !u.openid) return
    const today = new Date().toISOString().slice(0, 10)
    await sendSubMsg(u.openid, SIGNUP_RESULT_TMPL, {
      name1: { value: (name || '').slice(0, 20) },
      date2: { value: today },
      thing3: { value: (title || '').slice(0, 20) }
    })
  }

  // ===== 创建日程文档（create / publishSignup 共用） =====
  const createScheduleDoc = async ({ uid, title, date, start_time, end_time, type, scope, group_id, signup_enabled, signup_quota, signup_fields, signup_form, signup_deadline, sessions, reminders, member_name, description, use_sessions }) => {
    const finalScope = scope === 'group' ? 'group' : 'private'
    if (finalScope === 'group') {
      if (!group_id) return { ok: false, code: 400, message: '发布到群需指定群组' }
      const member = await isGroupMember(group_id, uid)
      if (!member) return { ok: false, code: 403, message: '非群成员不可发布日程到该群' }
    }
    const now = Date.now()
    const cleanReminders = Array.isArray(reminders)
      ? reminders.map(r => ({ minutes_before: Number(r.minutes_before) || 0, sent: false }))
      : []
    const isGroup = finalScope === 'group'
    const useSessions = isGroup && signup_enabled ? !!use_sessions : false
    const cleanSess = useSessions ? cleanSessions(sessions) : []
    let form = []
    let deadline = ''
    if (isGroup && signup_enabled) {
      if (Array.isArray(signup_form) && signup_form.length > 0) form = cleanSignupForm(signup_form, cleanSess)
      else if (Array.isArray(signup_fields) && signup_fields.length > 0) form = legacyToForm(signup_fields, cleanSess)
      else form = defaultSignupForm(type || 'other')
      form = cleanSignupForm(form, cleanSess)
      deadline = typeof signup_deadline === 'string' ? signup_deadline.trim() : ''
    }
    const formKeys = form.map(f => f.key)
    const doc = {
      owner_id: uid,
      title,
      date,
      start_time: start_time || '',
      end_time: end_time || '',
      type: type || 'other',
      scope: finalScope,
      group_id: finalScope === 'group' ? group_id : '',
      signup_enabled: isGroup ? !!signup_enabled : false,
      signup_quota: isGroup ? (Number(signup_quota) || 0) : 0,
      signup_fields: isGroup ? (formKeys.length > 0 ? formKeys : ['name']) : [],
      signup_form: form,
      signup_deadline: deadline,
      use_sessions: useSessions,
      sessions: cleanSess,
      signup_closed: false,
      reminders: cleanReminders,
      next_remind_at: computeNextRemindAt(date, start_time || '', cleanReminders),
      member_name: member_name || '',
      description: description || '',
      createTime: now,
      updateTime: now
    }
    const res = await db.collection('schedules').add(doc)
    doc._id = res.id
    await logHistory({ schedule_id: res.id, action: 'create', before: null, after: doc, changed_by: uid })
    return { ok: true, id: res.id, doc }
  }

  const getMySignedIds = async (uid) => {
    if (!uid) return []
    const res = await db.collection('signups')
      .where({ user_id: uid, status: 'signed' })
      .field({ schedule_id: true })
      .get()
    return (res.data || []).map(s => s.schedule_id)
  }

  const attachSignupCounts = async (items) => {
    const ids = items.map(i => i._id)
    if (ids.length === 0) return items
    const signupRes = await db.collection('signups')
      .where({
        schedule_id: cmd.in(ids),
        status: 'signed'
      })
      .field({ schedule_id: true })
      .get()
    const countMap = {}
    ;(signupRes.data || []).forEach(s => {
      countMap[s.schedule_id] = (countMap[s.schedule_id] || 0) + 1
    })
    return items.map(i => ({ ...i, signup_count: countMap[i._id] || 0 }))
  }

  const attachMyStatus = async (items, uid) => {
    if (!uid || items.length === 0) return items
    const ids = items.map(i => i._id)
    const res = await db.collection('signups')
      .where({ user_id: uid, schedule_id: cmd.in(ids) })
      .field({ schedule_id: true, status: true })
      .get()
    const m = {}
    ;(res.data || []).forEach(s => { m[s.schedule_id] = s.status })
    return items.map(i => ({ ...i, my_signup_status: m[i._id] || 'none' }))
  }

  const baseLoad = async ({ uid, dateCond, scopeType, limit }) => {
    let items = []
    if (scopeType === 'group_all') {
      const gids = await getMyGroupIds(uid)
      if (gids.length === 0) return []
      const cond = cmd.or(gids.map(gid => ({ scope: 'group', group_id: gid })))
      let q = db.collection('schedules').where(cond)
      if (dateCond) q = q.where(dateCond)
      const res = await q.orderBy('date', 'desc').limit(limit || 500).get()
      items = res.data || []
    } else {
      const signedIds = await getMySignedIds(uid)
      const cond = signedIds.length > 0
        ? cmd.or([{ owner_id: uid }, { _id: cmd.in(signedIds) }])
        : { owner_id: uid }
      let q = db.collection('schedules').where(cond)
      if (dateCond) q = q.where(dateCond)
      const res = await q.orderBy('date', 'desc').limit(limit || 500).get()
      items = res.data || []
    }
    let list = enrichWithStatus(items)
    list = await attachSignupCounts(list)
    list = await attachMyStatus(list, uid)
    return list
  }

  // ===== 获取某月日程（个人：我创建 + 我报名；或群：所在群全部活动） =====
  if (action === 'getMonth') {
    if (!user_id || !month) return { code: 400, message: '缺少参数' }
    const monthStart = month + '-01'
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const monthEnd = month + '-' + String(lastDay).padStart(2, '0')
    const dateCond = {
      date: cmd.gte(monthStart).and(cmd.lte(monthEnd))
    }
    const list = await baseLoad({ uid: user_id, dateCond, scopeType: view === 'group_all' ? 'group_all' : 'personal' })
    return { code: 200, data: list }
  }

  // ===== 获取某天日程 =====
  if (action === 'getDay') {
    if (!user_id || !date) return { code: 400, message: '缺少参数' }
    const list = await baseLoad({ uid: user_id, dateCond: { date }, scopeType: view === 'group_all' ? 'group_all' : 'personal' })
    return { code: 200, data: list }
  }

  // ===== 搜索日程 =====
  if (action === 'search') {
    if (!user_id) return { code: 400, message: '缺少 user_id' }
    const list = await baseLoad({ uid: user_id, dateCond: null, scopeType: view === 'group_all' ? 'group_all' : 'personal', limit: 1000 })
    const filtered = keyword
      ? list.filter(item => item.title && item.title.includes(keyword))
      : list
    return { code: 200, data: filtered.slice(0, 100) }
  }

  // ===== 获取某群的日程列表（群内全部活动） =====
  if (action === 'getGroupSchedules') {
    if (!user_id || !group_id) return { code: 400, message: '缺少参数' }
    const member = await isGroupMember(group_id, user_id)
    if (!member) return { code: 403, message: '非群成员不可查看' }
    const res = await db.collection('schedules')
      .where({ scope: 'group', group_id })
      .orderBy('date', 'desc')
      .limit(200)
      .get()
    let list = enrichWithStatus(res.data || [])
    list = await attachSignupCounts(list)
    list = await attachMyStatus(list, user_id)
    return { code: 200, data: list }
  }

  // ===== 创建日程 =====
  if (action === 'create') {
    const uid = owner_id || user_id
    if (!uid || !title || !date) return { code: 400, message: '缺少必要参数' }
    const r = await createScheduleDoc({
      uid, title, date, start_time, end_time, type, scope, group_id,
      signup_enabled, signup_quota, signup_fields, signup_form,
      signup_deadline, sessions, reminders, member_name, description
    })
    if (!r.ok) return { code: r.code, message: r.message }
    if (r.doc.scope === 'group') {
      await logEvent({ group_id: r.doc.group_id, type: 'schedule_created', user_id: uid, data: { schedule_id: r.id, title } })
    }
    return { code: 200, message: '创建成功', id: r.id }
  }

  // ===== 发起报名（群组功能：发布即自动生成群日程 + 群动态 + 通知） =====
  if (action === 'publishSignup') {
    const uid = user_id
    if (!uid || !group_id || !title || !date) return { code: 400, message: '缺少必要参数' }
    const member = await isGroupMember(group_id, uid)
    if (!member) return { code: 403, message: '仅群成员可发起报名' }
    const r = await createScheduleDoc({
      uid, title, date, start_time, end_time, type: type || 'event',
      scope: 'group', group_id, signup_enabled: true,
      signup_quota, signup_fields, signup_form, signup_deadline, sessions,
      reminders: [], member_name: '', description
    })
    if (!r.ok) return { code: r.code, message: r.message }
    if (draft_id) {
      try { await db.collection('signup_drafts').doc(draft_id).remove() } catch (e) {}
    }
    await logEvent({ group_id, type: 'signup_published', user_id: uid, data: { schedule_id: r.id, title } })
    await sendPublishNotify(group_id, title, date)
    return { code: 200, message: '报名已发布，已自动加入群日程', id: r.id }
  }

  // ===== 报名草稿（先填写再发布） =====
  if (action === 'saveSignupDraft') {
    const uid = user_id
    if (!uid || !title) return { code: 400, message: '缺少标题' }
    const data = {
      user_id: uid,
      group_id: group_id || '',
      title: String(title).trim(),
      date: date || '',
      start_time: start_time || '',
      end_time: end_time || '',
      type: type || 'event',
      description: description || '',
      signup_form: Array.isArray(signup_form) ? signup_form : [],
      use_sessions: !!use_sessions,
      sessions: use_sessions ? cleanSessions(sessions) : [],
      signup_quota: Number(signup_quota) || 0,
      signup_deadline: typeof signup_deadline === 'string' ? signup_deadline.trim() : '',
      updateTime: Date.now()
    }
    if (draft_id) {
      const dRes = await db.collection('signup_drafts').doc(draft_id).get()
      if (!dRes.data || dRes.data.user_id !== uid) return { code: 403, message: '草稿不存在' }
      await db.collection('signup_drafts').doc(draft_id).update(data)
      return { code: 200, message: '草稿已保存', id: draft_id }
    }
    const res = await db.collection('signup_drafts').add(data)
    return { code: 200, message: '草稿已保存', id: res.id }
  }

  if (action === 'listSignupDrafts') {
    const uid = user_id
    if (!uid) return { code: 400, message: '缺少 user_id' }
    const res = await db.collection('signup_drafts')
      .where({ user_id: uid })
      .orderBy('updateTime', 'desc')
      .limit(50)
      .get()
    return { code: 200, data: res.data || [] }
  }

  if (action === 'deleteSignupDraft') {
    const uid = user_id
    if (!draft_id || !uid) return { code: 400, message: '缺少参数' }
    const dRes = await db.collection('signup_drafts').doc(draft_id).get()
    if (!dRes.data || dRes.data.user_id !== uid) return { code: 403, message: '草稿不存在' }
    await db.collection('signup_drafts').doc(draft_id).remove()
    return { code: 200, message: '草稿已删除' }
  }

  // ===== 订阅消息授权记录（用户在群内自助开启） =====
  if (action === 'subscribeNotify') {
    const uid = user_id
    if (!uid || !template_id) return { code: 400, message: '缺少参数' }
    if (enabled) {
      await db.collection('uni-id-users').doc(uid).update({
        subscribe_templates: cmd.addToSet(template_id)
      })
    } else {
      await db.collection('uni-id-users').doc(uid).update({
        subscribe_templates: cmd.pull(template_id)
      })
    }
    return { code: 200, message: '已更新' }
  }

  // ===== 查询用户已授权的订阅模板 =====
  if (action === 'getNotifyState') {
    const uid = user_id
    if (!uid) return { code: 400, message: '缺少参数' }
    const uRes = await db.collection('uni-id-users').doc(uid).get()
    return { code: 200, data: (uRes.data && uRes.data.subscribe_templates) || [] }
  }

  // ===== 更新日程（仅创建者或群主） =====
  if (action === 'update') {
    const uid = owner_id || user_id
    if (!schedule_id || !uid) return { code: 400, message: '缺少参数' }
    const oldRes = await db.collection('schedules').doc(schedule_id).get()
    if (!oldRes.data) return { code: 404, message: '日程不存在' }
    const old = oldRes.data
    const allowed = old.owner_id === uid || (old.group_id && await isGroupOwner(old.group_id, uid))
    if (!allowed) return { code: 403, message: '仅创建者或群主可修改' }
    const finalScope = scope === 'group' ? 'group' : (old.scope === 'group' ? 'group' : 'private')
    if (finalScope === 'group' && !old.group_id && !group_id) {
      return { code: 400, message: '发布到群需指定群组' }
    }
    if (finalScope === 'group' && group_id && !(await isGroupMember(group_id, uid))) {
      return { code: 403, message: '非群成员不可发布日程到该群' }
    }
    const now = Date.now()
    const isGroupUpdate = finalScope === 'group'
    const useSessions = isGroupUpdate && (signup_enabled !== undefined ? !!signup_enabled : !!old.signup_enabled)
      ? (use_sessions !== undefined ? !!use_sessions : !!old.use_sessions)
      : false
    const sessForForm = useSessions
      ? cleanSessions(sessions !== undefined ? sessions : (old.sessions || []))
      : []
    let form = []
    let deadline = ''
    if (isGroupUpdate) {
      if (signup_form !== undefined) {
        form = cleanSignupForm(signup_form, sessForForm)
      } else if (signup_fields !== undefined) {
        form = legacyToForm(signup_fields, sessForForm)
      } else if (Array.isArray(old.signup_form) && old.signup_form.length > 0) {
        form = cleanSignupForm(old.signup_form, sessForForm)
      } else {
        form = resolveSignupForm(old)
      }
      deadline = signup_deadline !== undefined ? String(signup_deadline).trim() : (old.signup_deadline || '')
    }
    const updateData = {
      title: title !== undefined ? title : old.title,
      date: date !== undefined ? date : old.date,
      start_time: start_time !== undefined ? start_time : (old.start_time || ''),
      end_time: end_time !== undefined ? end_time : (old.end_time || ''),
      type: type !== undefined ? type : (old.type || 'other'),
      scope: finalScope,
      group_id: finalScope === 'group' ? (group_id || old.group_id || '') : '',
      signup_enabled: isGroupUpdate
        ? (signup_enabled !== undefined ? !!signup_enabled : !!old.signup_enabled)
        : false,
      signup_quota: isGroupUpdate
        ? (signup_quota !== undefined ? Math.max(Number(signup_quota) || 0, 0) : (old.signup_quota || 0))
        : 0,
      signup_fields: isGroupUpdate ? form.map(f => f.key) : [],
      signup_form: form,
      signup_deadline: deadline,
      use_sessions: useSessions,
      sessions: sessForForm,
      signup_closed: isGroupUpdate
        ? (signup_closed !== undefined ? !!signup_closed : !!old.signup_closed)
        : false,
      reminders: reminders !== undefined
        ? reminders.map(r => ({ minutes_before: Number(r.minutes_before) || 0, sent: false }))
        : (old.reminders || []),
      member_name: member_name !== undefined ? member_name : (old.member_name || ''),
      description: description !== undefined ? description : (old.description || ''),
      updateTime: now
    }
    updateData.next_remind_at = computeNextRemindAt(
      updateData.date,
      updateData.start_time,
      updateData.reminders
    )
    await db.collection('schedules').doc(schedule_id).update(updateData)
    await logHistory({ schedule_id, action: 'update', before: old, after: { ...old, ...updateData }, changed_by: uid })
    const eventGroupId = finalScope === 'group' ? (group_id || old.group_id) : old.group_id
    if (eventGroupId) {
      await logEvent({ group_id: eventGroupId, type: 'schedule_updated', user_id: uid, data: { schedule_id, title: updateData.title } })
    }
    return { code: 200, message: '已更新' }
  }

  // ===== 删除日程（仅创建者或群主） =====
  if (action === 'delete') {
    const uid = owner_id || user_id
    if (!schedule_id || !uid) return { code: 400, message: '缺少参数' }
    const oldRes = await db.collection('schedules').doc(schedule_id).get()
    if (!oldRes.data) return { code: 404, message: '日程不存在' }
    const old = oldRes.data
    const allowed = old.owner_id === uid || (old.group_id && await isGroupOwner(old.group_id, uid))
    if (!allowed) return { code: 403, message: '仅创建者或群主可删除' }
    const group_id = old.group_id
    await db.collection('schedules').doc(schedule_id).remove()
    await db.collection('signups').where({ schedule_id }).remove()
    await logHistory({ schedule_id, action: 'delete', before: old, after: null, changed_by: uid })
    if (group_id) {
      await logEvent({ group_id, type: 'schedule_deleted', user_id: uid, data: { schedule_id, title: old.title } })
    }
    return { code: 200, message: '已删除' }
  }

  // ===== 变更历史 =====
  if (action === 'history') {
    if (!schedule_id) return { code: 400, message: '缺少 schedule_id' }
    const res = await db.collection('schedule_history')
      .where({ schedule_id })
      .orderBy('changeTime', 'desc')
      .limit(50)
      .get()
    return { code: 200, data: res.data || [] }
  }

  // ===== 报名（按问卷校验，满员自动关闭，档案沉淀） =====
  if (action === 'signup') {
    if (!schedule_id || !user_id) return { code: 400, message: '缺少参数' }
    const sRes = await db.collection('schedules').doc(schedule_id).get()
    if (!sRes.data) return { code: 404, message: '日程不存在' }
    const schedule = sRes.data
    if (schedule.scope !== 'group' || !schedule.group_id) return { code: 400, message: '该日程不支持报名' }
    if (!schedule.signup_enabled) return { code: 400, message: '该日程未开放报名' }
    if (schedule.signup_closed) return { code: 400, message: '报名已关闭' }
    if (schedule.signup_deadline && Date.parse(schedule.signup_deadline) < Date.now()) {
      return { code: 400, message: '报名已截止' }
    }
    const member = await isGroupMember(schedule.group_id, user_id)
    if (!member) return { code: 403, message: '仅群成员可报名' }

    const form = resolveSignupForm(schedule)
    const clean = {}
    if (form.length === 0) {
      const nm = (form_data && form_data.name !== undefined && form_data.name !== null) ? String(form_data.name).trim() : ''
      if (!nm) return { code: 400, message: '请填写姓名' }
      clean.name = nm
    } else {
      for (const f of form) {
        const raw = form_data ? form_data[f.key] : undefined
        if (f.type === 'checkbox') {
          const arr = Array.isArray(raw)
            ? raw.map(String).map(s => s.trim()).filter(Boolean)
            : (raw !== undefined && raw !== null && raw !== '' ? String(raw).split(/[,，]/).map(s => s.trim()).filter(Boolean) : [])
          if (f.required && arr.length === 0) return { code: 400, message: `请填写${f.label}` }
          clean[f.key] = arr
          continue
        }
        const sval = (raw !== undefined && raw !== null) ? String(raw).trim() : ''
        if (f.required && !sval) return { code: 400, message: `请填写${f.label}` }
        if (!sval) continue
        if (f.type === 'number' && isNaN(Number(sval))) return { code: 400, message: `${f.label}格式不正确` }
        if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(sval)) return { code: 400, message: `${f.label}格式不正确` }
        if (f.type === 'select') {
          const opts = (f.options && f.options.length) ? f.options : (f.key === 'session' ? (schedule.sessions || []).map(s => s.name) : [])
          if (opts.length > 0 && !opts.includes(sval)) return { code: 400, message: `请选择有效的${f.label}` }
        }
        clean[f.key] = sval
      }
    }

    // 场次名额校验
    if (clean.session) {
      const sessionsArr = schedule.sessions || []
      if (sessionsArr.length > 0) {
        const sItem = sessionsArr.find(s => s.name === clean.session)
        if (sItem && sItem.quota > 0) {
          const sCnt = await db.collection('signups')
            .where({ schedule_id, status: 'signed', 'form_data.session': clean.session })
            .count()
          if (sCnt.total >= sItem.quota) return { code: 400, message: '该场次名额已满' }
        }
      }
    }

    const quota = schedule.signup_quota || 0
    if (quota > 0) {
      const cntRes = await db.collection('signups')
        .where({ schedule_id, status: 'signed' })
        .count()
      if (cntRes.total >= quota) return { code: 400, message: '名额已满，无法报名' }
    }

    const now = Date.now()
    const existingRes = await db.collection('signups')
      .where({ schedule_id, user_id })
      .get()
    if (existingRes.data && existingRes.data.length > 0) {
      await db.collection('signups').doc(existingRes.data[0]._id).update({
        status: 'signed',
        signed_at: now,
        cancelled_at: 0,
        form_data: clean
      })
    } else {
      await db.collection('signups').add({
        schedule_id, group_id: schedule.group_id, user_id,
        status: 'signed', signed_at: now, cancelled_at: 0, form_data: clean
      })
    }

    // 档案沉淀：save_to_profile 字段写回 uni-id-users
    if (!user_id.startsWith('visitor_')) {
      const profUpdate = {}
      form.forEach(f => {
        if (f.save_to_profile && clean[f.key] !== undefined && clean[f.key] !== '') {
          profUpdate[f.save_to_profile] = f.type === 'checkbox' ? clean[f.key].join(',') : clean[f.key]
        }
      })
      if (Object.keys(profUpdate).length > 0) {
        try {
          await db.collection('uni-id-users').doc(user_id).update(profUpdate)
        } catch (e) {
          console.error('signup save profile fail:', e)
        }
      }
    }

    let closed = false
    if (quota > 0) {
      const cntRes2 = await db.collection('signups')
        .where({ schedule_id, status: 'signed' })
        .count()
      if (cntRes2.total >= quota) {
        await db.collection('schedules').doc(schedule_id).update({ signup_closed: true })
        closed = true
      }
    }
    await logEvent({
      group_id: schedule.group_id, type: 'signup_added', user_id,
      data: { schedule_id, title: schedule.title, name: clean.name || '' }
    })
    await sendSignupNotify(schedule.owner_id, schedule.title, clean.name || '')
    return { code: 200, message: closed ? '报名成功，名额已满，报名已自动关闭' : '报名成功' }
  }

  // ===== 取消报名（若因满员自动关闭则重新开放） =====
  if (action === 'cancelSignup') {
    if (!schedule_id || !user_id) return { code: 400, message: '缺少参数' }
    const sRes = await db.collection('schedules').doc(schedule_id).get()
    if (!sRes.data) return { code: 404, message: '日程不存在' }
    const schedule = sRes.data
    const existingRes = await db.collection('signups')
      .where({ schedule_id, user_id, status: 'signed' })
      .get()
    if (existingRes.data && existingRes.data.length > 0) {
      const rec = existingRes.data[0]
      await db.collection('signups').doc(rec._id).update({
        status: 'cancelled',
        cancelled_at: Date.now()
      })
      if (schedule.group_id) {
        const name = (rec.form_data && rec.form_data.name) || ''
        await logEvent({
          group_id: schedule.group_id, type: 'signup_cancelled', user_id,
          data: { schedule_id, title: schedule.title, name }
        })
      }
      if (schedule.signup_closed) {
        const quota = schedule.signup_quota || 0
        const cntRes = await db.collection('signups')
          .where({ schedule_id, status: 'signed' })
          .count()
        if (quota <= 0 || cntRes.total < quota) {
          await db.collection('schedules').doc(schedule_id).update({ signup_closed: false })
        }
      }
    }
    return { code: 200, message: '已取消报名' }
  }

  // ===== 活动设置（仅创建者或群主：名称/名额/问卷/场次/开关/截止） =====
  if (action === 'updateActivity') {
    const uid = owner_id || user_id
    if (!schedule_id || !uid) return { code: 400, message: '缺少参数' }
    const oldRes = await db.collection('schedules').doc(schedule_id).get()
    if (!oldRes.data) return { code: 404, message: '日程不存在' }
    const old = oldRes.data
    const allowed = old.owner_id === uid || (old.group_id && await isGroupOwner(old.group_id, uid))
    if (!allowed) return { code: 403, message: '仅创建者或群主可修改' }
    const now = Date.now()
    const updateData = {}
    if (title !== undefined) updateData.title = String(title).trim()
    if (signup_quota !== undefined) {
      const q = Number(signup_quota) || 0
      updateData.signup_quota = q < 0 ? 0 : q
    }
    let nextSess = old.sessions
    if (sessions !== undefined) {
      nextSess = cleanSessions(sessions)
      updateData.sessions = nextSess
    }
    if (use_sessions !== undefined) {
      updateData.use_sessions = !!use_sessions
      if (!use_sessions) {
        updateData.sessions = []
        nextSess = []
      }
    }
    if (signup_form !== undefined) {
      updateData.signup_form = cleanSignupForm(signup_form, nextSess)
      updateData.signup_fields = updateData.signup_form.map(f => f.key)
    }
    if (signup_fields !== undefined && signup_form === undefined) {
      updateData.signup_form = legacyToForm(signup_fields, nextSess)
      updateData.signup_fields = Array.isArray(signup_fields) ? signup_fields : []
    }
    if (signup_deadline !== undefined) updateData.signup_deadline = String(signup_deadline).trim()
    if (signup_closed !== undefined) updateData.signup_closed = !!signup_closed
    updateData.updateTime = now
    await db.collection('schedules').doc(schedule_id).update(updateData)
    await logHistory({
      schedule_id, action: 'updateActivity',
      before: old, after: { ...old, ...updateData }, changed_by: uid
    })
    if (old.group_id) {
      await logEvent({
        group_id: old.group_id, type: 'schedule_updated', user_id: uid,
        data: { schedule_id, title: updateData.title || old.title }
      })
    }
    return { code: 200, message: '活动设置已更新' }
  }

  // ===== 报名列表（含成员档案名/备注/档案生日，含已取消） =====
  if (action === 'signups') {
    if (!schedule_id) return { code: 400, message: '缺少 schedule_id' }
    const sRes = await db.collection('schedules').doc(schedule_id).get()
    if (!sRes.data) return { code: 404, message: '日程不存在' }
    const schedule = sRes.data
    const signupRes = await db.collection('signups')
      .where({ schedule_id })
      .orderBy('signed_at', 'asc')
      .get()
    const group = schedule.group_id ? await getGroupInfo(schedule.group_id) : null
    const memberMap = {}
    if (group) {
      ;(group.members || []).forEach(m => {
        memberMap[m.user_id] = { profile_name: m.profile_name || m.nickname || '成员', group_remark: m.group_remark || '' }
      })
    }
    const data = (signupRes.data || []).map(s => ({
      ...s,
      profile_name: memberMap[s.user_id]?.profile_name || '',
      group_remark: memberMap[s.user_id]?.group_remark || ''
    }))
    const uids = [...new Set(data.map(s => s.user_id).filter(Boolean))]
    if (uids.length > 0) {
      const uRes = await db.collection('uni-id-users')
        .where({ _id: cmd.in(uids) })
        .field({ birthday: true, phone: true })
        .get()
      const userMap = {}
      ;(uRes.data || []).forEach(u => { userMap[u._id] = { birthday: u.birthday || '', phone: u.phone || '' } })
      data.forEach(s => {
        s.profile_birthday = userMap[s.user_id]?.birthday || ''
        s.profile_phone = userMap[s.user_id]?.phone || ''
      })
    }
    return { code: 200, data }
  }

  // ===== 日程详情（含解析后的问卷 + 预填数据 + 我的状态） =====
  if (action === 'detail') {
    if (!schedule_id) return { code: 400, message: '缺少 schedule_id' }
    const res = await db.collection('schedules').doc(schedule_id).get()
    if (!res.data) return { code: 404, message: '日程不存在' }
    const item = res.data
    if (user_id && item.scope === 'group' && item.group_id && !(await isGroupMember(item.group_id, user_id))) {
      return { code: 403, message: '非群成员不可查看' }
    }
    let enriched = { ...item, ...(await attachSignupCounts([item]))[0] }
    enriched.signup_form = resolveSignupForm(item)
    enriched.my_signup_status = item.scope === 'group'
      ? (await attachMyStatus([item], user_id || ''))[0].my_signup_status || 'none'
      : 'none'
    // 报名表单预填数据
    let prefill = {}
    if (item.scope === 'group') {
      const g = await getGroupInfo(item.group_id)
      const me = (g && g.members || []).find(m => m.user_id === user_id)
      if (me) prefill.name = me.group_remark || me.profile_name || ''
      if (user_id && !user_id.startsWith('visitor_')) {
        const uRes = await db.collection('uni-id-users').doc(user_id).get()
        if (uRes.data) {
          if (uRes.data.phone) prefill.phone = uRes.data.phone
          if (uRes.data.birthday) prefill.birthday = uRes.data.birthday
        }
      }
    }
    enriched.signup_prefill = prefill
    return { code: 200, data: enriched }
  }

  // ===== 生日日程 =====
  if (action === 'getBirthdays') {
    if (!user_id) return { code: 400, message: '缺少 user_id' }
    const res = await db.collection('schedules')
      .where({ owner_id: user_id, type: 'birthday' })
      .get()
    return { code: 200, data: enrichWithStatus(res.data || []) }
  }

  return { code: 400, message: '未知操作' }
}

async function isGroupOwner(gid, uid) {
  if (!gid || !uid) return false
  const res = await uniCloud.database().collection('groups')
    .where({ _id: gid, 'members.user_id': uid, 'members.role': 'owner' })
    .field({ _id: true })
    .get()
  return res.data && res.data.length > 0
}
