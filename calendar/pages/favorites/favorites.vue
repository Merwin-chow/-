<template>
	<view class="container">
		<!-- 搜索栏 -->
		<view class="search-bar">
			<input
				class="search-input"
				v-model="keyword"
				placeholder="搜索收藏内容"
				confirm-type="search"
				@confirm="doSearch"
			/>
			<view class="search-btn" v-if="keyword" @click="clearSearch">
				<text class="search-btn-text">取消</text>
			</view>
		</view>

		<view class="page-header">
			<text class="page-title">我的收藏</text>
			<text class="page-subtitle">{{ filteredList.length }} 条</text>
		</view>

		<!-- 按日期分组 -->
		<view v-if="groupedList.length > 0">
			<view class="date-group" v-for="(group, gIndex) in groupedList" :key="gIndex">
				<view class="date-header">
					<text class="date-label">{{ group.date }}</text>
					<text class="date-count">{{ group.items.length }} 条</text>
				</view>
				<view class="fav-card" v-for="(item, iIndex) in group.items" :key="iIndex">
					<text class="fav-content">{{ item.content }}</text>
					<view class="fav-footer">
						<text class="fav-author">—— {{ item.author || '佚名' }}</text>
						<view class="fav-remove" @click="removeFavorite(item)">
							<text class="remove-text">取消收藏</text>
						</view>
					</view>
				</view>
			</view>
		</view>

		<!-- 空状态 -->
		<view class="empty-state" v-else-if="!loading">
			<text class="empty-text">还没有收藏</text>
			<text class="empty-hint">去首页收藏喜欢的句子</text>
		</view>

		<view class="loading-state" v-if="loading">
			<text class="loading-text">加载中...</text>
		</view>
	</view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const favorites = ref([])
const loading = ref(true)
const keyword = ref('')

const filteredList = computed(() => {
	if (!keyword.value.trim()) return favorites.value
	const kw = keyword.value.trim().toLowerCase()
	return favorites.value.filter(item =>
		(item.content && item.content.toLowerCase().includes(kw)) ||
		(item.author && item.author.toLowerCase().includes(kw))
	)
})

const groupedList = computed(() => {
	const map = {}
	const order = []
	filteredList.value.forEach(item => {
		if (!map[item.date]) {
			map[item.date] = { date: item.date, items: [] }
			order.push(item.date)
		}
		map[item.date].items.push(item)
	})
	order.sort((a, b) => b.localeCompare(a))
	return order.map(d => map[d])
})

const getUserId = async () => {
	const token = uni.getStorageSync('uni_id_token')
	const userInfo = uni.getStorageSync('uni_id_user_info')
	if (token && userInfo) return token
	return null
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

const loadFavorites = async () => {
	loading.value = true
	try {
		const user_id = await getUserId()
		if (!user_id) {
			favorites.value = []
			return
		}
		const res = await uniCloud.callFunction({
			name: 'toggle_favorite',
			data: { action: 'list', user_id }
		}).catch(e => {
			console.error('load favorites cloud fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			favorites.value = res.result.data || []
		}
	} catch (e) {
		console.error('load favorites fail:', e)
		favorites.value = []
	} finally {
		loading.value = false
	}
}

const removeFavorite = async (item) => {
	if (!requireLogin('/pages/favorites/favorites')) return
	uni.showModal({
		title: '取消收藏',
		content: '确定取消收藏？',
		success: async (res) => {
			if (!res.confirm) return
			try {
				const user_id = await getUserId()
				await uniCloud.callFunction({
					name: 'toggle_favorite',
					data: { action: 'remove', user_id, date: item.date, content: item.content }
				}).catch(e => console.error('remove favorite cloud fail:', e))
				favorites.value = favorites.value.filter(f =>
					!(f.date === item.date && f.content === item.content)
				)
				uni.showToast({ title: '已取消', icon: 'none' })
			} catch (e) {
				uni.showToast({ title: '操作失败', icon: 'none' })
			}
		}
	})
}

const doSearch = () => {}
const clearSearch = () => { keyword.value = '' }

onMounted(() => {
	if (!requireLogin('/pages/favorites/favorites')) return
	loadFavorites()
})
</script>

<style>
page { background-color: #F0F1F5; }
.container { padding: 30rpx; }

.search-bar { display: flex; align-items: center; gap: 16rpx; margin-bottom: 24rpx; }
.search-input { flex: 1; height: 72rpx; background: rgba(0,0,0,0.04); border-radius: 36rpx; padding: 0 28rpx; font-size: 28rpx; color: #333; }
.search-btn { padding: 0 8rpx; }
.search-btn-text { font-size: 28rpx; color: #007AFF; }

.page-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 24rpx; }
.page-title { font-size: 36rpx; font-weight: bold; color: #333; }
.page-subtitle { font-size: 24rpx; color: #999; }

.date-group { margin-bottom: 24rpx; }
.date-header { display: flex; align-items: center; justify-content: space-between; padding: 10rpx 8rpx; margin-bottom: 10rpx; border-bottom: 1px solid rgba(0,0,0,0.05); }
.date-label { font-size: 26rpx; font-weight: 600; color: #666; }
.date-count { font-size: 22rpx; color: #CCC; }

.fav-card { background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%); border-radius: 20rpx; padding: 28rpx; margin-bottom: 14rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); backdrop-filter: blur(12rpx); }
.fav-content { font-size: 30rpx; color: #333; line-height: 1.6; display: block; }
.fav-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 14rpx; }
.fav-author { font-size: 24rpx; color: #999; }
.fav-remove { padding: 8rpx 16rpx; }
.remove-text { font-size: 24rpx; color: #CCC; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding-top: 200rpx; }
.empty-text { font-size: 32rpx; color: #999; margin-bottom: 10rpx; }
.empty-hint { font-size: 26rpx; color: #CCC; }

.loading-state { display: flex; justify-content: center; padding-top: 200rpx; }
.loading-text { font-size: 28rpx; color: #999; }
</style>
