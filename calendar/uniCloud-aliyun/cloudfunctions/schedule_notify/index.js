const TEMPLATE_ID = process.env.SCHEDULE_NOTIFY_TMPL || 'UVDiKNJ5K6pYWCC94empCnhmVjMep3nfOmkgQmYd2J0'
const BIRTHDAY_TMPL_ID = process.env.BIRTHDAY_NOTIFY_TMPL || 'y-wxULiiW1d6CBRYU7EJqs2KGSAzCbJ5sqA3p2culuc'
const DCLOUD_APPID = '__UNI__87DED5E'

const getUniSubscribemsg = () => {
  try {
    const UniSubscribemsg = require('uni-subscribemsg')
    return new UniSubscribemsg({ dcloudAppid: DCLOUD_APPID, provider: 'weixin-mp' })
  } catch (e) {
    return null
  }
}

const sendMsg = async (touser, templateId, page, data) => {
  if (!templateId || !touser) return false
  try {
    const sender = getUniSubscribemsg()
    if (!sender) return false
    const res = await sender.sendSubscribeMessage({
      touser,
      template_id: templateId,
      page,
      miniprogram_state: 'formal',
      lang: 'zh_CN',
      data
    }).catch(e => {
      console.error('sendSubscribeMessage fail:', touser, templateId, e)
      return null
    })
    if (res && res.errCode && res.errCode !== 0) {
      console.error('sendSubscribeMessage err:', touser, templateId, JSON.stringify(res))
      return false
    }
    return true
  } catch (e) {
    console.error('sendMsg fail:', touser, templateId, e)
    return false
  }
}

const todayCn = (offset = 8) => {
  return new Date(Date.now() + offset * 3600 * 1000).toISOString().slice(0, 10)
}

