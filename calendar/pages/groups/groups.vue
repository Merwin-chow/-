<template>
	<view class="container">
		<!-- 顶部：我的群组 -->
		<view class="header">
			<text class="header-title">我的群组</text>
			<view class="header-actions">
				<view class="action-pill" @click="showJoinModal = true">
					<text class="pill-text">加入</text>
				</view>
				<view class="action-pill active-pill" @click="showCreateModal = true">
					<text class="pill-text-white">创建</text>
				</view>
			</view>
		</view>

		<!-- 群组列表 -->
		<view v-if="groups.length === 0" class="empty-state">
			<text class="empty-text">暂无群组</text>
			<text class="empty-sub">创建或加入一个群组开始协作</text>
		</view>

		<view class="group-list">
			<view class="group-card" v-for="g in groups" :key="g._id" @click="openGroup(g)">
				<view class="group-left">
					<view class="group-icon">
						<text class="icon-text">{{ g.group_name.charAt(0) }}</text>
					</view>
					<view class="group-info">
						<text class="group-name">{{ g.group_name }}</text>
						<text class="group-meta">{{ g.members?.length || 0 }} 位成员 · {{ g.invite_code }}</text>
					</view>
				</view>
				<view class="group-arrow">
					<text class="arrow-text">›</text>
				</view>
			</view>
		</view>

		<!-- 加入群组弹窗 -->
		<view class="modal-mask" v-if="showJoinModal" @click="showJoinModal = false">
			<view class="modal-body" @click.stop>
				<text class="modal-title">加入群组</text>
				<input class="modal-input" v-model="joinCode" placeholder="输入6位邀请码" maxlength="6" />
				<input class="modal-input" v-model="joinRemark" placeholder="我在群内的名称（不填用昵称）" />
				<view class="modal-actions">
					<view class="modal-btn" @click="joinGroup">
						<text class="modal-btn-text">加入</text>
					</view>
				</view>
			</view>
		</view>

		<!-- 创建群组弹窗 -->
		<view class="modal-mask" v-if="showCreateModal" @click="showCreateModal = false">
			<view class="modal-body" @click.stop>
				<text class="modal-title">创建群组</text>
				<input class="modal-input" v-model="newGroupName" placeholder="群组名称" />
				<input class="modal-input" v-model="newGroupRemark" placeholder="我在群内的名称（不填用昵称）" />
				<input class="modal-input" v-model="newGroupDesc" placeholder="描述（可选）" />
				<view class="modal-actions">
					<view class="modal-btn" @click="createGroup">
						<text class="modal-btn-text">创建</text>
					</view>
				</view>
			</view>
		</view>

		<!-- 底部栏 -->
		<view class="bottom-bar">
			<view class="bar-item" @click="goHome">
				<text class="bar-label">首页</text>
			</view>
		</view>

		<view class="toast" v-if="toastMsg">
			<text class="toast-text">{{ toastMsg }}</text>
		</view>
	</view>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const groups = ref([])
const userId = ref('')
const showJoinModal = ref(false)
const showCreateModal = ref(false)
const joinCode = ref('')
const joinRemark = ref('')
const newGroupName = ref('')
const newGroupRemark = ref('')
const newGroupDesc = ref('')
const toastMsg = ref('')

const showToast = (msg) => {
	toastMsg.value = msg
	setTimeout(() => { toastMsg.value = '' }, 2000)
}

const getUserId = async () => {
	const token = uni.getStorageSync('uni_id_token')
	if (token) return token
	const visitorId = uni.getStorageSync('visitor_id')
	if (visitorId) return 'visitor_' + visitorId
	return null
}

