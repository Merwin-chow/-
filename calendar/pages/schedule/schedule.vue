<template>
	<view class="container">
		<!-- 头部 -->
		<view class="header">
			<text class="header-title">{{ currentMonth }} 日程</text>
			<text class="header-count">{{ filteredSchedules.length }} 项</text>
		</view>

		<!-- 搜索框 -->
		<view class="search-bar">
			<input class="search-input" v-model="keyword" placeholder="搜索日程..." @confirm="searchSchedules" />
		</view>

		<!-- 范围筛选 -->
		<view class="filter-bar">
			<view class="filter-pill" :class="{ 'filter-active': scopeFilter === 'all' }" @click="scopeFilter = 'all'">
				<text class="filter-text">全部</text>
			</view>
			<view class="filter-pill" :class="{ 'filter-active': scopeFilter === 'mine' }" @click="scopeFilter = 'mine'">
				<text class="filter-text">我的</text>
			</view>
			<view class="filter-pill" :class="{ 'filter-active': scopeFilter === 'group' }" @click="scopeFilter = 'group'">
				<text class="filter-text">群日程</text>
			</view>
		</view>

		<!-- 状态筛选 -->
		<view class="filter-bar">
			<view class="filter-pill" :class="{ 'filter-active': statusFilter === 'all' }" @click="statusFilter = 'all'">
				<text class="filter-text">全部</text>
			</view>
			<view class="filter-pill" :class="{ 'filter-active': statusFilter === 'not_started' }" @click="statusFilter = 'not_started'">
				<text class="filter-text">未开始</text>
			</view>
			<view class="filter-pill" :class="{ 'filter-active': statusFilter === 'in_progress' }" @click="statusFilter = 'in_progress'">
				<text class="filter-text">进行中</text>
			</view>
			<view class="filter-pill" :class="{ 'filter-active': statusFilter === 'ended' }" @click="statusFilter = 'ended'">
				<text class="filter-text">已结束</text>
			</view>
		</view>

		<!-- 今日提醒 -->
		<view class="today-remind" v-if="todaySchedules.length > 0">
			<text class="remind-label">今日提醒</text>
			<view class="remind-card" v-for="item in todaySchedules" :key="item._id" @click="openDetail(item._id)">
				<view class="remind-type" :class="'type-' + item.type">
					<text class="remind-type-text">{{ typeLabel(item.type) }}</text>
				</view>
				<view class="remind-body">
					<text class="remind-title">{{ item.title }}</text>
					<text class="remind-member">{{ item.start_time || '全天' }}<template v-if="item.member_name"> · {{ item.member_name }}</template></text>
				</view>
				<view class="remind-arrow">›</view>
			</view>
		</view>

		<!-- 日程列表 -->
		<view class="section">
			<text class="section-title">日程列表</text>
			<view v-if="filteredSchedules.length === 0" class="empty-state">
				<text class="empty-text">暂无日程</text>
			</view>
			<view class="schedule-list">
				<view class="schedule-item" v-for="item in filteredSchedules" :key="item._id" @click="openDetail(item._id)">
					<view class="schedule-date-box">
						<text class="schedule-day">{{ getDay(item.date) }}</text>
						<text class="schedule-month">{{ getMonth(item.date) }}</text>
					</view>
					<view class="schedule-body">
						<text class="schedule-title">{{ item.title }}</text>
						<view class="schedule-tags">
							<text class="schedule-meta">{{ item.start_time || '全天' }} · {{ typeLabel(item.type) }}</text>
							<view class="scope-tag" :class="{ 'scope-group': item.scope === 'group' }">
								<text class="scope-tag-text">{{ item.scope === 'group' ? '群' : '私' }}</text>
							</view>
							<view class="status-tag" :class="'tag-' + item.schedule_status">
								<text class="status-tag-text">{{ item.status_label }}</text>
							</view>
						</view>
						<text class="schedule-sub" v-if="item.member_name">{{ item.member_name }}</text>
					</view>
					<view class="schedule-right">
						<text class="signup-count" v-if="item.scope === 'group' && item.signup_enabled">{{ item.signup_count || 0 }}人</text>
						<view class="signed-tag" v-if="item.scope === 'group' && item.my_signup_status === 'signed'">
							<text class="signed-tag-text">已报名</text>
						</view>
						<text class="arrow-text">›</text>
					</view>
				</view>
			</view>
		</view>

		<!-- 底部栏 -->
		<view class="bottom-bar">
			<view class="bar-item" @click="goHome">
				<text class="bar-label">首页</text>
			</view>
			<view class="bar-item" @click="goGroups">
				<text class="bar-label">群组</text>
			</view>
			<view class="bar-item" @click="goCreate">
				<text class="bar-label">创建</text>
			</view>
		</view>
	</view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const schedules = ref([])
