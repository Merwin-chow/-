<template>
	<view class="container">
		<view class="login-box">
			<view class="logo-area">
				<view class="logo-circle">
					<text class="logo-text">每</text>
				</view>
				<text class="app-name">每日一言</text>
				<text class="app-desc">收藏 · 记忆 · 日程</text>
			</view>

			<!-- 已登录状态 -->
			<view v-if="isLoggedIn && !showProfileEdit" class="user-area">
				<image class="avatar" :src="userInfo.avatar || '/static/default-avatar.png'" mode="aspectFill" />
				<text class="user-name">{{ userInfo.nickname }}</text>
				<text class="user-id">ID: {{ userInfo.uid?.slice(0, 8) }}...</text>
				<view class="action-btn" @click="openProfileEdit">
					<text class="action-btn-text">修改头像昵称</text>
				</view>
				<view class="action-btn second" @click="goBack">
					<text class="action-btn-text">进入首页</text>
				</view>
				<view class="logout-btn" @click="logout">
					<text class="logout-text">退出登录</text>
				</view>
			</view>

			<!-- 未登录状态 -->
			<view v-else-if="!isLoggedIn && !showProfileEdit" class="login-area">
				<!-- 微信登录 -->
				<view class="login-btn wx-btn" @click="wxLogin">
					<text class="login-btn-text">微信一键登录</text>
				</view>

				<!-- 游客模式 -->
				<view class="login-btn guest-btn" @click="guestLogin">
					<text class="guest-btn-text">游客模式</text>
				</view>

				<text class="tip-text">游客数据将保存在本地，登录后可云端同步</text>
			</view>

			<!-- 头像昵称填写（登录后补齐资料） -->
			<view v-if="showProfileEdit" class="profile-edit-area">
				<text class="form-label">头像</text>
				<button class="avatar-btn" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
					<image class="avatar avatar-preview" :src="avatarPreview" mode="aspectFill" />
					<text class="avatar-tip">点击更换</text>
				</button>

			<text class="form-label">昵称</text>
			<input class="form-input" type="nickname" v-model="nicknameInput" placeholder="请输入昵称" />

			<text class="form-label">生日（报名时自动填入）</text>
			<picker mode="date" :value="birthdayInput" @change="e => birthdayInput = e.detail.value">
				<view class="picker-view">
					<text class="picker-text" :class="{ 'picker-empty': !birthdayInput }">{{ birthdayInput || '选择你的生日' }}</text>
				</view>
			</picker>
			<view class="clear-birthday" v-if="birthdayInput" @click="birthdayInput = ''">
				<text class="clear-birthday-text">清除生日</text>
			</view>

			<view class="action-btn" :class="{ 'btn-disabled': saving }" @click="saveProfile">
					<text class="action-btn-text">保存</text>
				</view>
				<view class="logout-btn" v-if="isLoggedIn" @click="cancelProfileEdit">
					<text class="logout-text">取消</text>
				</view>
			</view>
		</view>

		<view class="toast" v-if="toastMsg">
			<text class="toast-text">{{ toastMsg }}</text>
		</view>
	</view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const isLoggedIn = ref(false)
const userInfo = ref({})
const toastMsg = ref('')
const logging = ref(false)
const saving = ref(false)
const showProfileEdit = ref(false)
const nicknameInput = ref('')
const avatarTemp = ref('')
const birthdayInput = ref('')
const pendingReturn = ref(false)
const redirectUrl = ref('/pages/index/index')

const showToast = (msg) => {
	toastMsg.value = msg
	setTimeout(() => { toastMsg.value = '' }, 2000)
}

const resolveRedirect = () => {
	const pages = getCurrentPages()
	const page = pages[pages.length - 1]
	const options = page?.options || {}
	const raw = options.redirect || options.returnUrl || options.redirectUrl || ''
	return raw ? decodeURIComponent(raw) : '/pages/index/index'
}

const avatarPreview = computed(() => {
	return avatarTemp.value || userInfo.value.avatar || '/static/default-avatar.png'
})

const checkLogin = () => {
	const token = uni.getStorageSync('uni_id_token')
	const userStr = uni.getStorageSync('uni_id_user_info')
	if (token && userStr) {
		try {
			userInfo.value = JSON.parse(userStr)
			isLoggedIn.value = true
		} catch (e) {
			isLoggedIn.value = false
		}
	}
}

