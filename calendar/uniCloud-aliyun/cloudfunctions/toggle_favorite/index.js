const crypto = require('crypto')

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex')
}

// Phase 1 统一鉴权：由 event.token 解析真实 uid，不再信任 event.user_id
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

  const { action, date, content, author, source, month } = event

  // write 类操作：游客需登录
  if (action === 'add' || action === 'remove') {
    if (u.isVisitor) return { code: 401, message: '请先登录' }
  }

  // list: 获取用户所有收藏
  if (action === 'list') {
    const res = await db.collection('user_favorites')
      .where({ user_id: uid })
      .orderBy('createTime', 'desc')
      .get()
    return { code: 200, data: res.data || [] }
  }

  // getMarks: 收藏 + 个人日程 + 已报名群日程，用于日历打点（Phase 3）
  if (action === 'getMarks') {
    if (month) {
      const next = nextMonth(month)
      const marks = await queryMarksByMonth(db, uid, month, next)
      return { code: 200, data: marks }
    }
    // 无 month → 全量（兼容旧前端）
    const allFavs = await db.collection('user_favorites')
      .where({ user_id: uid }).field({ date: true }).get()
    const allScheds = await db.collection('schedules')
      .where({ owner_id: uid }).field({ date: true }).get()
    const marks = [
      ...(allFavs.data || []).map(i => ({ date: i.date, info: '已收藏' })),
      ...(allScheds.data || []).map(i => ({ date: i.date, info: '日程' }))
    ]
    return { code: 200, data: marks }
  }

  // check: 单条查重（兼容，前端改走 checkBatch）
  if (action === 'check') {
    if (!date || !content) return { code: 400, message: '缺少参数' }
    const hash = sha256(content)
    const existing = await db.collection('user_favorites')
      .where({ user_id: uid, date, content_hash: hash }).get()
    return { code: 200, isFavorited: existing.data && existing.data.length > 0 }
  }

  // checkBatch: 一次批量判定收藏状态（R1，消除 N+1）
  if (action === 'checkBatch') {
    const items = event.items || [] // [{date, content}]
    if (!items.length) return { code: 200, data: [] }
    const hashes = items.map(i => sha256(i.content))
    const res = await db.collection('user_favorites')
      .where({ user_id: uid, content_hash: db.command.in(hashes) })
      .field({ date: true, content_hash: true })
      .get()
    const set = new Set((res.data || []).map(r => r.date + '|' + r.content_hash))
    const data = items.map(i => ({ date: i.date, content: i.content, isFavorited: set.has(i.date + '|' + sha256(i.content)) }))
    return { code: 200, data }
  }

  // search: 收藏搜索（Phase 3.4）
  if (action === 'search') {
    const keyword = (event.keyword || '').toString().trim().toLowerCase()
    if (!keyword) return { code: 200, data: [] }
    const res = await db.collection('user_favorites')
      .where({ user_id: uid }).limit(500).get()
    const matched = (res.data || []).filter(i =>
      (i.content || '').toLowerCase().includes(keyword) ||
      (i.author || '').toLowerCase().includes(keyword)
    )
    return { code: 200, data: matched }
  }

  if (action !== 'add' && action !== 'remove') {
    return { code: 400, message: '未知操作' }
  }

  // add / remove：需要 date 和 content
  if (!date || !content) {
    return { code: 400, message: '缺少必要参数' }
  }
  const hash = sha256(content)

  // 幂等查重（Phase 5.2）：优先按 content_hash；旧数据退化回落子）
  const findExist = async () => {
    const r1 = await db.collection('user_favorites')
      .where({ user_id: uid, date, content_hash: hash }).get()
    if (r1.data && r1.data.length) return r1.data[0]
    const r2 = await db.collection('user_favorites')
      .where({ user_id: uid, date, content }).get()
    return (r2.data && r2.data[0]) || null
  }

  if (action === 'add') {
    const existing = await findExist()
    if (existing) return { code: 200, message: '已收藏', isFavorited: true }
    try {
      await db.collection('user_favorites').add({
        user_id: uid, date, content, content_hash: hash,
        author: author || '', source: source || '', createTime: Date.now()
      })
      return { code: 200, message: '收藏成功', isFavorited: true }
    } catch (e) {
      // 唯一索引冲突 = 并发下已收藏
      return { code: 200, message: '已收藏', isFavorited: true }
    }
  } else if (action === 'remove') {
    const existing = await findExist()
    if (existing) {
      await db.collection('user_favorites').doc(existing._id).remove()
    }
    return { code: 200, message: '取消收藏', isFavorited: false }
  }

  return { code: 400, message: '未知操作' }
}

// 按月查询打点：收藏 + 个人日程(owner_id) + 已报名群日程
async function queryMarksByMonth(db, uid, month, next) {
  const favs = await db.collection('user_favorites')
    .where({ user_id: uid, date: db.command.gte(month + '-00').and(db.command.lt(next)) })
    .field({ date: true }).get()

  const owned = await db.collection('schedules')
    .where({ owner_id: uid, date: db.command.gte(month + '-00').and(db.command.lt(next)) })
    .field({ date: true }).get()

  // 已报名群日程：signups(signed) → schedules
  const signupRes = await db.collection('signups')
    .where({ user_id: uid, status: 'signed' }).field({ schedule_id: true }).limit(200).get()
  const sids = (signupRes.data || []).map(s => s.schedule_id)
  let signed = []
  if (sids.length) {
    const sRes = await db.collection('schedules')
      .where({ _id: db.command.in(sids), date: db.command.gte(month + '-00').and(db.command.lt(next)) })
      .field({ date: true }).get()
    signed = sRes.data || []
  }

  return [
    ...(favs.data || []).map(i => ({ date: i.date, info: '已收藏' })),
    ...(owned.data || []).map(i => ({ date: i.date, info: '日程' })),
    ...signed.map(i => ({ date: i.date, info: '报名' }))
  ]
}

function nextMonth(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}