const keyword = ref('')
const scopeFilter = ref('all')
const statusFilter = ref('all')
const todayStr = new Date().toISOString().slice(0, 10)

const currentMonth = computed(() => {
	const d = new Date()
	return `${d.getFullYear()}年${d.getMonth() + 1}月`
})

const todaySchedules = computed(() => {
	return schedules.value.filter(s => s.date === todayStr && (s.schedule_status === 'not_started' || s.schedule_status === 'in_progress'))
})

const filteredSchedules = computed(() => {
	let list = schedules.value
	if (scopeFilter.value === 'mine') {
		list = list.filter(s => s.scope !== 'group')
	} else if (scopeFilter.value === 'group') {
		list = list.filter(s => s.scope === 'group')
	}
	if (statusFilter.value !== 'all') {
		list = list.filter(s => s.schedule_status === statusFilter.value)
	}
	return list
})

const typeLabel = (t) => {
	const m = { birthday: '生日', event: '活动', meeting: '会议', other: '其他' }
	return m[t] || '其他'
}

const getDay = (dateStr) => dateStr ? dateStr.split('-')[2] : ''
const getMonth = (dateStr) => {
	if (!dateStr) return ''
	const m = parseInt(dateStr.split('-')[1])
	return m + '月'
}

const getUserId = async () => {
	const token = uni.getStorageSync('uni_id_token')
	if (token) return token
	const currentId = uni.getStorageSync('current_user_id')
	if (currentId) return currentId
	const visitorId = uni.getStorageSync('visitor_id') || generateVisitorId()
	return 'visitor_' + visitorId
}

const generateVisitorId = () => {
	const id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
	uni.setStorageSync('visitor_id', id)
	return id
}

const loadSchedules = async () => {
	try {
		const user_id = await getUserId()
		const now = new Date()
		const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
		const res = await uniCloud.callFunction({
			name: 'schedules',
			data: { action: 'getMonth', user_id, month }
		}).catch(e => {
			console.error('load schedules call fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			schedules.value = (res.result.data || []).sort((a, b) => {
				const d = a.date.localeCompare(b.date)
				if (d !== 0) return d
				return (a.start_time || '99:99').localeCompare(b.start_time || '99:99')
			})
		}
	} catch (e) {
		console.error('load schedules fail:', e)
	}
}