const calcAge = (birthday) => {
  const p = String(birthday || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return ''
  const [y, m, d] = p.split('-').map(Number)
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  let age = now.getUTCFullYear() - y
  const curMonth = now.getUTCMonth() + 1
  const curDay = now.getUTCDate()
  if (curMonth < m || (curMonth === m && curDay < d)) age -= 1
  return String(Math.max(age, 0))
}

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

exports.main = async (event, context) => {
  const db = uniCloud.database()
  const cmd = db.command
  const now = Date.now()
  const triggerName = String((event && (event.TriggerName || event.triggerName)) || '')
  const onlyBirthday = triggerName.indexOf('birthday') !== -1

  let birthdaySent = 0
  let sent = 0
  let backfilled = 0

  // 生日：独立 cron（每天 9:00），或手动调用且处于 9 点窗口时兜底一次
  if (onlyBirthday || !triggerName) {
    const hour = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours()
    const minute = new Date(Date.now() + 8 * 3600 * 1000).getUTCMinutes()
    if (onlyBirthday || (hour === 9 && minute < 5)) {
      try {
        birthdaySent = await runBirthdayNotify(db, cmd, now)
      } catch (e) {
        console.error('birthday notify fail:', e)
      }
    }
  }

  // 日程提醒：仅由 schedule 定时器 / 手动调用执行（生日触发器不扫日程）
  if (!onlyBirthday) {
    try {
      backfilled = await backfillNextRemindAt(db, cmd)
    } catch (e) {
      console.error('backfill next_remind_at fail:', e)
    }
    try {
      sent = await runScheduleRemind(db, cmd, now)
    } catch (e) {
      console.error('schedule remind fail:', e)
    }
  }

  return { code: 200, sent, birthdaySent, backfilled }
}

// 兼容旧数据：补写 next_remind_at，每轮最多 50 条，避免长期全表扫描
async function backfillNextRemindAt(db, cmd) {
  const res = await db.collection('schedules')
    .where({
      start_time: cmd.neq(''),
      next_remind_at: cmd.exists(false)
    })
    .limit(50)
    .get()
  const list = res.data || []
  let n = 0
  for (const s of list) {
    const next = computeNextRemindAt(s.date, s.start_time, s.reminders || [])
    await db.collection('schedules').doc(s._id).update({ next_remind_at: next })
    n++
  }
  return n
}

async function runScheduleRemind(db, cmd, now) {
  // 只拉「已到点」的待提醒日程
  const res = await db.collection('schedules')
    .where({
      next_remind_at: cmd.and(cmd.gt(0), cmd.lte(now))
    })
    .orderBy('next_remind_at', 'asc') // 同一轮优先处理最早到点，杜绝 >100 条时随机跳过（T1）
    .limit(100)
    .get()

  const candidates = res.data || []
  const pending = [] // { schedule, dueIdx }

  for (const s of candidates) {
    if (!s.start_time || !Array.isArray(s.reminders) || s.reminders.length === 0) {
      await db.collection('schedules').doc(s._id).update({ next_remind_at: 0 })
      continue
    }
    const scheduleTime = new Date(`${s.date}T${s.start_time}:00`).getTime()
    if (isNaN(scheduleTime) || scheduleTime < now) {
      // 已过期：清掉待提醒
      const reminders = (s.reminders || []).map(r => ({ ...r, sent: true }))
      await db.collection('schedules').doc(s._id).update({ reminders, next_remind_at: 0 })
      continue
    }
    // 收集本次到点的提醒下标（先不置 sent，发送成功后才置）
    const due = []
    s.reminders.forEach((r, i) => {
      if (r.sent) return
      const fireTime = scheduleTime - (Number(r.minutes_before) || 0) * 60000
      if (now >= fireTime) due.push(i)
    })
    if (due.length === 0) {
      // next_remind_at 不准时重算
      const next = computeNextRemindAt(s.date, s.start_time, s.reminders)
      if (next !== s.next_remind_at) {
        await db.collection('schedules').doc(s._id).update({ next_remind_at: next })
      }
      continue
    }
    pending.push({ schedule: s, due })
  }

  let sent = 0
  for (const p of pending) {
    const s = p.schedule
    try {
      const openids = await getRecipientOpenids(db, cmd, s)
      if (TEMPLATE_ID) {
        for (const openid of openids) {
          await sendMsg(openid, TEMPLATE_ID, 'pages/schedule/schedule', {
            name1: { value: (s.member_name || '日程提醒').slice(0, 20) },
            date2: { value: s.date || '' },
            thing3: { value: (s.title || '').slice(0, 20) },
            thing4: { value: (s.description || '').slice(0, 20) },
            time13: { value: s.start_time || '' }
          })
        }
      }
      // 发送成功才置 sent（M-6/G-05：失败保持未发，下轮重发）
      const reminders = s.reminders.map((r, i) => (p.due.includes(i) ? { ...r, sent: true } : r))
      const next = computeNextRemindAt(s.date, s.start_time, reminders)
      await db.collection('schedules').doc(s._id).update({
        reminders,
        next_remind_at: next
      })
      if (s.scope === 'group' && s.group_id) {
        const dup = await db.collection('group_events')
          .where({ group_id: s.group_id, type: 'schedule_starting', 'data.schedule_id': s._id })
          .limit(1)
          .get()
        if (!dup.data || dup.data.length === 0) {
          await db.collection('group_events').add({
            group_id: s.group_id,
            type: 'schedule_starting',
            user_id: s.owner_id || '',
            data: { schedule_id: s._id, title: s.title, date: s.date, start_time: s.start_time },
            createTime: now
          })
        }
      }
      sent++
    } catch (e) {
      console.error('notify schedule fail:', s._id, e)
    }
  }
  return sent
}

async function getRecipientOpenids(db, cmd, schedule) {
  const userIds = new Set()
  if (schedule.owner_id) userIds.add(schedule.owner_id)
  if (schedule.scope === 'group' && schedule.group_id) {
    if (schedule.signup_enabled) {
      const sRes = await db.collection('signups')
        .where({ schedule_id: schedule._id, status: 'signed' })
        .field({ user_id: true })
        .get()
      ;(sRes.data || []).forEach(s => usersAdd(userIds, s.user_id))
    } else {
      const gRes = await db.collection('groups').doc(schedule.group_id).get()
      if (gRes.data) {
        ;(gRes.data.members || []).forEach(m => usersAdd(userIds, m.user_id))
      }
    }
  }
  const ids = Array.from(userIds)
  if (ids.length === 0) return []
  const uRes = await db.collection('uni-id-users')
    .where({ _id: cmd.in(ids), subscribe_templates: TEMPLATE_ID })
    .field({ openid: true })
    .get()
  return (uRes.data || []).map(u => u.openid).filter(Boolean)
}

function usersAdd(set, id) {
  if (id) set.add(id)
}

async function runBirthdayNotify(db, cmd, now) {
  const date = todayCn()
  const mmdd = date.slice(5)
  // 分批拉取当天生日用户，避免 .limit(100) 漏掉第 101+ 位
  const birthdayUsers = []
  const PB = 100
  let skip = 0
  for (;;) {
    const res = await db.collection('uni-id-users')
      .where({ birthday: db.RegExp({ regexp: `\\d{4}-${mmdd}`, options: '' }) })
      .field({ _id: true, nickname: true, birthday: true })
      .skip(skip).limit(PB)
      .get()
    const rows = (res.data || []).filter(u => u && u._id && !u._id.startsWith('visitor_'))
    birthdayUsers.push(...rows)
    if ((res.data || []).length < PB) break
    skip += PB
  }
  if (birthdayUsers.length === 0) return 0

  let sent = 0
  for (const bu of birthdayUsers) {
    // 分批拉取该生日用户所在群，避免 .limit(50) 漏群
    const groups = []
    let gskip = 0
    for (;;) {
      const gRes = await db.collection('groups')
        .where({ 'members.user_id': bu._id })
        .field({ _id: true, group_name: true, members: true })
        .skip(gskip).limit(50)
        .get()
      const gRows = gRes.data || []
      groups.push(...gRows)
      if (gRows.length < 50) break
      gskip += 50
    }
    for (const g of groups) {
      const members = g.members || []
      const me = members.find(m => m.user_id === bu._id)
      const birthdayName = (me && (me.group_remark || me.profile_name)) || bu.nickname || 'TA'
      const age = calcAge(bu.birthday)
      const others = members.filter(m => m.user_id && m.user_id !== bu._id)
      if (others.length === 0) continue
      const ids = others.map(m => m.user_id)
      const u2Res = await db.collection('uni-id-users')
        .where({ _id: cmd.in(ids), subscribe_templates: BIRTHDAY_TMPL_ID })
        .field({ openid: true })
        .get()
      if ((u2Res.data || []).length === 0) continue
      const dup = await db.collection('group_events')
        .where({ group_id: g._id, type: 'birthday_notify', 'data.user_id': bu._id, 'data.date': date })
        .limit(1)
        .get()
      if (dup.data && dup.data.length > 0) continue
      for (const u2 of u2Res.data) {
        if (!u2.openid) continue
        const ok = await sendMsg(u2.openid, BIRTHDAY_TMPL_ID, 'pages/schedule/schedule', {
          name1: { value: birthdayName.slice(0, 20) },
          thing9: { value: `今天是 ${birthdayName} 的生日，记得送上祝福哦`.slice(0, 20) },
          number10: { value: age },
          thing5: { value: '快去群里送上祝福吧' },
          thing6: { value: `${date.slice(5, 7)}月${date.slice(8, 10)}日` }
        })
        if (ok) sent++
      }
      await db.collection('group_events').add({
        group_id: g._id,
        type: 'birthday_notify',
        user_id: bu._id,
        data: { user_id: bu._id, name: birthdayName, date },
        createTime: now
      })
    }
  }
  return sent
}