const loadGroups = async () => {
	const uid = await getUserId()
	if (!uid || uid.startsWith('visitor_')) {
		uni.showModal({
			title: '提示', content: '请先登录后再使用群组功能',
			confirmText: '去登录',
			success: (res) => {
				if (res.confirm) uni.navigateTo({ url: '/pages/login/login' })
			}
		})
		return
	}
	userId.value = uid
	try {
		const res = await uniCloud.callFunction({
			name: 'groups',
			data: { action: 'myGroups', user_id: uid }
		}).catch(e => {
			console.error('load groups call fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			groups.value = res.result.data || []
		}
	} catch (e) {
		console.error('load groups fail:', e)
	}
}

const openGroup = (g) => {
	uni.navigateTo({ url: '/pages/group-detail/group-detail?group_id=' + g._id })
}

const joinGroup = async () => {
	if (joinCode.value.length !== 6) {
		showToast('请输入6位邀请码')
		return
	}
	try {
		const res = await uniCloud.callFunction({
			name: 'groups',
			data: { action: 'join', user_id: userId.value, invite_code: joinCode.value.toUpperCase(), group_remark: joinRemark.value.trim() }
		}).catch(e => {
			console.error('join group call fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			showToast(res.result.message)
			showJoinModal.value = false
			joinCode.value = ''
			joinRemark.value = ''
			loadGroups()
		} else {
			showToast(res.result?.message || '加入失败')
		}
	} catch (e) {
		showToast('加入失败')
	}
}

const createGroup = async () => {
	if (!newGroupName.value.trim()) {
		showToast('请输入群组名称')
		return
	}
	try {
		const res = await uniCloud.callFunction({
			name: 'groups',
			data: {
				action: 'create',
				user_id: userId.value,
				group_name: newGroupName.value.trim(),
				description: newGroupDesc.value.trim(),
				group_remark: newGroupRemark.value.trim()
			}
		}).catch(e => {
			console.error('create group call fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			showToast('创建成功')
			showCreateModal.value = false
			newGroupName.value = ''
			newGroupRemark.value = ''
			newGroupDesc.value = ''
			loadGroups()
		}
	} catch (e) {
		showToast('创建失败')
	}
}

const goHome = () => { uni.navigateBack() }

onMounted(() => { loadGroups() })
</script>

<style>
page { background-color: #F0F1F5; }
.container { padding: 30rpx; padding-bottom: 140rpx; }

.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24rpx; }
.header-title { font-size: 36rpx; font-weight: bold; color: #333; }
.header-actions { display: flex; gap: 12rpx; }
.action-pill { padding: 10rpx 24rpx; border-radius: 24rpx; background: rgba(0,0,0,0.04); }
.active-pill { background: #333; }
.pill-text { font-size: 24rpx; color: #666; }
.pill-text-white { font-size: 24rpx; color: #FFF; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding-top: 120rpx; }
.empty-text { font-size: 32rpx; color: #999; margin-bottom: 12rpx; }
.empty-sub { font-size: 26rpx; color: #CCC; }

.group-list { display: flex; flex-direction: column; gap: 14rpx; }
.group-card { display: flex; align-items: center; justify-content: space-between; background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%); border-radius: 16rpx; padding: 24rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); }
.group-left { display: flex; align-items: center; gap: 16rpx; flex: 1; }
.group-icon { width: 72rpx; height: 72rpx; border-radius: 36rpx; background: #333; display: flex; align-items: center; justify-content: center; }
.icon-text { font-size: 30rpx; color: #FFF; font-weight: 500; }
.group-info { flex: 1; }
.group-name { font-size: 28rpx; color: #333; font-weight: 500; display: block; }
.group-meta { font-size: 22rpx; color: #999; display: block; margin-top: 4rpx; }
.group-arrow { padding-left: 16rpx; }
.arrow-text { font-size: 36rpx; color: #CCC; }

.modal-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
.modal-body { width: 80%; background: #FFF; border-radius: 24rpx; padding: 40rpx; }
.modal-title { font-size: 32rpx; font-weight: bold; color: #333; display: block; margin-bottom: 24rpx; }
.modal-input { width: 100%; height: 80rpx; border: 2rpx solid #E5E5EA; border-radius: 12rpx; padding: 0 20rpx; font-size: 28rpx; margin-bottom: 16rpx; box-sizing: border-box; }
.modal-actions { display: flex; gap: 16rpx; margin-top: 16rpx; }
.modal-btn { flex: 1; height: 72rpx; display: flex; align-items: center; justify-content: center; background: #333; border-radius: 36rpx; }
.modal-btn:active { opacity: 0.8; }
.modal-btn-text { font-size: 28rpx; color: #FFF; }

.bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: center; gap: 80rpx; padding: 24rpx 0; padding-bottom: calc(24rpx + env(safe-area-inset-bottom)); background: rgba(255,255,255,0.85); backdrop-filter: blur(24rpx); box-shadow: 0 -2rpx 20rpx rgba(0,0,0,0.04); z-index: 100; }
.bar-item { display: flex; flex-direction: column; align-items: center; }
.bar-label { font-size: 24rpx; color: #666; }

.toast { position: fixed; top: 200rpx; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.75); border-radius: 16rpx; padding: 16rpx 32rpx; z-index: 999; }
.toast-text { font-size: 28rpx; color: #FFF; }
</style>
