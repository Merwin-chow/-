<template>
	
	
	<view class="container">
		<!-- 头部 -->
		<view class="header-row">
			<view class="header" hover-class="header-active" @click="openCalendar">
				<text class="date-number">{{ displayDay }}</text>
				<view class="date-info">
					<text class="month">{{ displayMonthYear }}</text>
					<text class="weekday">{{ displayWeekday }}</text>
				</view>
				<view class="calendar-hint">
					<text class="hint-text">切换日期</text>
				</view>
			</view>
			<view class="user-avatar-btn" @click="goLogin">
				<text class="avatar-initial">{{ userInitial }}</text>
			</view>
		</view>

		<!-- 每日一言 swiper -->
		<view class="section-title">每日一言</view>
		<view class="swiper-wrap" v-if="quoteList.length > 0">
			<swiper
				class="quote-swiper"
				:current="currentSwiperIndex"
				@change="onSwiperChange"
				:circular="false"
				:duration="300"
			>
				<swiper-item v-for="(item, index) in quoteList" :key="index">
					<view class="card quote-card" :class="'card-' + item.source">
						<!-- source 标签 -->
						<view class="source-tag" v-if="sourceLabel(item.source)">
							<text class="source-text">{{ sourceLabel(item.source) }}</text>
						</view>

						<!-- ===== 单向历 ===== -->
						<view v-if="item.source === 'singlecal'" class="singlecal-wrap">
							<text class="singlecal-title">单向历</text>
							<text class="singlecal-sub">每一天都值得被认真对待</text>
							<view class="singlecal-btn" @click.stop="jumpToSingleCal">
								<text class="singlecal-btn-text">打开小程序</text>
							</view>
						</view>

						<view v-else-if="item.source === 'lishi'" class="lishi-wrap">
							<scroll-view scroll-y class="lishi-scroll">
								<view class="lishi-list">
									<view class="lishi-item" v-for="(ev, ei) in item.events" :key="ei">
										<view class="lishi-dot-wrap">
											<view class="lishi-dot"></view>
											<view class="lishi-line" v-if="ei < item.events.length - 1"></view>
										</view>
										<view class="lishi-content">
											<text class="lishi-year">{{ ev.year }}年</text>
											<text class="lishi-title">{{ ev.title }}</text>
										</view>
									</view>
								</view>
							</scroll-view>
						</view>

						<view v-else class="card-body">
							<scroll-view scroll-y class="quote-scroll">
								<text class="quote-text">{{ item.quote }}</text>
							</scroll-view>
							<text class="quote-author" v-if="item.author">—— {{ item.author }}</text>
						</view>

						<!-- 操作栏 -->
						<view class="card-actions">
							<view class="action-group" v-if="item.source !== 'singlecal' && item.source !== 'lishi'">
								<view
									class="action-pill"
									:class="{ 'action-pill-active': item.isFavorited }"
									@click.stop="toggleFavorite(item, index)"
								>
									<text class="action-pill-text">{{ item.isFavorited ? '已收藏' : '收藏' }}</text>
								</view>
								<view
									v-if="item.source === 'jinrishici' && item.book_name"
									class="action-pill action-pill-link"
									@click.stop="jumpToWeRead(item.book_name)"
								>
									<text class="action-pill-text action-pill-link-text">微信读书</text>
								</view>
							</view>
							<view v-else></view>
							<text class="swiper-counter" :class="{ 'sc-counter-light': item.source === 'singlecal' }">{{ currentSwiperIndex + 1 }} / {{ quoteList.length }}</text>
						</view>
					</view>
				</swiper-item>
			</swiper>
		</view>
		<view class="card quote-card card-loading" v-else>
			<text class="quote-text" style="text-align:center; padding-top:80rpx;">加载中...</text>
		</view>

		<!-- 今日思考 -->
		<view class="card quiz-card" v-if="question">
			<view class="card-title">今日专业思考</view>
			<text class="quiz-question">{{ question }}</text>
			<button class="quiz-toggle-btn" @click="showAnswer = !showAnswer">
				{{ showAnswer ? '收起' : '查看解析' }}
			</button>
			<view class="quiz-answer" v-if="showAnswer">{{ answer }}</view>
		</view>

		<!-- 底部栏 -->
		<view class="bottom-bar">
			<view class="bar-item" @click="goFavorites">
				<text class="bar-label">收藏</text>
			</view>
			<view class="bar-item" @click="goAnki">
				<text class="bar-label">知识</text>
			</view>
			<view class="bar-item" @click="goSchedule">
				<text class="bar-label">日程</text>
			</view>
		</view>

		<uni-calendar
			ref="calendarRef"
			:insert="false"
			:lunar="true"
			:selected="calendarMarks"
			@confirm="calendarConfirm"
			@monthSwitch="onMonthSwitch"
		/>
	</view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getUid, requireLogin } from '@/utils/auth.js'
