<template>
	<view class="container">
		<view class="form-group">
			<text class="form-label">正面（问题）</text>
			<textarea
				class="form-textarea"
				v-model="front"
				placeholder="输入卡片正面内容..."
				:maxlength="-1"
			/>
		</view>

		<view class="form-group">
			<text class="form-label">背面（答案）</text>
			<textarea
				class="form-textarea"
				v-model="back"
				placeholder="输入卡片背面内容..."
				:maxlength="-1"
			/>
		</view>

		<view class="form-group">
			<text class="form-label">分类（可选）</text>
			<input
				class="form-input"
				v-model="deck"
				placeholder="默认"
			/>
		</view>

		<view class="btn-row">
			<view class="submit-btn" :class="{ 'btn-disabled': !canSubmit }" @click="createCard">
				<text class="submit-btn-text">创建卡片</text>
			</view>
		</view>

		<!-- 批量导入提示 -->
		<view class="batch-section">
			<text class="form-label">批量导入</text>
			<text class="batch-hint">每行一张卡片，用 --- 分隔正面和背面</text>
			<textarea
				class="form-textarea batch-textarea"
				v-model="batchText"
				:placeholder="batchPlaceholder"
				:maxlength="-1"
			/>
			<view class="submit-btn" :class="{ 'btn-disabled': !batchText.trim() }" @click="batchImport">
				<text class="submit-btn-text">批量导入</text>
			</view>
		</view>

		<view class="toast" v-if="toastMsg">
			<text class="toast-text">{{ toastMsg }}</text>
		</view>
	</view>
</template>

<script setup>
import { ref, computed } from 'vue'

const front = ref('')
const back = ref('')
const deck = ref('')
const batchText = ref('')
const toastMsg = ref('')
const creating = ref(false)
const batchPlaceholder = '正面内容 --- 背面内容\n正面2 --- 背面2'

const canSubmit = computed(() => front.value.trim() && back.value.trim() && !creating.value)

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

const showToast = (msg) => {
	toastMsg.value = msg
	setTimeout(() => { toastMsg.value = '' }, 2000)
}

const requireLogin = () => {
	const token = uni.getStorageSync('uni_id_token')
	const userInfo = uni.getStorageSync('uni_id_user_info')
	if (!token || !userInfo) {
		uni.navigateTo({ url: `/pages/login/login?redirect=${encodeURIComponent('/pages/create-card/create-card')}` })
		return false
	}
	return true
}

const createCard = async () => {
	if (!requireLogin()) return
	if (!canSubmit.value) return
	creating.value = true
	try {
		const user_id = await getUserId()
		await uniCloud.callFunction({
			name: 'flashcards',
			data: {
				action: 'create',
				user_id,
				front: front.value.trim(),
				back: back.value.trim(),
				deck: deck.value.trim() || '默认',
				status: 'review'
			}
		}).catch(e => {
			console.error('create card cloud fail:', e)
			throw e
		})
		front.value = ''
		back.value = ''
		showToast('创建成功')
	} catch (e) {
		showToast('创建失败')
	} finally {
		creating.value = false
	}
}

const batchImport = async () => {
	if (!requireLogin()) return
	if (!batchText.value.trim()) return
	creating.value = true
	try {
		const user_id = await getUserId()
		const lines = batchText.value.trim().split('\n')
		let count = 0
		for (const line of lines) {
			const parts = line.split('---')
			if (parts.length >= 2) {
				const f = parts[0].trim()
				const b = parts.slice(1).join('---').trim()
				if (f && b) {
					await uniCloud.callFunction({
						name: 'flashcards',
						data: { action: 'create', user_id, front: f, back: b, deck: deck.value.trim() || '默认', status: 'review' }
					}).catch(e => console.error('batch create card fail:', e))
					count++
				}
			}
		}
		batchText.value = ''
		showToast(`成功导入 ${count} 张卡片`)
	} catch (e) {
		showToast('导入失败')
	} finally {
		creating.value = false
	}
}
</script>

<style>
page { background-color: #F0F1F5; }
.container { padding: 30rpx; }

.form-group { margin-bottom: 24rpx; }
.form-label { font-size: 26rpx; color: #999; font-weight: 600; margin-bottom: 12rpx; display: block; }
.form-textarea {
	width: 100%;
	height: 200rpx;
	background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%);
	border-radius: 20rpx;
	padding: 24rpx;
	font-size: 30rpx;
	color: #333;
	box-sizing: border-box;
	box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04);
	backdrop-filter: blur(12rpx);
}
.form-input {
	width: 100%;
	height: 80rpx;
	background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%);
	border-radius: 20rpx;
	padding: 0 24rpx;
	font-size: 30rpx;
	color: #333;
	box-sizing: border-box;
	box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04);
}

.btn-row { margin-top: 16rpx; }
.submit-btn {
	width: 100%;
	height: 88rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	background: #333;
	border-radius: 44rpx;
	transition: all 0.2s;
}
.submit-btn:active { transform: scale(0.98); }
.btn-disabled { opacity: 0.4; }
.submit-btn-text { font-size: 30rpx; color: #FFF; font-weight: 500; }

.batch-section { margin-top: 48rpx; padding-top: 32rpx; border-top: 1px solid rgba(0,0,0,0.05); }
.batch-hint { font-size: 22rpx; color: #CCC; margin-bottom: 12rpx; display: block; }
.batch-textarea { height: 240rpx; }

.toast {
	position: fixed;
	top: 200rpx;
	left: 50%;
	transform: translateX(-50%);
	background: rgba(0,0,0,0.75);
	border-radius: 16rpx;
	padding: 16rpx 32rpx;
	z-index: 999;
}
.toast-text { font-size: 28rpx; color: #FFF; }
</style>
