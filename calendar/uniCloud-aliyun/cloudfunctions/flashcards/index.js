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
  const u = await resolveUid(context, event)
  if (u.code) return u
  const uid = u.uid

  const { action, front, back, deck, card_id, keyword, status, new_status } = event

  // 写操作：游客需登录
  if (action === 'create' || action === 'updateStatus' || action === 'delete') {
    if (u.isVisitor) return { code: 401, message: '请先登录' }
  }

  // 创建卡片
  if (action === 'create') {
    if (!front || !back) return { code: 400, message: '正面和背面不能为空' }
    const res = await db.collection('flashcards').add({
      user_id: uid,
      front,
      back,
      deck: deck || '默认',
      status: 'review',
      createTime: Date.now()
    })
    return { code: 200, message: '创建成功', id: res.id }
  }

  // 获取用户所有卡片
  if (action === 'list') {
    const where = { user_id: uid }
    if (status) where.status = status
    const res = await db.collection('flashcards')
      .where(where)
      .orderBy('createTime', 'desc')
      .get()
    return { code: 200, data: res.data || [] }
  }

    // 搜索卡片（R6：分页；拉取更大上限后内存过滤，避免 >500 断档）
  if (action === 'search') {
    if (!keyword) return { code: 200, data: [], total: 0 }
    const kw = keyword.toLowerCase()
    const page = Math.max(parseInt(event.page) || 1, 1)
    const pageSize = Math.min(Math.max(parseInt(event.page_size) || 20, 1), 50)
    const res = await db.collection('flashcards')
      .where({ user_id: uid })
      .orderBy('createTime', 'desc')
      .limit(2000)
      .get()
    const all = res.data || []
    const matched = all.filter(item =>
      (item.front && item.front.toLowerCase().includes(kw)) ||
      (item.back && item.back.toLowerCase().includes(kw))
    )
    const total = matched.length
    const start = (page - 1) * pageSize
    return { code: 200, data: matched.slice(start, start + pageSize), total, page, pageSize }
  }

  // 切换卡片状态 review ↔ library
  if (action === 'updateStatus') {
    if (!card_id || !new_status) return { code: 400, message: '缺少参数' }
    const exist = await db.collection('flashcards').doc(card_id).get()
    if (!exist.data || exist.data.user_id !== uid) return { code: 403, message: '无权限操作该卡片' }
    await db.collection('flashcards').doc(card_id).update({ status: new_status })
    return { code: 200, message: '更新成功' }
  }

  // 删除卡片
  if (action === 'delete') {
    if (!card_id) return { code: 400, message: '缺少 card_id' }
    const exist = await db.collection('flashcards').doc(card_id).get()
    if (!exist.data || exist.data.user_id !== uid) return { code: 403, message: '无权限删除该卡片' }
    await db.collection('flashcards').doc(card_id).remove()
    return { code: 200, message: '删除成功' }
  }

  return { code: 400, message: '未知操作' }
}
