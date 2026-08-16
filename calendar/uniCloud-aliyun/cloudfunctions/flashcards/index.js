exports.main = async (event, context) => {
  const db = uniCloud.database()
  const { action, user_id, front, back, deck, card_id, keyword, status, new_status } = event

  if (!user_id) {
    return { code: 400, message: '缺少 user_id' }
  }

  // 创建卡片
  if (action === 'create') {
    if (!front || !back) return { code: 400, message: '正面和背面不能为空' }
    const res = await db.collection('flashcards').add({
      user_id,
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
    const where = { user_id }
    if (status) where.status = status
    const res = await db.collection('flashcards')
      .where(where)
      .orderBy('createTime', 'desc')
      .get()
    return { code: 200, data: res.data || [] }
  }

  // 搜索卡片
  if (action === 'search') {
    if (!keyword) return { code: 200, data: [] }
    const kw = keyword.toLowerCase()
    const res = await db.collection('flashcards')
      .where({ user_id })
      .orderBy('createTime', 'desc')
      .limit(500)
      .get()
    const all = res.data || []
    const matched = all.filter(item =>
      (item.front && item.front.toLowerCase().includes(kw)) ||
      (item.back && item.back.toLowerCase().includes(kw))
    )
    return { code: 200, data: matched }
  }

  // 切换卡片状态 review ↔ library
  if (action === 'updateStatus') {
    if (!card_id || !new_status) return { code: 400, message: '缺少参数' }
    await db.collection('flashcards').doc(card_id).update({ status: new_status })
    return { code: 200, message: '更新成功' }
  }

  // 删除卡片
  if (action === 'delete') {
    if (!card_id) return { code: 400, message: '缺少 card_id' }
    await db.collection('flashcards').doc(card_id).remove()
    return { code: 200, message: '删除成功' }
  }

  return { code: 400, message: '未知操作' }
}