const searchSchedules = async () => {
	if (!keyword.value.trim()) {
		loadSchedules()
		return
	}
	try {
		const user_id = await getUserId()
		const res = await uniCloud.callFunction({
			name: 'schedules',
			data: { action: 'search', user_id, keyword: keyword.value.trim() }
		}).catch(e => {
			console.error('search schedules call fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			schedules.value = (res.result.data || []).sort((a, b) => a.date.localeCompare(b.date))
		}
	} catch (e) {
		console.error('search schedules fail:', e)
	}
}

const openDetail = (sid) => {
	uni.navigateTo({ url: '/pages/schedule-detail/schedule-detail?schedule_id=' + sid })
}

const requireLogin = (targetPath) => {
	const token = uni.getStorageSync('uni_id_token')
	const userInfo = uni.getStorageSync('uni_id_user_info')
	if (!token || !userInfo) {
		uni.navigateTo({ url: `/pages/login/login?redirect=${encodeURIComponent(targetPath)}` })
		return false
	}
	return true
}

const goHome = () => { uni.navigateBack() }
const goGroups = () => { uni.navigateTo({ url: '/pages/groups/groups' }) }
const goCreate = () => {
	if (!requireLogin('/pages/create-schedule/create-schedule')) return
	uni.navigateTo({ url: '/pages/create-schedule/create-schedule' })
}

onMounted(() => { loadSchedules() })
</script>

<style>
page { background-color: #F0F1F5; }
.container { padding: 30rpx; padding-bottom: 140rpx; }

.header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20rpx; }
.header-title { font-size: 36rpx; font-weight: bold; color: #333; }
.header-count { font-size: 24rpx; color: #999; }

.search-bar { margin-bottom: 16rpx; }
.search-input { width: 100%; height: 72rpx; background: rgba(255,255,255,0.9); border-radius: 16rpx; padding: 0 24rpx; font-size: 28rpx; color: #333; box-sizing: border-box; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04); }

.filter-bar { display: flex; gap: 10rpx; margin-bottom: 16rpx; flex-wrap: wrap; }
.filter-pill { padding: 10rpx 20rpx; border-radius: 20rpx; background: rgba(0,0,0,0.04); transition: all 0.2s; }
.filter-active { background: #333; }
.filter-text { font-size: 24rpx; color: #666; }
.filter-active .filter-text { color: #FFF; }

.today-remind { margin-bottom: 32rpx; }
.remind-label { font-size: 24rpx; color: #999; font-weight: 600; margin-bottom: 12rpx; display: block; }
.remind-card { display: flex; align-items: center; gap: 16rpx; background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%); border-radius: 16rpx; padding: 20rpx; margin-bottom: 10rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); }
.remind-type { padding: 6rpx 14rpx; border-radius: 8rpx; }
.type-birthday { background: rgba(255,138,101,0.12); }
.type-birthday .remind-type-text { color: #FF8A65; }
.type-event { background: rgba(0,122,255,0.08); }
.type-event .remind-type-text { color: #007AFF; }
.type-meeting { background: rgba(76,175,80,0.1); }
.type-meeting .remind-type-text { color: #4CAF50; }
.remind-type-text { font-size: 22rpx; }
.remind-body { flex: 1; }
.remind-title { font-size: 28rpx; color: #333; font-weight: 500; display: block; }
.remind-member { font-size: 24rpx; color: #999; display: block; margin-top: 4rpx; }
.remind-arrow { font-size: 32rpx; color: #CCC; }

.section { margin-bottom: 24rpx; }
.section-title { font-size: 24rpx; color: #999; font-weight: 600; margin-bottom: 14rpx; display: block; }

.schedule-list { display: flex; flex-direction: column; gap: 12rpx; }
.schedule-item { display: flex; align-items: center; background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%); border-radius: 16rpx; padding: 20rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); backdrop-filter: blur(12rpx); }
.schedule-date-box { width: 80rpx; text-align: center; flex-shrink: 0; margin-right: 16rpx; }
.schedule-day { font-size: 36rpx; font-weight: bold; color: #333; display: block; }
.schedule-month { font-size: 20rpx; color: #999; display: block; }
.schedule-body { flex: 1; }
.schedule-title { font-size: 28rpx; color: #333; font-weight: 500; display: block; }
.schedule-tags { display: flex; align-items: center; gap: 8rpx; margin-top: 4rpx; flex-wrap: wrap; }
.schedule-meta { font-size: 22rpx; color: #999; }
.schedule-sub { font-size: 22rpx; color: #999; display: block; margin-top: 4rpx; }
.scope-tag { padding: 2rpx 10rpx; border-radius: 8rpx; background: rgba(0,0,0,0.04); }
.scope-group { background: rgba(0,122,255,0.08); }
.scope-tag-text { font-size: 20rpx; color: #999; }
.scope-group .scope-tag-text { color: #007AFF; }
.status-tag { padding: 2rpx 10rpx; border-radius: 8rpx; }
.tag-not_started { background: rgba(255,193,7,0.1); }
.tag-not_started .status-tag-text { color: #FFC107; font-size: 20rpx; }
.tag-in_progress { background: rgba(76,175,80,0.1); }
.tag-in_progress .status-tag-text { color: #4CAF50; font-size: 20rpx; }
.tag-ended { background: rgba(0,0,0,0.04); }
.tag-ended .status-tag-text { color: #999; font-size: 20rpx; }

.schedule-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8rpx; padding-left: 12rpx; }
.signup-count { font-size: 20rpx; color: #007AFF; }
.signed-tag { padding: 2rpx 10rpx; border-radius: 8rpx; background: rgba(76,175,80,0.1); }
.signed-tag-text { font-size: 20rpx; color: #4CAF50; }
.arrow-text { font-size: 36rpx; color: #CCC; }

.empty-state { display: flex; justify-content: center; padding-top: 100rpx; }
.empty-text { font-size: 28rpx; color: #999; }

.bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: center; gap: 80rpx; padding: 24rpx 0; padding-bottom: calc(24rpx + env(safe-area-inset-bottom)); background: rgba(255,255,255,0.85); backdrop-filter: blur(24rpx); box-shadow: 0 -2rpx 20rpx rgba(0,0,0,0.04); z-index: 100; }
.bar-item { display: flex; flex-direction: column; align-items: center; }
.bar-label { font-size: 24rpx; color: #666; }
</style>
