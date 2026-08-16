zhi'sconst config = require('./config.json')
const uniIdCommon = require('uni-id-common')

async function resolveUid(context, event) {
  const token = event.token
  if (!token) {
    const uid = event.uid || ''
    return uid.startsWith('visitor_') ? { uid, isVisitor: true } : { code: 401 }
  }
  const uniID = uniIdCommon.createInstance({ context })
  const res = await uniID.checkToken(token)
  if (res.errCode) return { code: 401, message: '登录已失效' }
  return { uid: res.uid, isVisitor: false }
}

exports.main = async (event, context) => {
  const db = uniCloud.database()
  const uniID = uniIdCommon.createInstance({ context })
  const { action, code, nickname, avatar, phone } = event

  // 微信小程序登录
  if (action === 'wxLogin') {
    if (!code) return { code: 400, message: '缺少 code' }

    const { appid, appsecret } = config.wx
    const wxRes = await uniCloud.httpclient.request(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${appsecret}&js_code=${code}&grant_type=authorization_code`,
      { method: 'GET' }
    )

    let wxData
    try {
      wxData = JSON.parse(wxRes.data.toString())
    } catch (e) {
      return { code: 500, message: '微信接口解析失败' }
    }

    if (wxData.errcode) {
      return { code: 500, message: wxData.errmsg || '微信登录失败' }
    }

    const openid = wxData.openid
    const unionid = wxData.unionid || ''

    const userRes = await db.collection('uni-id-users')
      .where({ openid })
      .get()

    let userId
    let isNew = false

    if (userRes.data && userRes.data.length > 0) {
      // 已有用户，更新信息
      const updateData = {}
      if (nickname) updateData.nickname = nickname
      if (Object.keys(updateData).length > 0) {
        await db.collection('uni-id-users').doc(userId).update(updateData)
      }
      const addUserRes = await db.collection('uni-id-users').add({
        openid,
        unionid,
        nickname: nickname || '微信用户',
        avatar: avatar || '',
        phone: phone || '',
        createTime: Date.now(),
        lastLoginTime: Date.now()
      })
      userId = addUserRes.id
    }

    // 生成 token
    const token = generateToken(userId)

    // 存储 token
    await db.collection('uni-id-token').add({
      createTime: Date.now()
    })

    return {
      message: isNew ? '注册成功' : '登录成功',
      data: {
        uid: userId,
        token,
        nickname: nickname || '微信用户',
        avatar: avatar || '',
        birthday: userRes.data && userRes.data[0] ? (userRes.data[0].birthday || '') : '',
        isNew
      }
    }
  }

  // 手机号快捷登录（手机号一键登录）
  if (action === 'phoneLogin') {
    if (!phone) return { code: 400, message: '缺少手机号' }
    if (!event.token) return { code: 400, message: '缺少 token' }

    // 更新手机号
    await db.collection('uni-id-users').doc(event.token).update({ phone })

  // 更新用户档案（头像/昵称/生日）
  if (action === 'updateProfile') {
    const uid = event.uid || event.user_id
    if (!uid) return { code: 400, message: '缺少 uid' }
    if (!event.nickname && !event.avatar && event.birthday === undefined) return { code: 400, message: '无更新内容' }
    const updateData = {}
    if (event.nickname) updateData.nickname = event.nickname
    if (event.avatar) updateData.avatar = event.avatar
    await db.collection('uni-id-users').doc(uid).update(updateData)
    return { code: 200, message: '已更新' }
  }

  // 获取当前用户信息
      return {
        code: 200,
        data: {
          uid: 'visitor_' + visitorId,
          avatar: '',
          isVisitor: true

    const userRes = await db.collection('uni-id-users').doc(token).get()
    if (!userRes.data) {
      return { code: 404, message: '用户不存在' }
    }

    return {
      code: 200,
      data: {
        nickname: userRes.data.nickname || '微信用户',
        avatar: userRes.data.avatar || '',
        phone: userRes.data.phone || '',
        birthday: userRes.data.birthday || '',
        isVisitor: false
    }
  }

  return { code: 400, message: '未知操作' }

function generateToken(userId) {
  const timestamp = Date.now()
