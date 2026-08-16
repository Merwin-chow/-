const config = require('./config.json')
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

    // 查找或创建用户（openid 唯一索引兜底去重）
    const userRes = await db.collection('uni-id-users')
      .where({ openid })
      .get()

    let userId
    let isNew = false

    if (userRes.data && userRes.data.length > 0) {
      // 已有用户，更新信息（含 lastLoginTime 统计）
      userId = userRes.data[0]._id
      const updateData = { lastLoginTime: Date.now() }
      if (nickname) updateData.nickname = nickname
      if (avatar) updateData.avatar = avatar
      await db.collection('uni-id-users').doc(userId).update(updateData)
      await syncBirthdayMmdd(db, userId)
    } else {
      // 新用户
      isNew = true
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

    // 用 uni-id-common 生成 JWT（P0-2：废弃自研 SHA256 token）
    const tokenRes = await uniID.createToken({ uid: userId })
    const token = tokenRes.token

    // 清理该用户旧 token，防表无限增长
    await cleanOldTokens(db, userId)

    // 写入新 token
    await db.collection('uni-id-token').add({
      user_id: userId,
      token,
      createTime: Date.now()
    })

    // 回读档案（含 birthday）
    const profileRes = await db.collection('uni-id-users').doc(userId).get()
    const profile = profileRes.data || {}

    return {
      code: 200,
      message: isNew ? '注册成功' : '登录成功',
      data: {
        uid: userId,
        token,
        nickname: profile.nickname || nickname || '微信用户',
        avatar: profile.avatar || avatar || '',
        birthday: profile.birthday || '',
        isNew
      }
    }
  }

  // 手机号绑定（P0-2 修复：由 token 解析 uid，不再把 token 当 _id）
  if (action === 'phoneLogin') {
    const u = await resolveUid(context, event)
    if (u.code) return u
    if (!phone) return { code: 400, message: '缺少手机号' }
    await db.collection('uni-id-users').doc(u.uid).update({ phone })
    return { code: 200, message: '绑定成功' }
  }

  // 更新用户档案（P0-2 修复：由 token 解析 uid，不再信任 event.uid）
  if (action === 'updateProfile') {
    const u = await resolveUid(context, event)
    if (u.code) return u
    if (!event.nickname && !event.avatar && event.birthday === undefined) {
      return { code: 400, message: '无更新内容' }
    }
    const updateData = {}
    if (event.nickname) updateData.nickname = event.nickname
    if (event.avatar) updateData.avatar = event.avatar
    if (event.birthday !== undefined) updateData.birthday = event.birthday
    await db.collection('uni-id-users').doc(u.uid).update(updateData)
    await syncBirthdayMmdd(db, u.uid)
    return { code: 200, message: '已更新' }
  }

  // 获取当前用户（P0-2 修复：由 token 解析 uid 查档案）
  if (action === 'getCurrentUser') {
    const token = event.token || ''
    if (!token) {
      const visitorId = event.visitor_id || 'visitor_default'
      return {
        code: 200,
        data: { uid: 'visitor_' + visitorId, nickname: '游客', avatar: '', isVisitor: true }
      }
    }
    const u = await resolveUid(context, event)
    if (u.code) return u
    const userRes = await db.collection('uni-id-users').doc(u.uid).get()
    if (!userRes.data) return { code: 404, message: '用户不存在' }
    const d = userRes.data
    return {
      code: 200,
      data: {
        uid: d._id,
        nickname: d.nickname || '微信用户',
        avatar: d.avatar || '',
        phone: d.phone || '',
        birthday: d.birthday || '',
        isVisitor: false
      }
    }
  }

  return { code: 400, message: '未知操作' }
}

// 清理该用户旧 token，仅保留最新一条（防表无限增长）
async function cleanOldTokens(db, uid) {
  try {
    const res = await db.collection('uni-id-token')
      .where({ user_id: uid })
      .orderBy('createTime', 'desc')
      .get()
    const list = res.data || []
    if (list.length <= 1) return
    const toRemove = list.slice(1).map(t => t._id)
    await db.collection('uni-id-token')
      .where({ _id: db.command.in(toRemove) })
      .remove()
  } catch (e) {
    console.error('cleanOldTokens fail:', uid, e)
  }
}

// 同步 birthday 派生字段 birthday_mmdd（MM-DD），供生日通知按索引查询
async function syncBirthdayMmdd(db, uid) {
  try {
    const u = await db.collection('uni-id-users').doc(uid).get()
    const birthday = u.data && u.data.birthday
    const mmdd = /^\d{4}-(\d{2}-\d{2})$/.test(birthday || '') ? birthday.slice(5) : ''
    await db.collection('uni-id-users').doc(uid).update({ birthday_mmdd: mmdd })
  } catch (e) {
    console.error('syncBirthdayMmdd fail:', uid, e)
  }
}
