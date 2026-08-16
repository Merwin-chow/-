<template>
	<view class="container">
		<!-- 搜索栏 -->
		<view class="search-bar">
			<input
				class="search-input"
				v-model="keyword"
				placeholder="搜索卡片和收藏..."
				confirm-type="search"
				@confirm="doSearch"
				:focus="true"
			/>
			<view class="search-btn" @click="doSearch">
				<text class="search-btn-text">搜索</text>
			</view>
		</view>

		<!-- 结果区 -->
		<view v-if="hasSearched">
			<!-- 卡片结果 -->
			<view v-if="cardResults.length > 0" class="result-section">
				<text class="result-title">卡片 ({{ cardResults.length }})</text>
				<view class="result-card" v-for="item in cardResults" :key="'c' + item._id">
					<text class="result-front">{{ item.front }}</text>
					<text class="result-back">{{ item.back }}</text>
					<text class="result-deck">{{ item.deck }}</text>
				</view>
			</view>

			<!-- 收藏结果 -->
			<view v-if="favResults.length > 0" class="result-section">
				<text class="result-title">收藏 ({{ favResults.length }})</text>
				<view class="result-card" v-for="item in favResults" :key="'f' + item._id">
					<text class="result-front">{{ item.content }}</text>
					<text class="result-back">{{ item.author || '佚名' }}</text>
					<text class="result-deck">{{ item.date }}</text>
				</view>
			</view>

			<!-- 无结果 -->
			<view v-if="cardResults.length === 0 && favResults.length === 0" class="empty-state">
				<text class="empty-text">没有找到相关内容</text>
			</view>
		</view>
	</view>
</template>

<script setup>
import { ref } from 'vue'
import { getUid } from '@/utils/auth.js'
import { callApi } from '@/utils/cloud.js'

const keyword = ref('')
const cardResults = ref([])
const favResults = ref([])
const hasSearched = ref(false)

const doSearch = async () => {
	const kw = keyword.value.trim()
	if (!kw) return
	hasSearched.value = true

	const user_id = getUid()

	// 搜卡片（DB 正则过滤，page_size 200 覆盖当前一次性列表展示）
	try {
		const res = await callApi('flashcards', 'search', { user_id, keyword: kw, page: 1, page_size: 200 })
		cardResults.value = (res?.result && res.result.code === 200) ? (res.result.data || []) : []
	} catch (e) {
		cardResults.value = []
	}

	// 搜收藏（改走云函数，删除客户端直查）
	try {
		const res = await callApi('toggle_favorite', 'search', { user_id, keyword: kw })
		favResults.value = (res?.result && res.result.code === 200) ? (res.result.data || []) : []
	} catch (e) {
		favResults.value = []
	}
}
</script>

<style>
page { background-color: #F0F1F5; }
.container { padding: 30rpx; }

.search-bar { display: flex; align-items: center; gap: 16rpx; margin-bottom: 30rpx; }
.search-input { flex: 1; height: 72rpx; background: rgba(0,0,0,0.04); border-radius: 36rpx; padding: 0 28rpx; font-size: 28rpx; color: #333; }
.search-btn { padding: 0 8rpx; }
.search-btn-text { font-size: 28rpx; color: #007AFF; }

.result-section { margin-bottom: 32rpx; }
.result-title { font-size: 26rpx; color: #999; font-weight: 600; margin-bottom: 14rpx; display: block; }

.result-card {
	background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%);
	border-radius: 20rpx;
	padding: 24rpx;
	margin-bottom: 12rpx;
	box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04);
	backdrop-filter: blur(12rpx);
}
.result-front { font-size: 30rpx; color: #333; font-weight: 500; display: block; }
.result-back { font-size: 26rpx; color: #999; margin-top: 8rpx; display: block; }
.result-deck { font-size: 22rpx; color: #CCC; margin-top: 6rpx; display: block; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding-top: 160rpx; }
.empty-text { font-size: 32rpx; color: #999; }
</style>