const wxLogin = async () => {
	if (logging.value) return
	logging.value = true
	try {
		let code = ''
		try {
			const loginRes = await uni.login({ provider: 'weixin' })
			code = loginRes?.code || ''
		} catch (loginErr) {
			console.error('uni.login fail:', loginErr)
			showToast('微信登录授权失败，请使用游客模式')
			logging.value = false
			return
		}

		if (!code) {
			showToast('获取登录code失败，请使用游客模式')
			return
		}

		let res
		try {
			res = await uniCloud.callFunction({
				name: 'login',
				data: { action: 'wxLogin', code }
			})
		} catch (cloudErr) {
			console.error('login cloud function fail:', cloudErr)
			showToast('云端服务未就绪，请先使用游客模式')
			return
		}

		if (res?.result && res.result.code === 200) {
			const data = res.result.data
			uni.setStorageSync('uni_id_token', data.token)
			uni.setStorageSync('uni_id_user_info', JSON.stringify(data))
			uni.setStorageSync('current_user_id', data.uid)
			userInfo.value = data
			isLoggedIn.value = true
			showToast(res.result.message)
			if (data.isNew || !data.nickname || data.nickname === '微信用户') {
				pendingReturn.value = true
				openProfileEdit()
			} else {
				setTimeout(() => { goBack() }, 600)
			}
		} else {
			showToast(res?.result?.message || '登录失败，请使用游客模式')
		}
	} catch (e) {
		console.error('wx login error:', e)
		showToast('登录失败，请使用游客模式')
	} finally {
		logging.value = false
	}
}

const openProfileEdit = () => {
	nicknameInput.value = userInfo.value.nickname || ''
	avatarTemp.value = ''
	birthdayInput.value = userInfo.value.birthday || ''
	showProfileEdit.value = true
}

const cancelProfileEdit = () => {
	showProfileEdit.value = false
}

const onChooseAvatar = (e) => {
	avatarTemp.value = e.detail.avatarUrl
}

const uploadAvatar = (tempPath) => {
	return new Promise((resolve) => {
		const ext = (tempPath.split('.').pop() || 'jpg').toLowerCase()
		uniCloud.uploadFile({
			filePath: tempPath,
			cloudPath: `avatar/${Date.now()}.${ext}`,
			success: (res) => { resolve(res.fileID) },
			fail: () => { resolve('') }
		})
	})
}