import { callApi } from '@/utils/cloud.js'

const calendarRef = ref(null)
const displayDay = ref('')
const displayMonthYear = ref('')
const displayWeekday = ref('')
const currentQueryDateStr = ref('')
const calendarMarks = ref([])
const userInitial = ref('游')

const quoteList = ref([])
const currentSwiperIndex = ref(0)
const question = ref('')
const answer = ref('')
const showAnswer = ref(false)

const APPID_WEREAD = 'wx8a5d6f9fad07544e'
const APPID_SINGLECAL = 'wxf510f247ff69b85e'

const SOURCE_LABELS = {
	jinrishici: '诗词',
	hitokoto: '一言',
	tianapi_ai: 'AI',
	generalnews: '新闻',
	lishi: '历史今天',
	singlecal: '单向历',
	manual: '编辑推荐'
}

const sourceLabel = (s) => SOURCE_LABELS[s] || ''

const initDateDisplay = (dateObj) => {
	const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
	displayDay.value = dateObj.getDate()
	displayMonthYear.value = `${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`
	displayWeekday.value = days[dateObj.getDay()]
	const y = dateObj.getFullYear()
	const m = String(dateObj.getMonth() + 1).padStart(2, '0')
	const d = String(dateObj.getDate()).padStart(2, '0')
	currentQueryDateStr.value = `${y}-${m}-${d}`
}

const openCalendar = () => {
	if (calendarRef.value) calendarRef.value.open()
}

const calendarConfirm = (e) => {
	const parts = e.fulldate.split('-')
	initDateDisplay(new Date(parts[0], parts[1] - 1, parts[2]))
	showAnswer.value = false
	currentSwiperIndex.value = 0
	loadData(e.fulldate)
	uni.showToast({ title: '切换至 ' + e.fulldate, icon: 'none' })
}

const onMonthSwitch = (e) => {
	if (e?.year && e?.month) {
		loadCalendarMarks(`${e.year}-${String(e.month).padStart(2, '0')}`)
		return
	}
	loadCalendarMarks()
}

