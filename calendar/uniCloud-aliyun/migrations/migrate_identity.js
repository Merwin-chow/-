/**
 * 存量数据身份映射迁移脚本（Phase 7）
 * --------------------------------
 * 场景：旧版把「token 哈希」写入集合的 user_id 等字段，需把其映射回真实 uid
 *      （uni-id-users._id）。uni-id-token 表记录了 token -> user_id（真实 uid）的对应关系。
 *
 * 设计原则：
 *  - 幂等：以 content_hash / _id 判定，重复执行安全。
 *  - 保守：仅处理「在 uni-id-token 中能命中 token 的用户」，其余（已是真实 uid、
 *          游客 visitor_*、查无 token 对应）跳过并在日志记录。
 *  - 分批：对可能超过 `in` 上限的集合分批处理，避免 cmd.in 数量超限（并存 G-06）。
 *
 * 运行：临时注册为云函数后手动/定时调用一次；执行完删除该云函数。
 *       exports.main 入口；也可用 `migrateAll(db)` 复用。
 */

/**
 * 收集「token 哈希 → 真实 uid」映射（一次性拉取 uni-id-token）
 */
async function buildTokenMap(db, cmd) {
  const map = {}
  const BATCH = 500
  let skip = 0
  let total = 0
  for (;;) {
    const res = await db.collection('uni-id-token')
      .field({ token: true, user_id: true })
      .skip(skip).limit(BATCH).get()
    const rows = res.data || []
    if (!rows.length) break
    rows.forEach(r => {
      if (r.token && r.user_id) map[r.token] = r.user_id
    })
    total += rows.length
    skip += rows.length
    if (rows.length < BATCH) break
  }
  console.log(`[migrate] uni-id-token 映射条数: ${Object.keys(map).length}（总读取 ${total}）`)
  return map
}

/**
 * 读取某集合里所有「可被 token 命中的 user_id 候选」并分组回写。
 * @param {string} coll 集合名
 * @param {string} field 存储旧 token 的字段（支持点路径，如 'members.user_id'）
 */
function buildMigrater(db, cmd) {
  const migrateField = async (coll, field, tokenMap) => {
    const BATCH = 200
    let updated = 0
    let skip = 0
    const processed = new Set()
    for (;;) {
      const res = await db.collection(coll)
        .field({ _id: true, [field]: true })
        .skip(skip).limit(BATCH).get()
      const rows = res.data || []
      if (!rows.length) break
      for (const row of rows) {
        const raw = field.includes('.') ? (row[field.split('.')[0]] || []) : row[field]
        if (Array.isArray(raw)) {
          // 嵌套数组：如 groups.members[].user_id，逐条 update 需按索引，这里收集顶层数组整体待回写
          let changed = false
          const mapped = raw.map(m => {
            if (m && m.user_id && tokenMap[m.user_id] && !(m.user_id + '').startsWith && !processed.has(m.user_id)) {
              // 命中 token -> 真实 uid
              processed.add(m.user_id)
            }
            if (m && tokenMap[m.user_id] && m.user_id !== tokenMap[m.user_id]) {
              changed = true
              return { ...m, user_id: tokenMap[m.user_id] }
            }
            return m
          })
          if (changed) {
            await db.collection(coll).doc(row._id).update({ [field.split('.')[0]]: mapped })
            updated++
          }
        } else if (typeof raw === 'string' && tokenMap[raw] && raw !== tokenMap[raw]) {
          await db.collection(coll).doc(row._id).update({ [field]: tokenMap[raw] })
          updated++
        }
      }
      skip += rows.length
      if (rows.length < BATCH) break
    }
    console.log(`[migrate] ${coll}.${field} 命中回写: ${updated}`)
    return updated
  }
  return { migrateField }
}

async function migrateAll(db, cmd) {
  const tokenMap = await buildTokenMap(db, cmd)
  const size = Object.keys(tokenMap).length
  if (!size) {
    console.log('[migrate] 无 token 映射，跳过（可能已是新数据或无 uni-id-token）。')
    return { done: true, updated: 0 }
  }
  const { migrateField } = buildMigrater(db, cmd)
  const tasks = [
    ['signups', 'user_id'],
    ['signup_drafts', 'user_id'],
    ['user_favorites', 'user_id'],
    ['flashcards', 'user_id'],
    ['groups', 'creator_id'],
    ['groups', 'members.user_id']
  ]
  const stats = {}
  for (const [coll, field] of tasks) {
    stats[`${coll}.${field}`] = await migrateField(coll, field, tokenMap)
  }

  // schedules：旧字段 user_id（token）→ 新增 owner_id（真实 uid）；仅当 owner_id 缺失时回填
  // 避免覆盖 Phase 2 后新建的 owner_id
  const BATCH = 200
  let schedUpdated = 0
  let skip = 0
  for (;;) {
    const res = await db.collection('schedules')
      .field({ _id: true, user_id: true, owner_id: true })
      .skip(skip).limit(BATCH).get()
    const rows = res.data || []
    if (!rows.length) break
    for (const row of rows) {
      const legacy = row.user_id
      if (!row.owner_id && legacy && tokenMap[legacy]) {
        await db.collection('schedules').doc(row._id).update({
          owner_id: tokenMap[legacy],
          // 可选：清理旧 user_id 字段避免后续误用（uniCloud update 不能直接 unset，
          // 这里置空即可；如需彻底删除可在控制台批处理）
          user_id: ''
        })
        schedUpdated++
      }
    }
    skip += rows.length
    if (rows.length < BATCH) break
  }
  console.log(`[migrate] schedules 回填 owner_id: ${schedUpdated}`)
  stats['schedules.owner_id'] = schedUpdated

  return { done: true, updated: Object.values(stats).reduce((a, b) => a + b, 0), stats }
}

exports.main = async (event, context) => {
  const db = uniCloud.database()
  const cmd = db.command
  try {
    const result = await migrateAll(db, cmd)
    return { code: 200, message: '迁移完成', data: result }
  } catch (e) {
    console.error('[migrate] fail:', e)
    return { code: 500, message: String((e && e.message) || e) }
  }
}
