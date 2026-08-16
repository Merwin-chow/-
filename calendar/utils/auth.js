/**
 * 统一身份获取工具（Phase 1）
 *
 * 身份优先级：
 *   1. 登录态：current_user_id（稳定 uid = uni-id-users._id）
 *   2. 异常态：有 token 无 uid → 视为本地数据待刷新，仍给游客兜底 id，
 *      但云函数端以 token 为准进行真实鉴权（resolveUid）
 *   3. 游客态：visitor_ 前缀本地 id
 *
 * M-10 / G-02：getUid() 恒返回非空字符串，避免页面因空 uid 抛错。
 */

export function getUid() {
  const uid = uni.getStorageSync('current_user_id')
  if (uid) return uid // 登录态：稳定 uid
  // 有 token 无 uid：异常态，给游客兜底 id（云函数仍按 token 鉴权）
  const visitorId = uni.getStorageSync('visitor_id') || genVisitorId()
  return 'visitor_' + visitorId // 登录态缺失/游客态统一走游客兜底
}

export function getToken() {
  return uni.getStorageSync('uni_id_token') || ''
}

export function genVisitorId() {
  const id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  uni.setStorageSync('visitor_id', id)
  return id
}

export function requireLogin(targetPath) {
  if (getToken() && uni.getStorageSync('current_user_id')) return true
  if (targetPath) {
    uni.navigateTo({ url: `/pages/login/login?redirect=${encodeURIComponent(targetPath)}` })
  } else {
    uni.navigateTo({ url: '/pages/login/login' })
  }
  return false
}

// 兼容旧调用：部分页面原先用 getUserId()，语意即"取当前用户标识"
export function getUserId() {
  const uid = getUid()
  return Promise.resolve(uid)
}
