/**
 * 统一云函数调用（Phase 1）
 *
 * 自动注入 token，统一处理 401（登录失效）跳转。
 * 所有数据读写一律走云函数，禁止客户端 db 直查。
 */
import { getToken, getUid } from './auth.js'

export function callApi(name, action, data = {}) {
  const token = getToken()
  // uid 仅作游客/低版本兼容字段；云函数侧以 `resolveUid` 从 token 解析真实身份，
  // 业务不再信任此处的 uid 作为鉴权依据。
  return uniCloud.callFunction({
    name,
    data: { token, uid: getUid() || '', action, ...data }
  }).then(res => {
    const r = res && res.result
    if (r && (r.code === 401 || (typeof r.code === 'string' && r.code === 'uni-id-token-expired'))) {
      uni.removeStorageSync('uni_id_token')
      uni.removeStorageSync('current_user_id')
      uni.navigateTo({ url: '/pages/login/login' })
      throw r
    }
    return r
  }).catch(err => {
    // 401 已被上方抛出处理过，这里保证异常可被调用方 catch
    throw err
  })
}
