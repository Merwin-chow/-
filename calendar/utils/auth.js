/**
 * 统一身份获取工具（Phase 1）
 *
 * 身份优先级：
 *   1. 登录态：current_user_id（稳定 uid = uni-id-users._id）
 *   2. 异常态：有 token 无 uid → 需刷新登录（返回 null 提示）
 *   3. 游客态：visitor_ 前缀本地 id
 *
 * M-10：getUid() 恒返回非空字符串（或 null 表示待登录）
 */

export function getUid() {
  const uid = uni.getStorageSync('current_user_id')
  if (uid) return uid // 登录态：稳定 uid
  const token = uni.getStorageSync('uni_id_token')
  if (token) return null // 有 token 无 uid：异常，需刷新登录
  const visitorId = uni.getStorageSync('visitor_id') || genVisitorId()
  return 'visitor_' + visitorId // 游客态
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
