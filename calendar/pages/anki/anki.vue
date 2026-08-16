<template>
	<view class="container">
		<!-- 顶部标签 -->
		<view class="tab-bar">
			<view class="tab" :class="{ 'tab-active': currentTab === 'review' }" @click="switchTab('review')">
				<text class="tab-text">复习</text>
			</view>
			<view class="tab" :class="{ 'tab-active': currentTab === 'library' }" @click="switchTab('library')">
				<text class="tab-text">知识库</text>
			</view>
			<view class="tab" :class="{ 'tab-active': currentTab === 'create' }" @click="goCreate">
				<text class="tab-text">创建</text>
			</view>
		</view>

		<!-- ===== 复习模式 ===== -->
		<view v-if="currentTab === 'review'">
			<view v-if="reviewCards.length === 0" class="empty-state">
				<text class="empty-text">暂无复习卡片</text>
				<text class="empty-hint">去知识库把卡片加入复习队列</text>
			</view>

			<view v-else>
				<!-- 3D翻转卡片 -->
				<view class="card-scene">
					<view class="card-3d" :class="{ 'card-flipped': isFlipped }" @click="isFlipped = !isFlipped">
						<view class="card-face card-front">
							<text class="card-label">问题</text>
							<scroll-view scroll-y class="card-scroll">
								<text class="card-content">{{ currentReviewCard.front }}</text>
							</scroll-view>
							<text class="card-hint">点击翻面看答案</text>
						</view>
						<view class="card-face card-back">
							<text class="card-label">答案</text>
							<scroll-view scroll-y class="card-scroll">
								<text class="card-content">{{ currentReviewCard.back }}</text>
							</scroll-view>
							<text class="card-hint">点击翻回问题</text>
						</view>
					</view>
				</view>

				<!-- 答案输入区 -->
				<view class="input-area">
					<text class="input-label">写下你的答案，对比上方标准答案：</text>
					<textarea
						class="answer-input"
						v-model="userAnswer"
						placeholder="在这里输入你的回答..."
						:maxlength="-1"
					/>
					<view class="compare-hint" v-if="userAnswer && isFlipped">
						<text class="compare-text" v-if="userAnswer.trim() === currentReviewCard.back.trim()">答案完全一致</text>
						<text class="compare-text compare-diff" v-else>答案有差异，再想想</text>
					</view>
				</view>

				<!-- 翻面+切换按钮 -->
				<view class="review-actions">
					<view class="action-pill" @click="prevCard">
						<text class="action-pill-text">上一张</text>
					</view>
					<view class="action-pill action-pill-flip" @click="isFlipped = !isFlipped">
						<text class="action-pill-text">{{ isFlipped ? '翻回' : '翻面' }}</text>
					</view>
					<view class="action-pill" @click="nextCard">
						<text class="action-pill-text">下一张</text>
					</view>
				</view>
				<text class="card-index">{{ currentIndex + 1 }} / {{ reviewCards.length }}</text>
			</view>
		</view>

		<!-- ===== 知识库列表 ===== -->
		<view v-if="currentTab === 'library'">
			<!-- 搜索框 -->
			<view class="search-bar">
				<input class="search-input" v-model="keyword" placeholder="搜索卡片..." />
			</view>

			<view v-if="filteredLibrary.length === 0" class="empty-state">
				<text class="empty-text">暂无卡片</text>
			</view>

			<view class="card-list">
				<view class="card-item" v-for="card in filteredLibrary" :key="card._id">
					<view class="card-item-body">
						<text class="card-item-front">{{ card.front }}</text>
						<text class="card-item-back">{{ card.back }}</text>
						<view class="card-item-tags">
							<text class="card-item-deck">{{ card.deck }}</text>
							<view class="status-tag" :class="card.status === 'review' ? 'tag-review' : 'tag-library'">
								<text class="status-tag-text">{{ card.status === 'review' ? '复习中' : '知识库' }}</text>
							</view>
						</view>
					</view>
					<view class="card-item-actions">
						<view class="toggle-btn" @click="toggleStatus(card)">
							<text class="toggle-btn-text">{{ card.status === 'review' ? '移出' : '加入复习' }}</text>
						</view>
						<view class="card-item-del" @click="deleteCard(card._id)">
							<text class="del-text">删除</text>
						</view>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getUid, requireLogin } from '@/utils/auth.js'
