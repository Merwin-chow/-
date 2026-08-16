exports.main = async (event, context) => {
  const db = uniCloud.database()
  const { action, user_id, date, content, author, source } = event

  if (!user_id) {
    return { code: 400, message: '缺少 user_id' }
  }

  // list: 获取用户所有收藏
  if (action === 'list') {
    const res = await db.collection('user_favorites')
      .where({ user_id })
      .orderBy('createTime', 'desc')
      .get()
    return { code: 200, data: res.data || [] }
  }

  // getMarks: 查询用户所有收藏日期 + 日程日期，用于日历打点
  if (action === 'getMarks') {
    const allFavs = await db.collection('user_favorites')
      .where({ user_id })
      .field({ date: true })
      .get()
    const allSchedules = await db.collection('schedules')
      .where({ user_id })
      .field({ date: true })
      .get()
    const marks = [
      ...(allFavs.data || []).map(item => ({ date: item.date, info: '已收藏' })),
      ...(allSchedules.data || []).map(item => ({ date: item.date, info: '日程' }))
    ]
    return { code: 200, data: marks }
  }

  // check: 查询是否已收藏
  if (action === 'check') {
    if (!date || !content) return { code: 400, message: '缺少参数' }
    const existing = await db.collection('user_favorites')
      .where({ user_id, date, content })
      .get()
    return {
      code: 200,
      isFavorited: existing.data && existing.data.length > 0
    }
  }

  // add / remove: 需要 date 和 content
  if (!date || !content) {
    return { code: 400, message: '缺少必要参数' }
  }

  const existing = await db.collection('user_favorites')
    .where({ user_id, date, content })
    .get()

  if (action === 'add') {
    if (existing.data && existing.data.length > 0) {
      return { code: 200, message: '已收藏', isFavorited: true }
    }
    await db.collection('user_favorites').add({
      user_id,
      date,
      content,
      author: author || '',
      source: source || '',
      createTime: Date.now()
    })
    return { code: 200, message: '收藏成功', isFavorited: true }

  } else if (action === 'remove') {
    if (existing.data && existing.data.length > 0) {
      await db.collection('user_favorites')
        .where({ user_id, date, content })
        .remove()
    }
    return { code: 200, message: '取消收藏', isFavorited: false }
  }

  return { code: 400, message: '未知操作' }
}
