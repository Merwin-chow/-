// Phase 2 统一鉴权：由 event.token 解析真实 uid，不再信任 event.user_id
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
  // token 身份覆盖 event.user_id：以下所有 body 中的 user_id 均指已解析的身份
  const user_id = uid

  const {
    action, profile_name, group_remark, group_id, group_name,
    description, invite_code, target_user_id
  } = event

  // 群操作/写操作：游客需登录
  const requiresLogin = ['create', 'join', 'setRemark', 'leave', 'disband']
  if (requiresLogin.includes(action) && u.isVisitor) {
    return { code: 401, message: '请先登录' }
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

  const getUserProfileName = async (uid) => {
    if (!uid || uid.startsWith('visitor_')) return '游客'
    const res = await db.collection('uni-id-users').doc(uid).get()
    return (res.data && res.data.nickname) || '微信用户'
  }

  // 创建群组
  if (action === 'create') {
    if (!user_id || !group_name) return { code: 400, message: '缺少参数' }
    const code = generateInviteCode()
    const pname = profile_name || (await getUserProfileName(user_id))
    const res = await db.collection('groups').add({
      group_name,
      creator_id: user_id,
      invite_code: code,
      members: [{
        user_id,
        role: 'owner',
        profile_name: pname,
        group_remark: group_remark || pname,
        joinTime: Date.now()
      }],
      description: description || '',
      createTime: Date.now()
    })
    return { code: 200, message: '创建成功', data: { group_id: res.id, invite_code: code } }
  }

  // 通过邀请码加入群组
  if (action === 'join') {
    if (!user_id || !invite_code) return { code: 400, message: '缺少参数' }
    const groupRes = await db.collection('groups')
      .where({ invite_code })
      .get()
    if (!groupRes.data || groupRes.data.length === 0) {
      return { code: 404, message: '邀请码无效' }
    }
    const group = groupRes.data[0]
    const alreadyMember = group.members.some(m => m.user_id === user_id)
    if (alreadyMember) {
      return { code: 200, message: '你已在该群组中', data: { group_id: group._id } }
    }
    const pname = await getUserProfileName(user_id)
    await db.collection('groups').doc(group._id).update({
      members: db.command.push({
        user_id,
        role: 'member',
        profile_name: pname,
        group_remark: group_remark || pname,
        joinTime: Date.now()
      })
    })
    await logEvent({ group_id: group._id, type: 'member_joined', user_id, data: { profile_name: pname } })
    return { code: 200, message: '加入成功', data: { group_id: group._id, group_name: group.group_name } }
  }

  // 获取我加入的群组列表
  if (action === 'myGroups') {
    if (!user_id) return { code: 400, message: '缺少 user_id' }
    const res = await db.collection('groups')
      .where({ 'members.user_id': user_id })
      .orderBy('createTime', 'desc')
      .get()
    const data = (res.data || []).map(g => {
      const me = (g.members || []).find(m => m.user_id === user_id)
      return {
        ...g,
        my_role: me ? me.role : '',
        my_remark: me ? (me.group_remark || me.profile_name || '') : ''
      }
    })
    return { code: 200, data }
  }

  // 获取群组详情（含成员档案名/备注/生日）
  if (action === 'detail') {
    if (!user_id || !group_id) return { code: 400, message: '缺少参数' }
    const res = await db.collection('groups').doc(group_id).get()
    if (!res.data) return { code: 404, message: '群组不存在' }
    const isMember = (res.data.members || []).some(m => m.user_id === user_id)
    if (!isMember) return { code: 403, message: '非群成员不可查看' }
    const group = res.data
    const members = group.members || []
    const uids = [...new Set(members.map(m => m.user_id).filter(Boolean))]
    let birthdayMap = {}
    if (uids.length > 0) {
      const uRes = await db.collection('uni-id-users')
        .where({ _id: cmd.in(uids) })
        .field({ birthday: true })
        .get()
      ;(uRes.data || []).forEach(u => {
        if (u.birthday) birthdayMap[u._id] = u.birthday
      })
    }
    return { code: 200, data: { ...group, members: members.map(m => ({ ...m, birthday: birthdayMap[m.user_id] || '' })) } }
  }

  // 设置群内备注（群主可改所有人；成员可改自己）
  if (action === 'setRemark') {
    if (!user_id || !group_id) return { code: 400, message: '缺少参数' }
    if (!group_remark) return { code: 400, message: '备注不能为空' }
    const groupRes = await db.collection('groups').doc(group_id).get()
    if (!groupRes.data) return { code: 404, message: '群组不存在' }
    const group = groupRes.data
    const me = (group.members || []).find(m => m.user_id === user_id)
    if (!me) return { code: 403, message: '非群成员不可操作' }
    const target = target_user_id || user_id
    if (target !== user_id && me.role !== 'owner') {
      return { code: 403, message: '仅群主可修改他人备注' }
    }
    const updatedMembers = (group.members || []).map(m => {
      if (m.user_id === target) {
        return { ...m, group_remark: group_remark }
      }
      return m
    })
    await db.collection('groups').doc(group_id).update({ members: updatedMembers })
    return { code: 200, message: '备注已更新' }
  }

  // 群动态流
  if (action === 'events') {
    if (!user_id || !group_id) return { code: 400, message: '缺少参数' }
    const groupRes = await db.collection('groups').doc(group_id).get()
    if (!groupRes.data) return { code: 404, message: '群组不存在' }
    const isMember = (groupRes.data.members || []).some(m => m.user_id === user_id)
    if (!isMember) return { code: 403, message: '非群成员不可查看' }
    const res = await db.collection('group_events')
      .where({ group_id })
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
    const memberMap = {}
    ;(groupRes.data.members || []).forEach(m => {
      memberMap[m.user_id] = m.group_remark || m.profile_name || m.nickname || '成员'
    })
    const data = (res.data || []).map(ev => ({
      ...ev,
      actor_name: memberMap[ev.user_id] || '成员'
    }))
    return { code: 200, data }
  }

  // 退出群组
  if (action === 'leave') {
    if (!user_id || !group_id) return { code: 400, message: '缺少参数' }
    const groupRes = await db.collection('groups').doc(group_id).get()
    if (!groupRes.data) return { code: 404, message: '群组不存在' }
    const group = groupRes.data
    const me = (group.members || []).find(m => m.user_id === user_id)
    if (!me) return { code: 400, message: '你不在该群组中' }
    if (group.creator_id === user_id) {
      return { code: 400, message: '群主不能退出，请先转让群主' }
    }
    await db.collection('groups').doc(group_id).update({
      members: db.command.pull({ user_id })
    })
    await logEvent({ group_id, type: 'member_left', user_id, data: { profile_name: me.group_remark || me.profile_name || '' } })
    return { code: 200, message: '已退出' }
  }

  // 解散群组（仅群主，级联清理）
  if (action === 'disband') {
    if (!user_id || !group_id) return { code: 400, message: '缺少参数' }
    const groupRes = await db.collection('groups').doc(group_id).get()
    if (!groupRes.data) return { code: 404, message: '群组不存在' }
    if (groupRes.data.creator_id !== user_id) {
      return { code: 403, message: '仅群主可解散' }
    }
    await db.collection('groups').doc(group_id).remove()
    await db.collection('schedules').where({ group_id, scope: 'group' }).remove()
    await db.collection('signups').where({ group_id }).remove()
    await db.collection('group_events').where({ group_id }).remove()
    return { code: 200, message: '已解散' }
  }

  return { code: 400, message: '未知操作' }
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