const loadCalendarMarks = async (month = currentMonth()) => {
	try {
		const user_id = getUid()
		if (!user_id) return
		const res = await callApi('toggle_favorite', 'getMarks', { user_id, month }).catch(e => {
			console.error('getMarks call fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			calendarMarks.value = res.result.data || []
		}
	} catch (e) {
		console.error('load marks fail:', e)
	}
}

const currentMonth = () => {
	const d = new Date()
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const FALLBACK_QUOTES = [
	{ quote: '人生如逆旅，我亦是行人。', author: '苏轼', source: 'fallback', book_name: '' },
	{ quote: '山中何事？松花酿酒，春水煎茶。', author: '张可久', source: 'fallback', book_name: '' },
	{ quote: '浮生若梦，为欢几何。', author: '李白', source: 'fallback', book_name: '' },
	{ quote: '此心安处是吾乡。', author: '苏轼', source: 'fallback', book_name: '' },
	{ quote: '人间有味是清欢。', author: '苏轼', source: 'fallback', book_name: '' },
	{ quote: '世事一场大梦，人生几度秋凉。', author: '苏轼', source: 'fallback', book_name: '' },
	{ quote: '采菊东篱下，悠然见南山。', author: '陶渊明', source: 'fallback', book_name: '' },
	{ quote: '行到水穷处，坐看云起时。', author: '王维', source: 'fallback', book_name: '' }
]

const getFallbackQuote = (dateStr) => {
	const day = dateStr ? Number(String(dateStr).slice(-2)) : new Date().getDate()
	const dayIndex = (Number.isFinite(day) ? day : new Date().getDate()) % FALLBACK_QUOTES.length
	return { ...FALLBACK_QUOTES[dayIndex], isFavorited: false }
}

const createSingleCalCard = () => ({
	quote: '',
	author: '',
	source: 'singlecal',
	book_name: '',
	isFavorited: false
})

const buildQuoteList = (normalCards, lishiEvents) => {
	const list = []
	const poetry = normalCards.find(i => i.source === 'jinrishici')
	if (poetry) list.push(poetry)
	list.push(createSingleCalCard())
	normalCards.forEach(item => {
		if (item.source !== 'jinrishici') list.push(item)
	})
	if (lishiEvents.length > 0) {
		list.push({
			quote: '',
			author: '',
			source: 'lishi',
			book_name: '',
			isFavorited: false,
			events: lishiEvents
		})
	}
	return list
}

const updateDailyQuestion = (list) => {
	const manualItem = list.find(i => i.source === 'manual')
	question.value = manualItem?.question || ''
	answer.value = manualItem?.answer || ''
}

const loadData = async (dateStr) => {
	try {
		quoteList.value = [{ quote: '加载中...', author: '', source: 'loading', isFavorited: false }]

		// 今日诗词已由 get_daily_quote 云函数代理（Phase 6.7），前端不再直调/携带 token
		const cloudRes = await uniCloud.callFunction({
			name: 'get_daily_quote',
			data: { date: dateStr || currentQueryDateStr.value }
		}).catch(e => {
			console.error('get_daily_quote fail:', e)
			return { result: null }
		})

		const normalCards = []
		const lishiEvents = []

		if (cloudRes?.result && cloudRes.result.code === 200 && cloudRes.result.data) {
			cloudRes.result.data.forEach(item => {
				if (item.source === 'lishi') {
					lishiEvents.push({ year: item.year || '', title: item.quote || '' })
				} else {
					normalCards.push({ ...item, isFavorited: false })
				}
			})
		}

		if (normalCards.length === 0 && lishiEvents.length === 0) {
			normalCards.push(getFallbackQuote(dateStr))
		}

		const list = buildQuoteList(normalCards, lishiEvents)
		quoteList.value = list
		await checkFavoriteStatus(list)
		updateDailyQuestion(list)
	} catch (e) {
		console.error('loadData fail:', e)
		quoteList.value = [getFallbackQuote(dateStr), createSingleCalCard()]
		question.value = ''
		answer.value = ''
	}
}

const checkFavoriteStatus = async (list) => {
	try {
		const user_id = getUid()
		if (!user_id || user_id.startsWith('visitor_')) return
		const items = list
			.map((it, idx) => ({ idx, content: it.quote }))
			.filter(x => x.content)
		if (!items.length) return
		const res = await callApi('toggle_favorite', 'checkBatch', {
			user_id,
			items: items.map(x => ({ date: currentQueryDateStr.value, content: x.content }))
		}).catch(() => null)
		if (!res?.result || res.result.code !== 200) return
		const data = res.result.data || []
		for (let k = 0; k < data.length; k++) {
			if (data[k].isFavorited) quoteList.value[items[k].idx].isFavorited = true
		}
	} catch (e) {
		console.error('check fav fail:', e)
	}
}

const toggleFavorite = async (item, index) => {
	try {
		const user_id = getUid()
		if (!user_id || user_id.startsWith('visitor_')) { uni.showToast({ title: '请先登录', icon: 'none' }); return }
		const action = item.isFavorited ? 'remove' : 'add'
		const res = await callApi('toggle_favorite', action, { user_id, date: currentQueryDateStr.value, content: item.quote, author: item.author, source: item.source }).catch(e => {
			console.error('toggle_favorite call fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			quoteList.value[index].isFavorited = res.result.isFavorited
			uni.showToast({ title: res.result.isFavorited ? '已收藏' : '已取消', icon: 'none' })
			loadCalendarMarks()
		} else {
			uni.showToast({ title: '操作失败，请稍后重试', icon: 'none' })
		}
	} catch (e) { console.error('toggle fav fail:', e) }
}

const onSwiperChange = (e) => { currentSwiperIndex.value = e.detail.current }

const jumpToWeRead = (keyword) => {
	uni.navigateToMiniProgram({
		appId: APPID_WEREAD,
		path: `/pages/search/search?keyword=${encodeURIComponent(keyword)}`,
		fail: () => {
			uni.setClipboardData({ data: keyword, success: () => { uni.showToast({ title: `已复制「${keyword}」`, icon: 'none' }) } })
		}
	})
}

const jumpToSingleCal = () => {
	uni.navigateToMiniProgram({
		appId: APPID_SINGLECAL,
		fail: () => { uni.showToast({ title: '请在微信中打开', icon: 'none' }) }
	})
}

const goFavorites = () => {
	if (!requireLogin('/pages/favorites/favorites')) return
	uni.navigateTo({ url: '/pages/favorites/favorites' })
}
const goAnki = () => {
	if (!requireLogin('/pages/anki/anki')) return
	uni.navigateTo({ url: '/pages/anki/anki' })
}
const goSchedule = () => {
	if (!requireLogin('/pages/schedule/schedule')) return
	uni.navigateTo({ url: '/pages/schedule/schedule' })
}
const goLogin = () => {
	uni.navigateTo({ url: `/pages/login/login?redirect=${encodeURIComponent('/pages/index/index')}` })
}

const updateUserInitial = () => {
	const info = uni.getStorageSync('uni_id_user_info')
	if (info) {
		try {
			const parsed = JSON.parse(info)
			userInitial.value = (parsed.nickname || '游').charAt(0)
		} catch (e) {}
	}
}

onMounted(() => {
	initDateDisplay(new Date())
	loadData()
	loadCalendarMarks()
	updateUserInitial()
})
</script>

<style>
page { background-color: #F0F1F5; }
.container { padding: 30rpx; padding-bottom: 140rpx; }

/* ===== 头部 ===== */
.header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40rpx; margin-top: 20rpx; }
.header { display: flex; align-items: center; flex: 1; padding: 20rpx 16rpx; border-radius: 16rpx; transition: background-color 0.2s; }
.header-active { background-color: #E4E5EA; }
.user-avatar-btn { width: 64rpx; height: 64rpx; border-radius: 32rpx; background: #333; display: flex; align-items: center; justify-content: center; margin-left: 16rpx; flex-shrink: 0; }
.user-avatar-btn:active { opacity: 0.7; }
.avatar-initial { font-size: 26rpx; color: #FFF; font-weight: 500; }
.date-number { font-size: 80rpx; font-weight: bold; color: #333; margin-right: 20rpx; }
.date-info { display: flex; flex-direction: column; }
.month, .weekday { font-size: 28rpx; color: #666; }
.calendar-hint { margin-left: auto; padding: 8rpx 16rpx; background: rgba(0,0,0,0.04); border-radius: 30rpx; }
.hint-text { font-size: 22rpx; color: #999; }

/* ===== 标题 ===== */
.section-title { font-size: 26rpx; color: #999; font-weight: 600; margin-bottom: 16rpx; margin-left: 8rpx; }

/* ===== 卡片公共 - 液态玻璃渐变 ===== */
.card {
	border-radius: 24rpx;
	padding: 40rpx;
	margin-bottom: 30rpx;
	box-shadow: 0 8rpx 32rpx rgba(0,0,0,0.06), 0 2rpx 8rpx rgba(0,0,0,0.04);
}

/* ===== swiper ===== */
.swiper-wrap { margin-bottom: 30rpx; }
.quote-swiper { height: 460rpx; }

.quote-card {
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	height: 100%;
	box-sizing: border-box;
	position: relative;
}

/* 普通卡片渐变背景 */
.card-loading,
.quote-card {
	background: linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(245,246,250,0.85) 50%, rgba(235,238,245,0.8) 100%);
	backdrop-filter: blur(20rpx);
}

/* ===== source 标签 ===== */
.source-tag {
	position: absolute;
	top: 0;
	left: 0;
	background: rgba(0,0,0,0.04);
	backdrop-filter: blur(10rpx);
	border-radius: 24rpx 0 20rpx 0;
	padding: 6rpx 18rpx;
}
.source-text { font-size: 20rpx; color: #999; }

/* ===== 普通卡片内容 ===== */
.card-body { flex: 1; display: flex; flex-direction: column; justify-content: center; padding-top: 24rpx; }
.quote-scroll { flex: 1; max-height: 260rpx; }
.quote-text { font-size: 32rpx; color: #333; line-height: 1.7; font-weight: 500; white-space: pre-wrap; }
.quote-author { display: block; text-align: right; margin-top: 16rpx; font-size: 26rpx; color: #999; }

/* ===== 操作药丸按钮 ===== */
.action-pill {
	display: inline-flex;
	align-items: center;
	padding: 8rpx 22rpx;
	border-radius: 30rpx;
	background: rgba(0,0,0,0.04);
	transition: all 0.2s;
}
.action-pill:active { transform: scale(0.96); }
.action-pill-text { font-size: 24rpx; color: #888; }

.action-pill-active {
	background: rgba(0,0,0,0.08);
}
.action-pill-active .action-pill-text { color: #333; font-weight: 500; }

.action-pill-link {
	background: rgba(0,122,255,0.06);
}
.action-pill-link-text { color: #007AFF; }

/* ===== 操作栏 ===== */
.card-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 20rpx; padding-top: 16rpx; border-top: 1px solid rgba(0,0,0,0.04); }
.action-group { display: flex; align-items: center; gap: 12rpx; }
.swiper-counter { font-size: 22rpx; color: #CCC; }

/* ===== 单向历黑白卡片 ===== */
.card-singlecal {
	background: linear-gradient(160deg, #1A1A1A 0%, #2A2A2A 40%, #1E1E1E 100%);
	box-shadow: 0 8rpx 40rpx rgba(0,0,0,0.3), inset 0 1rpx 0 rgba(255,255,255,0.05);
}
.card-singlecal .source-tag { background: rgba(255,255,255,0.06); }
.card-singlecal .source-text { color: rgba(255,255,255,0.3); }
.sc-counter-light { color: rgba(255,255,255,0.2) !important; }

.singlecal-wrap {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding-top: 20rpx;
}
.singlecal-title {
	font-size: 42rpx;
	font-weight: bold;
	color: #FFF;
	letter-spacing: 10rpx;
	margin-bottom: 14rpx;
}
.singlecal-sub {
	font-size: 24rpx;
	color: rgba(255,255,255,0.3);
	margin-bottom: 48rpx;
}
.singlecal-btn {
	display: inline-flex;
	align-items: center;
	padding: 14rpx 48rpx;
	border-radius: 40rpx;
	background: rgba(255,255,255,0.08);
	border: 1rpx solid rgba(255,255,255,0.12);
	backdrop-filter: blur(10rpx);
	transition: all 0.2s;
}
.singlecal-btn:active {
	background: rgba(255,255,255,0.15);
	transform: scale(0.97);
}
.singlecal-btn-text {
	font-size: 26rpx;
	color: rgba(255,255,255,0.7);
	letter-spacing: 2rpx;
}

/* ===== 历史今天时间轴 ===== */
.card-lishi {
	background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%);
	backdrop-filter: blur(20rpx);
}
.lishi-wrap { flex: 1; padding-top: 20rpx; }
.lishi-scroll { height: 340rpx; }
.lishi-list { padding-left: 8rpx; }
.lishi-item { display: flex; position: relative; padding-bottom: 24rpx; }
.lishi-dot-wrap { display: flex; flex-direction: column; align-items: center; width: 32rpx; flex-shrink: 0; position: relative; }
.lishi-dot { width: 10rpx; height: 10rpx; border-radius: 50%; background: #333; margin-top: 8rpx; flex-shrink: 0; z-index: 1; }
.lishi-line { width: 1rpx; flex: 1; background: #DDD; position: absolute; top: 18rpx; bottom: 0; left: 5rpx; }
.lishi-content { flex: 1; padding-left: 16rpx; }
.lishi-year { font-size: 26rpx; font-weight: bold; color: #333; display: block; }
.lishi-title { font-size: 24rpx; color: #666; line-height: 1.5; display: block; margin-top: 4rpx; }

/* ===== 今日思考 ===== */
.quiz-card {
	background: linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(245,246,250,0.85) 100%);
	backdrop-filter: blur(20rpx);
}
.card-title { font-size: 24rpx; color: #999; margin-bottom: 20rpx; font-weight: bold; }
.quiz-question { font-size: 30rpx; color: #333; line-height: 1.5; margin-bottom: 30rpx; display: block; }
.quiz-toggle-btn { background: #333; color: #FFF; border-radius: 40rpx; font-size: 28rpx; }
.quiz-answer { margin-top: 30rpx; padding-top: 30rpx; border-top: 1px dashed #DDD; font-size: 28rpx; color: #555; line-height: 1.6; }

/* ===== 底部栏 ===== */
.bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: center; gap: 80rpx; padding: 24rpx 0; padding-bottom: calc(24rpx + env(safe-area-inset-bottom)); background: rgba(255,255,255,0.85); backdrop-filter: blur(24rpx); box-shadow: 0 -2rpx 20rpx rgba(0,0,0,0.04); z-index: 100; }
.bar-item { display: flex; flex-direction: column; align-items: center; }
.bar-label { font-size: 24rpx; color: #666; }
</style>