import { callApi } from '@/utils/cloud.js'

const currentTab = ref('review')
const reviewCards = ref([])
const allCards = ref([])
const currentIndex = ref(0)
const isFlipped = ref(false)
const userAnswer = ref('')
const keyword = ref('')

const currentReviewCard = computed(() => {
	return reviewCards.value[currentIndex.value] || { front: '暂无内容', back: '' }
})

const filteredLibrary = computed(() => {
	if (!keyword.value.trim()) return allCards.value
	const kw = keyword.value.trim().toLowerCase()
	return allCards.value.filter(card =>
		(card.front && card.front.toLowerCase().includes(kw)) ||
		(card.back && card.back.toLowerCase().includes(kw)) ||
		(card.deck && card.deck.toLowerCase().includes(kw))
	)
})

const switchTab = (tab) => {
	currentTab.value = tab
	if (tab === 'review') loadReviewCards()
	if (tab === 'library') loadAllCards()
}

const loadReviewCards = async () => {
	try {
		const user_id = getUid()
		const res = await callApi('flashcards', 'list', { user_id, status: 'review' }).catch(e => {
			console.error('load review cards call fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			reviewCards.value = res.result.data || []
			currentIndex.value = 0
			isFlipped.value = false
			userAnswer.value = ''
		}
	} catch (e) { console.error('load review cards fail:', e) }
}

const loadAllCards = async () => {
	try {
		const user_id = getUid()
		const res = await callApi('flashcards', 'list', { user_id }).catch(e => {
			console.error('load all cards call fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) allCards.value = res.result.data || []
	} catch (e) { console.error('load all cards fail:', e) }
}

const toggleStatus = async (card) => {
	const newStatus = card.status === 'review' ? 'library' : 'review'
	try {
		const user_id = getUid()
		await callApi('flashcards', 'updateStatus', { user_id, card_id: card._id, new_status: newStatus }).catch(e => {
			console.error('updateStatus call fail:', e)
		})
		card.status = newStatus
		uni.showToast({ title: newStatus === 'review' ? '已加入复习' : '已移出复习', icon: 'none' })
	} catch (e) {
		uni.showToast({ title: '操作失败', icon: 'none' })
	}
}

const nextCard = () => {
	currentIndex.value = currentIndex.value < reviewCards.value.length - 1 ? currentIndex.value + 1 : 0
	isFlipped.value = false
	userAnswer.value = ''
}

const prevCard = () => {
	currentIndex.value = currentIndex.value > 0 ? currentIndex.value - 1 : reviewCards.value.length - 1
	isFlipped.value = false
	userAnswer.value = ''
}

const deleteCard = async (cardId) => {
	uni.showModal({
		title: '删除', content: '确定删除？',
		success: async (res) => {
			if (!res.confirm) return
			const user_id = getUid()
			await callApi('flashcards', 'delete', { user_id, card_id: cardId }).catch(e => console.error('delete card fail:', e))
			allCards.value = allCards.value.filter(c => c._id !== cardId)
			reviewCards.value = reviewCards.value.filter(c => c._id !== cardId)
			if (currentIndex.value >= reviewCards.value.length) currentIndex.value = Math.max(0, reviewCards.value.length - 1)
			uni.showToast({ title: '已删除', icon: 'none' })
		}
	})
}

const goCreate = () => {
	if (!requireLogin('/pages/create-card/create-card')) return
	uni.navigateTo({ url: '/pages/create-card/create-card' })
}

onMounted(() => { loadReviewCards() })
</script>

<style>
page { background-color: #F0F1F5; }
.container { padding: 30rpx; }

.tab-bar { display: flex; gap: 8rpx; margin-bottom: 30rpx; background: rgba(0,0,0,0.04); border-radius: 16rpx; padding: 6rpx; }
.tab { flex: 1; text-align: center; padding: 16rpx 0; border-radius: 12rpx; transition: all 0.2s; }
.tab-active { background: #FFF; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.06); }
.tab-text { font-size: 28rpx; color: #999; }
.tab-active .tab-text { color: #333; font-weight: 600; }

/* 3D翻转 */
.card-scene { perspective: 1200rpx; margin-bottom: 20rpx; }
.card-3d { width: 100%; height: 400rpx; position: relative; transition: transform 0.6s; transform-style: preserve-3d; }
.card-flipped { transform: rotateY(180deg); }
.card-face { position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 24rpx; padding: 32rpx; box-sizing: border-box; display: flex; flex-direction: column; box-shadow: 0 8rpx 32rpx rgba(0,0,0,0.08); }
.card-front { background: linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(245,246,250,0.9) 100%); }
.card-back { background: linear-gradient(145deg, #2A2A2A 0%, #1A1A1A 100%); transform: rotateY(180deg); }
.card-label { font-size: 22rpx; color: #BBB; margin-bottom: 12rpx; }
.card-back .card-label { color: rgba(255,255,255,0.3); }
.card-scroll { flex: 1; }
.card-content { font-size: 34rpx; line-height: 1.6; color: #333; font-weight: 500; }
.card-back .card-content { color: #FFF; }
.card-hint { font-size: 22rpx; color: #CCC; text-align: center; margin-top: 10rpx; }
.card-back .card-hint { color: rgba(255,255,255,0.2); }

/* 答案输入区 */
.input-area { margin-bottom: 20rpx; }
.input-label { font-size: 24rpx; color: #999; margin-bottom: 10rpx; display: block; }
.answer-input { width: 100%; height: 180rpx; background: rgba(255,255,255,0.9); border-radius: 20rpx; padding: 24rpx; font-size: 28rpx; color: #333; box-sizing: border-box; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); }
.compare-hint { margin-top: 12rpx; text-align: center; }
.compare-text { font-size: 26rpx; color: #4CAF50; }
.compare-diff { color: #FF9800; }

/* 操作 */
.review-actions { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
.action-pill { display: inline-flex; padding: 12rpx 32rpx; border-radius: 30rpx; background: rgba(0,0,0,0.04); }
.action-pill:active { transform: scale(0.96); }
.action-pill-flip { background: #333; }
.action-pill-flip .action-pill-text { color: #FFF; }
.action-pill-text { font-size: 26rpx; color: #666; }
.card-index { font-size: 22rpx; color: #CCC; text-align: center; display: block; }

/* 搜索 */
.search-bar { margin-bottom: 20rpx; }
.search-input { width: 100%; height: 72rpx; background: rgba(255,255,255,0.9); border-radius: 16rpx; padding: 0 24rpx; font-size: 28rpx; color: #333; box-sizing: border-box; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04); }

/* 知识库 */
.card-list { display: flex; flex-direction: column; gap: 14rpx; }
.card-item { display: flex; align-items: center; background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%); border-radius: 20rpx; padding: 24rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); backdrop-filter: blur(12rpx); }
.card-item-body { flex: 1; }
.card-item-front { font-size: 30rpx; color: #333; font-weight: 500; display: block; }
.card-item-back { font-size: 26rpx; color: #999; margin-top: 8rpx; display: block; }
.card-item-tags { display: flex; align-items: center; gap: 10rpx; margin-top: 6rpx; }
.card-item-deck { font-size: 22rpx; color: #CCC; }
.status-tag { padding: 4rpx 12rpx; border-radius: 8rpx; }
.tag-review { background: rgba(0,122,255,0.08); }
.tag-review .status-tag-text { color: #007AFF; font-size: 20rpx; }
.tag-library { background: rgba(0,0,0,0.04); }
.tag-library .status-tag-text { color: #999; font-size: 20rpx; }

.card-item-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8rpx; }
.toggle-btn { padding: 8rpx 16rpx; border-radius: 12rpx; background: rgba(0,0,0,0.04); }
.toggle-btn:active { background: rgba(0,0,0,0.08); }
.toggle-btn-text { font-size: 22rpx; color: #666; }
.card-item-del { padding: 8rpx 16rpx; }
.del-text { font-size: 22rpx; color: #CCC; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding-top: 160rpx; }
.empty-text { font-size: 32rpx; color: #999; margin-bottom: 10rpx; }
.empty-hint { font-size: 26rpx; color: #CCC; }
</style>