const saveProfile = async () => {
	const name = nicknameInput.value.trim()
	if (!name) {
		showToast('请输入昵称')
		return
	}
	if (saving.value) return
	saving.value = true
	try {
		let avatar = userInfo.value.avatar || ''
		if (avatarTemp.value) {
			const fid = await uploadAvatar(avatarTemp.value)
			if (fid) avatar = fid
		}
		const res = await uniCloud.callFunction({
			name: 'login',
			data: {
				action: 'updateProfile',
				token: uni.getStorageSync('uni_id_token') || '',
				uid: userInfo.value.uid,
				nickname: name,
				avatar,
				birthday: birthdayInput.value
			}
		}).catch(e => {
			console.error('updateProfile fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			userInfo.value = { ...userInfo.value, nickname: name, avatar, birthday: birthdayInput.value }
			uni.setStorageSync('uni_id_user_info', JSON.stringify(userInfo.value))
			showProfileEdit.value = false
			showToast('已保存')
			if (pendingReturn.value) {
				pendingReturn.value = false
				setTimeout(() => { goBack() }, 600)
			}
		} else {
			showToast('保存失败，请重试')
		}
	} catch (e) {
		console.error('save profile error:', e)
		showToast('保存失败')
	} finally {
		saving.value = false
	}
}

const guestLogin = () => {
	const visitorId = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
	uni.setStorageSync('visitor_id', visitorId)
	uni.setStorageSync('current_user_id', 'visitor_' + visitorId)
	showToast('游客模式已开启')
	setTimeout(() => { goBack() }, 800)
}

const logout = () => {
	uni.removeStorageSync('uni_id_token')
	uni.removeStorageSync('uni_id_user_info')
	uni.removeStorageSync('current_user_id')
	isLoggedIn.value = false
	userInfo.value = {}
	showProfileEdit.value = false
	showToast('已退出')
}

const goBack = () => {
	const pages = getCurrentPages()
	if (pages.length > 1) {
		uni.navigateBack()
	} else {
		uni.reLaunch({ url: redirectUrl.value })
	}
}

onMounted(() => {
	redirectUrl.value = resolveRedirect()
	checkLogin()
})
</script>

<style>
page { background-color: #F0F1F5; }
.container { display: flex; flex-direction: column; align-items: center; padding: 0 40rpx; padding-top: 120rpx; }

.login-box { width: 100%; }

.logo-area { display: flex; flex-direction: column; align-items: center; margin-bottom: 60rpx; }
.logo-circle { width: 120rpx; height: 120rpx; border-radius: 60rpx; background: #333; display: flex; align-items: center; justify-content: center; margin-bottom: 20rpx; }
.logo-text { font-size: 52rpx; color: #FFF; font-weight: 300; }
.app-name { font-size: 40rpx; font-weight: bold; color: #333; margin-bottom: 8rpx; }
.app-desc { font-size: 26rpx; color: #999; }

.user-area { display: flex; flex-direction: column; align-items: center; }
.avatar { width: 120rpx; height: 120rpx; border-radius: 60rpx; margin-bottom: 20rpx; background: #E5E5EA; }
.user-name { font-size: 32rpx; color: #333; font-weight: 500; margin-bottom: 6rpx; }
.user-id { font-size: 24rpx; color: #999; margin-bottom: 40rpx; }

.login-area { display: flex; flex-direction: column; gap: 20rpx; }

.login-btn { width: 100%; height: 88rpx; display: flex; align-items: center; justify-content: center; border-radius: 44rpx; transition: all 0.2s; }
.login-btn:active { transform: scale(0.98); }
.wx-btn { background: #07C160; }
.wx-btn:active { background: #06AD56; }
.login-btn-text { font-size: 30rpx; color: #FFF; font-weight: 500; }

.guest-btn { background: transparent; border: 2rpx solid #DDD; }
.guest-btn-text { font-size: 30rpx; color: #666; }

.tip-text { font-size: 24rpx; color: #CCC; text-align: center; margin-top: 20rpx; }

.profile-edit-area { display: flex; flex-direction: column; align-items: center; }
.form-label { font-size: 26rpx; color: #999; font-weight: 600; margin-bottom: 16rpx; display: block; align-self: flex-start; margin-top: 12rpx; }
.avatar-btn { background: transparent; border: none; padding: 0; display: flex; flex-direction: column; align-items: center; margin-bottom: 12rpx; }
.avatar-preview { width: 140rpx; height: 140rpx; border-radius: 70rpx; margin-bottom: 8rpx; }
.avatar-tip { font-size: 22rpx; color: #999; }
.form-input { width: 100%; height: 80rpx; background: #FFF; border: 2rpx solid #E5E5EA; border-radius: 16rpx; padding: 0 24rpx; font-size: 30rpx; color: #333; box-sizing: border-box; }
.picker-view { width: 100%; height: 80rpx; background: #FFF; border: 2rpx solid #E5E5EA; border-radius: 16rpx; padding: 0 24rpx; display: flex; align-items: center; box-sizing: border-box; }
.picker-text { font-size: 30rpx; color: #333; }
.picker-empty { color: #BBB; }
.clear-birthday { align-self: flex-end; margin-top: 8rpx; padding: 4rpx 16rpx; }
.clear-birthday-text { font-size: 22rpx; color: #999; }

.action-btn { width: 100%; height: 88rpx; display: flex; align-items: center; justify-content: center; background: #333; border-radius: 44rpx; margin-top: 32rpx; }
.action-btn:active { opacity: 0.8; }
.action-btn.second { margin-top: 16rpx; background: rgba(0,0,0,0.04); }
.action-btn.second .action-btn-text { color: #666; }
.action-btn-text { font-size: 30rpx; color: #FFF; font-weight: 500; }
.btn-disabled { opacity: 0.4; }

.logout-btn { padding: 16rpx 0; }
.logout-text { font-size: 26rpx; color: #CCC; }

.toast { position: fixed; top: 200rpx; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.75); border-radius: 16rpx; padding: 16rpx 32rpx; z-index: 999; }
.toast-text { font-size: 28rpx; color: #FFF; }
</style>
