<template>
	<view class="container">
		<view class="loading-box" v-if="!loaded">
			<text class="loading-text">加载中...</text>
		</view>

		<template v-else>
			<!-- 状态条 -->
			<view class="status-bar">
				<view class="status-tag" :class="'tag-' + schedule.schedule_status">
					<text class="status-tag-text">{{ schedule.status_label }}</text>
				</view>
				<view class="scope-tag" v-if="schedule.scope === 'group'">
					<text class="scope-tag-text">{{ groupName || '群日程' }}</text>
				</view>
				<view class="scope-tag private-tag" v-else>
					<text class="scope-tag-text">私有</text>
				</view>
				<view class="status-tag tag-closed" v-if="isActivity && closed">
					<text class="status-tag-text">报名关闭</text>
				</view>
				<view class="status-bar-right" v-if="schedule.scope === 'group' && canManage">
					<view class="setting-pill" @click="openSettings">
						<text class="setting-pill-text">活动设置</text>
					</view>
				</view>
			</view>

			<!-- 主体卡片 -->
			<view class="card">
				<text class="detail-title">{{ schedule.title }}</text>
				<view class="info-row">
					<text class="info-label">类型</text>
					<text class="info-value">{{ typeLabel(schedule.type) }}</text>
				</view>
				<view class="info-row">
					<text class="info-label">日期</text>
					<text class="info-value">{{ schedule.date }}</text>
				</view>
				<view class="info-row">
					<text class="info-label">时间</text>
					<text class="info-value">{{ schedule.start_time ? schedule.start_time + (schedule.end_time ? ' ~ ' + schedule.end_time : '') : '全天' }}</text>
				</view>
				<view class="info-row" v-if="schedule.member_name">
					<text class="info-label">关联成员</text>
					<text class="info-value">{{ schedule.member_name }}</text>
				</view>
				<view class="info-row" v-if="schedule.description">
					<text class="info-label">备注</text>
					<text class="info-value">{{ schedule.description }}</text>
				</view>
				<view class="info-row" v-if="startingHint">
					<text class="info-label">提醒</text>
					<text class="info-value remind-value">{{ startingHint }}</text>
				</view>
			</view>

			<!-- 名额进度 -->
			<view class="card" v-if="isActivity && quota > 0">
				<view class="quota-head">
					<text class="card-title">名额进度</text>
					<text class="quota-num">{{ signedCount }} / {{ quota }}</text>
				</view>
				<view class="progress-track">
					<view class="progress-fill" :style="{ width: progressPercent + '%' }"></view>
				</view>
				<view class="quota-foot" v-if="closed && signedCount >= quota">
					<text class="quota-full-text">名额已满，报名已自动关闭</text>
				</view>
			</view>

			<!-- Tab 栏 -->
			<view class="tab-bar" v-if="schedule.scope === 'group'">
				<view class="tab-item" :class="{ 'tab-active': activeTab === t.key }" v-for="t in tabs" :key="t.key" @click="switchTab(t.key)">
					<text class="tab-text">{{ t.label }}</text>
				</view>
			</view>

			<!-- 报名 Tab -->
			<template v-if="activeTab === 'signup'">
				<view class="notify-bar" v-if="isActivity">
					<text class="notify-bar-text">有新报名或结果变动会通知发起人；群成员可在这里开启「报名提醒」</text>
					<view class="notify-btn" @click="toggleNotify">
						<text class="notify-btn-text">{{ mySubscribed ? '已开启' : '开启提醒' }}</text>
					</view>
				</view>

				<view class="card" v-if="!schedule.signup_enabled">
					<view class="empty-box">
						<text class="empty-text">该日程未开放报名</text>
					</view>
				</view>

				<template v-else>
					<!-- 我的报名状态 -->
					<view class="card" v-if="mySigned">
						<text class="card-title">我的报名</text>
						<template v-for="f in formMeta" :key="f.key">
							<view class="my-info-row" v-if="myRecord && myRecord.form_data && myRecord.form_data[f.key] !== undefined && myRecord.form_data[f.key] !== ''">
								<text class="info-label">{{ f.label }}</text>
								<text class="info-value">{{ displayValue(f, myRecord.form_data[f.key]) }}</text>
							</view>
						</template>
						<view class="signup-btn cancel-btn" @click="cancelSignup">
							<text class="signup-btn-text">取消报名</text>
						</view>
					</view>

					<!-- 已关闭且未报名 -->
					<view class="card" v-else-if="closed">
						<view class="empty-box">
							<text class="empty-text">{{ signedCount >= quota && quota > 0 ? '名额已满，无法报名' : '报名已关闭' }}</text>
						</view>
					</view>

					<!-- 报名表单 -->
					<view class="card" v-else>
						<text class="card-title">填写报名信息</text>
						<view class="form-row" v-for="f in formMeta" :key="f.key">
							<text class="form-label">{{ f.label }}<text v-if="f.required" class="req-star">*</text></text>
							<picker v-if="f.type === 'date'" mode="date" :value="signupForm[f.key] || ''" @change="e => signupForm[f.key] = e.detail.value">
								<view class="picker-view">
									<text class="picker-text" :class="{ 'picker-empty': !signupForm[f.key] }">{{ signupForm[f.key] || '请选择' }}</text>
								</view>
							</picker>
							<picker v-else-if="f.type === 'select'" :range="fieldOptions(f)" @change="e => signupForm[f.key] = fieldOptions(f)[e.detail.value]">
								<view class="picker-view">
									<text class="picker-text" :class="{ 'picker-empty': !signupForm[f.key] }">{{ signupForm[f.key] || '请选择' }}</text>
								</view>
							</picker>
							<view v-else-if="f.type === 'checkbox'" class="checkbox-wrap">
								<view class="check-item" v-for="op in (f.options || [])" :key="op" :class="{ 'check-on': (signupForm[f.key] || []).includes(op) }" @click="toggleCheck(f.key, op)">
									<text class="check-item-text">{{ op }}</text>
								</view>
							</view>
							<textarea v-else-if="f.type === 'textarea'" class="form-textarea" v-model="signupForm[f.key]" :placeholder="'请填写' + f.label" placeholder-class="ph" />
							<input v-else class="form-input" :type="f.type === 'number' ? 'number' : 'text'" v-model="signupForm[f.key]" :placeholder="'请填写' + f.label" placeholder-class="ph" />
						</view>
						<view class="signup-btn" @click="submitSignup">
							<text class="signup-btn-text">提交报名</text>
						</view>
					</view>
				</template>
			</template>

			<!-- 名单 Tab -->
			<template v-if="activeTab === 'list'">
				<view class="card">
					<text class="card-title">名单（{{ signupList.length }} 条记录）</text>
					<view class="search-row">
						<input class="search-input" v-model="listKeyword" placeholder="搜索姓名/身份/联系方式" placeholder-class="ph" />
					</view>
					<scroll-view scroll-x class="filter-scroll">
						<view class="filter-row">
							<view class="filter-pill" :class="{ 'pill-active': listStatusFilter === 'all' }" @click="listStatusFilter = 'all'">
								<text class="filter-pill-text">全部</text>
							</view>
							<view class="filter-pill" :class="{ 'pill-active': listStatusFilter === 'signed' }" @click="listStatusFilter = 'signed'">
								<text class="filter-pill-text">已报名</text>
							</view>
							<view class="filter-pill" :class="{ 'pill-active': listStatusFilter === 'cancelled' }" @click="listStatusFilter = 'cancelled'">
								<text class="filter-pill-text">已取消</text>
							</view>
							<view class="filter-pill" :class="{ 'pill-active': listSessionFilter === 'all' }" @click="listSessionFilter = 'all'">
								<text class="filter-pill-text">全部场次</text>
							</view>
							<view class="filter-pill" :class="{ 'pill-active': listSessionFilter === s.name }" v-for="s in sessions" :key="s.name" @click="listSessionFilter = s.name">
								<text class="filter-pill-text">{{ s.name }}</text>
							</view>
						</view>
					</scroll-view>
					<view class="empty-box" v-if="filteredList.length === 0">
						<text class="empty-text">暂无匹配记录</text>
					</view>
					<view class="record-item" v-for="r in filteredList" :key="r._id">
						<view class="record-avatar" :class="{ 'rec-cancelled': r.status === 'cancelled' }">
							<text class="record-avatar-text">{{ (r.form_data && r.form_data.name) || (r.group_remark || r.profile_name || '成').charAt(0) }}</text>
						</view>
						<view class="record-body">
							<view class="record-top">
								<text class="record-name">{{ r.form_data && r.form_data.name ? r.form_data.name : (r.group_remark || r.profile_name || '成员') }}</text>
								<text class="record-status" :class="r.status === 'signed' ? 'st-signed' : 'st-cancelled'">{{ r.status === 'signed' ? '已报名' : '已取消' }}</text>
							</view>
							<view class="record-sub" v-if="recordSummary(r)">
								<text class="record-sub-text">{{ recordSummary(r) }}</text>
							</view>
							<view class="record-sub" v-else>
								<text class="record-sub-text">{{ r.group_remark || r.profile_name || '' }}</text>
							</view>
						</view>
						<view class="record-time">
							<text class="record-time-text">{{ formatTime(r.signed_at) }}</text>
						</view>
						<view class="record-remove" v-if="canManage && r.status === 'signed'" @click="removeSignup(r)">
							<text class="record-remove-text">移除</text>
						</view>
					</view>
				</view>
			</template>

			<!-- 统计 Tab -->
			<template v-if="activeTab === 'stats'">
				<view class="metric-grid">
					<view class="metric-card">
						<text class="metric-num">{{ stats.signed }}</text>
						<text class="metric-label">已报名</text>
					</view>
					<view class="metric-card">
						<text class="metric-num" :class="{ 'metric-warn': quota > 0 && stats.remaining === 0 }">{{ quota > 0 ? stats.remaining : '不限' }}</text>
						<text class="metric-label">剩余名额</text>
					</view>
					<view class="metric-card">
						<text class="metric-num">{{ stats.rate }}%</text>
						<text class="metric-label">完成率</text>
					</view>
					<view class="metric-card">
						<text class="metric-num">{{ quota > 0 ? quota : '不限' }}</text>
						<text class="metric-label">名额上限</text>
					</view>
				</view>

				<view class="card chart-card" v-if="stats.perSession.length > 0 || stats.perField.length > 0">
					<text class="card-title">{{ pieTitle }}</text>
					<canvas canvas-id="pieChart" id="pieChart" class="chart-canvas"></canvas>
				</view>
				<view class="card chart-card" v-if="stats.perField.length > 0">
					<text class="card-title">{{ barTitle }}</text>
					<canvas canvas-id="barChart" id="barChart" class="chart-canvas"></canvas>
				</view>
				<view class="card chart-card">
					<text class="card-title">报名趋势</text>
					<canvas canvas-id="lineChart" id="lineChart" class="chart-canvas"></canvas>
				</view>
			</template>

			<!-- 动态 Tab -->
			<template v-if="activeTab === 'history'">
				<view class="card" v-if="historyList.length > 0">
					<text class="card-title">变更动态</text>
					<view class="history-item" v-for="(h, i) in historyList" :key="i">
						<view class="history-top">
							<text class="history-action" :class="'ha-' + h.action">{{ historyActionLabel(h.action) }}</text>
							<text class="history-actor">{{ h.actor_name || '成员' }}</text>
							<text class="history-time">{{ formatTime(h.changeTime) }}</text>
						</view>
						<view class="history-diff" v-if="h.diffText">
							<text class="history-diff-text">{{ h.diffText }}</text>
						</view>
					</view>
				</view>
				<view class="card" v-else>
					<view class="empty-box">
						<text class="empty-text">暂无动态</text>
					</view>
				</view>
			</template>

			<!-- 私有日程：直接展示历史 -->
			<view class="card" v-if="schedule.scope !== 'group' && historyList.length > 0">
				<text class="card-title">变更历史</text>
				<view class="history-item" v-for="(h, i) in historyList" :key="i">
					<view class="history-top">
						<text class="history-action" :class="'ha-' + h.action">{{ historyActionLabel(h.action) }}</text>
						<text class="history-actor">{{ h.actor_name || '成员' }}</text>
						<text class="history-time">{{ formatTime(h.changeTime) }}</text>
					</view>
					<view class="history-diff" v-if="h.diffText">
						<text class="history-diff-text">{{ h.diffText }}</text>
					</view>
				</view>
			</view>

			<!-- 操作栏 -->
			<view class="action-bar" v-if="canEdit">
				<view class="op-btn" @click="goEdit">
					<text class="op-btn-text">编辑</text>
				</view>
				<view class="op-btn danger-btn" @click="deleteSchedule">
					<text class="op-btn-text danger-text">删除</text>
				</view>
			</view>
		</template>

		<!-- 活动设置弹窗 -->
		<view class="mask" v-if="showSettings" @click="showSettings = false">
			<view class="modal" @click.stop>
				<view class="modal-head">
					<text class="modal-title">活动设置</text>
					<view class="modal-close" @click="showSettings = false">
						<text class="modal-close-text">✕</text>
					</view>
				</view>
				<scroll-view scroll-y class="modal-body">
					<view class="form-row">
						<text class="form-label">活动名称</text>
						<input class="form-input" v-model="settings.title" placeholder="请输入活动名称" placeholder-class="ph" />
					</view>
					<view class="form-row">
						<text class="form-label">名额上限</text>
						<input class="form-input" type="number" v-model="settings.quota" placeholder="0 表示不限" placeholder-class="ph" />
					</view>
					<view class="form-row">
						<text class="form-label">报名截止</text>
						<picker mode="date" :value="settings.deadline" @change="e => settings.deadline = e.detail.value">
							<view class="picker-view">
								<text class="picker-text" :class="{ 'picker-empty': !settings.deadline }">{{ settings.deadline || '不设截止（开始前均可报名）' }}</text>
							</view>
						</picker>
					</view>
					<view class="form-row">
						<text class="form-label">开放报名</text>
						<switch :checked="!settings.closed" color="#007AFF" @change="onClosedChange" />
					</view>
					<view class="form-row">
						<text class="form-label">分场次报名</text>
						<switch :checked="settings.use_sessions" color="#007AFF" @change="onSettingsUseSessionsChange" />
					</view>
					<text class="form-hint">{{ settings.use_sessions ? '按场次报名：每场单独时间与名额' : '单时间段报名：设置整体开始/结束时间与总名额' }}</text>
					<view class="field-group">
						<view class="sess-head">
							<text class="form-label">报名问卷</text>
							<view class="add-sess" @click="addSettingsField">
								<text class="add-sess-text">+ 添加字段</text>
							</view>
						</view>
						<view class="field-card" v-for="(field, fi) in settings.form" :key="fi">
							<view class="field-head">
								<input class="field-label-input" v-model="field.label" placeholder="字段名" placeholder-class="ph" />
								<view class="field-del" @click="removeSettingsField(fi)">
									<text class="sess-del-text">✕</text>
								</view>
							</view>
							<view class="field-row">
								<picker :range="fieldTypeLabels" @change="e => changeSettingsFieldType(fi, e.detail.value)">
									<view class="mini-btn"><text class="mini-btn-text">{{ fieldTypeLabel(field.type) }}</text></view>
								</picker>
								<picker :range="prefillLabels" @change="e => field.prefill = prefillValues[e.detail.value]">
									<view class="mini-btn"><text class="mini-btn-text">{{ prefillLabel(field.prefill) }}</text></view>
								</picker>
								<view class="mini-btn" :class="{ 'mini-active': field.required }" @click="toggleSettingsFieldRequired(fi)">
									<text class="mini-btn-text">必填</text>
								</view>
								<view class="mini-btn" v-if="field.type === 'date'" :class="{ 'mini-active': !!field.save_to_profile }" @click="toggleSettingsSave(fi)">
									<text class="mini-btn-text">写生日档案</text>
								</view>
							</view>
							<input class="form-input opts-input" v-if="field.type === 'select' || field.type === 'checkbox'" v-model="field._options" placeholder="选项（逗号分隔）" placeholder-class="ph" />
						</view>
					</view>
					<view class="field-group" v-if="settings.use_sessions">
						<view class="sess-head">
							<text class="form-label">场次设置</text>
							<view class="add-sess" @click="addSession">
								<text class="add-sess-text">+ 添加场次</text>
							</view>
						</view>
						<text class="form-hint">报名者选择场次，并受各场次名额限制</text>
						<view class="sess-row" v-for="(s, i) in settings.sessions" :key="i">
							<input class="sess-input" v-model="s.name" placeholder="场次名" placeholder-class="ph" />
							<input class="sess-input sess-quota" type="number" v-model="s.quota" placeholder="名额0不限" placeholder-class="ph" />
							<picker mode="time" :value="s.start_time" @change="e => s.start_time = e.detail.value">
								<view class="sess-time"><text class="sess-time-text">{{ s.start_time || '开始' }}</text></view>
							</picker>
							<picker mode="time" :value="s.end_time" @change="e => s.end_time = e.detail.value">
								<view class="sess-time"><text class="sess-time-text">{{ s.end_time || '结束' }}</text></view>
							</picker>
							<view class="sess-del" @click="removeSession(i)">
								<text class="sess-del-text">✕</text>
							</view>
						</view>
					</view>
				</scroll-view>
				<view class="modal-foot">
					<view class="modal-btn" @click="saveSettings">
						<text class="modal-btn-text">保存</text>
					</view>
				</view>
			</view>
		</view>

		<view class="toast" v-if="toastMsg">
			<text class="toast-text">{{ toastMsg }}</text>
		</view>
	</view>
</template>

<script setup>
import { ref, computed, reactive, watch, nextTick, onMounted } from 'vue'
import { getUid } from '@/utils/auth.js'
import { callApi } from '@/utils/cloud.js'

const scheduleId = ref('')
const schedule = ref({})
const groupName = ref('')
const signupList = ref([])
const historyList = ref([])
const myUid = ref('')
const canEdit = ref(false)
const canManage = ref(false)
const loaded = ref(false)
const toastMsg = ref('')
const groups = ref([])
const activeTab = ref('signup')

const tabs = [
	{ key: 'signup', label: '报名' },
	{ key: 'list', label: '名单' },
	{ key: 'stats', label: '统计' },
	{ key: 'history', label: '动态' }
]

const showToast = (msg) => {
	toastMsg.value = msg
	setTimeout(() => { toastMsg.value = '' }, 2000)
}

const typeLabel = (t) => {
	const m = { birthday: '生日', event: '活动', meeting: '会议', other: '其他' }
	return m[t] || '其他'
}

const computeStatus = (item) => {
	const today = new Date().toISOString().slice(0, 10)
	const dateStr = item.date
	if (dateStr < today) return '已结束'
	if (dateStr > today) return '未开始'
	const nowHM = new Date().toTimeString().slice(0, 5)
	const st = item.start_time || ''
	if (st && st <= nowHM) {
		const et = item.end_time || ''
		if (et && et <= nowHM) return '已结束'
		return '进行中'
	}
	return '未开始'
}

const startingHint = computed(() => {
	const s = schedule.value
	if (s.schedule_status === 'not_started' && s.start_time) {
		if (s.date === new Date().toISOString().slice(0, 10)) {
			return `今日 ${s.start_time} 开始`
		}
		return `${s.date} ${s.start_time} 开始`
	}
	return ''
})

const isActivity = computed(() => schedule.value.scope === 'group' && !!schedule.value.signup_enabled)
const closed = computed(() => !!schedule.value.signup_closed)
const quota = computed(() => schedule.value.signup_quota || 0)
const sessions = computed(() => schedule.value.sessions || [])

const signedRecords = computed(() => signupList.value.filter(s => s.status === 'signed'))
const signedCount = computed(() => signedRecords.value.length)
const mySigned = computed(() => signedRecords.value.some(s => s.user_id === myUid.value))
const myRecord = computed(() => signedRecords.value.find(s => s.user_id === myUid.value) || null)

const progressPercent = computed(() => {
	const q = quota.value
	if (q <= 0) return 0
	return Math.min(Math.round(signedCount.value / q * 100), 100)
})

const formMeta = computed(() => schedule.value.signup_form || [])
const displayValue = (f, v) => Array.isArray(v) ? v.join('、') : v

const recordSummary = (r) => {
	const fd = r.form_data || {}
	const parts = []
	formMeta.value.forEach(f => {
		if (f.key === 'name') return
		const v = fd[f.key]
		if (v === undefined || v === '') return
		parts.push(Array.isArray(v) ? v.join('、') : String(v))
	})
	return parts.join(' · ')
}

const quotaLeft = (s) => {
	const cnt = signedRecords.value.filter(r => r.form_data && r.form_data.session === s.name).length
	return Math.max((s.quota || 0) - cnt, 0)
}

const fieldOptions = (f) => {
	if (f.key === 'session' && (!f.options || f.options.length === 0)) {
		return (schedule.value.sessions || []).map(s => s.quota > 0 ? `${s.name}（余${quotaLeft(s)}/${s.quota}）` : s.name)
	}
	return f.options || []
}

const toggleCheck = (key, op) => {
	const arr = (signupForm[key] || []).slice()
	const idx = arr.indexOf(op)
	if (idx >= 0) arr.splice(idx, 1)
	else arr.push(op)
	signupForm[key] = arr
}

const signupForm = reactive({})

// ===== 名单筛选 =====
const listKeyword = ref('')
const listStatusFilter = ref('all')
const listSessionFilter = ref('all')

const filteredList = computed(() => {
	const kw = listKeyword.value.trim()
	return signupList.value.filter(s => {
		if (listStatusFilter.value !== 'all' && s.status !== listStatusFilter.value) return false
		if (listSessionFilter.value !== 'all' && (s.form_data && s.form_data.session) !== listSessionFilter.value) return false
		if (!kw) return true
		const fd = s.form_data || {}
		const parts = [s.profile_name, s.group_remark]
		formMeta.value.forEach(f => {
			const v = fd[f.key]
			if (v !== undefined) parts.push(Array.isArray(v) ? v.join(',') : String(v))
		})
		return parts.filter(Boolean).join(' ').includes(kw)
	})
})

// ===== 统计 =====
const pieTitle = computed(() => (formMeta.value || []).some(f => f.key === 'session') ? '场次分布' : '报名分布')
const barTitle = computed(() => '报名分布')

const stats = computed(() => {
	const signed = signedRecords.value
	const hasSess = (formMeta.value || []).some(f => f.key === 'session')
	const distField = (formMeta.value || []).find(f => f.type === 'select' || f.type === 'checkbox') || null
	const perSession = {}
	const perField = {}
	const perDay = {}
	signed.forEach(s => {
		const fd = s.form_data || {}
		if (hasSess) {
			const sess = fd.session || '未选场次'
			perSession[sess] = (perSession[sess] || 0) + 1
		}
		if (distField) {
			let fv = fd[distField.key]
			if (Array.isArray(fv)) fv = fv.join('、')
			const key = (fv === undefined || fv === '') ? '未填写' : String(fv)
			perField[key] = (perField[key] || 0) + 1
		}
		const day = formatDate(s.signed_at)
		perDay[day] = (perDay[day] || 0) + 1
	})
	const q = quota.value
	return {
		signed: signed.length,
		quota: q,
		remaining: q > 0 ? Math.max(q - signed.length, 0) : -1,
		rate: q > 0 ? Math.round(signed.length / q * 100) : (signed.length > 0 ? 100 : 0),
		perSession: Object.entries(perSession).sort((a, b) => b[1] - a[1]),
		perField: Object.entries(perField).sort((a, b) => b[1] - a[1]),
		trend: Object.entries(perDay).sort((a, b) => a[0].localeCompare(b[0]))
	}
})

const truncate = (s, n) => {
	s = String(s || '')
	return s.length > n ? s.slice(0, n) + '…' : s
}

const PX = () => uni.getSystemInfoSync().windowWidth / 750

const CHART_COLORS = ['#007AFF', '#4CAF50', '#FFC107', '#FF6B6B', '#9C27B0', '#00BCD4', '#FF9800']

const drawCharts = () => {
	const st = stats.value
	const hasSess = (formMeta.value || []).some(f => f.key === 'session')
	drawPie(hasSess ? st.perSession : st.perField)
	drawBar(st.perField)
	drawLine(st.trend)
}

const drawPie = (data) => {
	const ctx = uni.createCanvasContext('pieChart')
	const w = 660 * PX()
	const h = 300 * PX()
	const cx = w / 2 - 40 * PX()
	const cy = h / 2
	const r = Math.min(w, h) * 0.3
	const total = data.reduce((s, d) => s + d[1], 0)
	ctx.clearRect(0, 0, w, h)
	if (total === 0) {
		ctx.setFillStyle('#EEE')
		ctx.beginPath()
		ctx.arc(cx, cy, r, 0, Math.PI * 2)
		ctx.fill()
		ctx.setFillStyle('#999')
		ctx.setFontSize(12)
		ctx.setTextAlign('center')
		ctx.fillText('暂无数据', cx, cy + 4)
		ctx.draw()
		return
	}
	let start = -Math.PI / 2
	data.forEach((d, i) => {
		const angle = d[1] / total * Math.PI * 2
		ctx.beginPath()
		ctx.moveTo(cx, cy)
		ctx.arc(cx, cy, r, start, start + angle)
		ctx.closePath()
		ctx.setFillStyle(CHART_COLORS[i % CHART_COLORS.length])
		ctx.fill()
		start += angle
	})
	ctx.setFillStyle('#FFF')
	ctx.beginPath()
	ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2)
	ctx.fill()
	ctx.setFillStyle('#333')
	ctx.setFontSize(14)
	ctx.setTextAlign('center')
	ctx.fillText(String(total), cx, cy - 2)
	ctx.setFontSize(10)
	ctx.fillText('报名', cx, cy + 14)
	let ly = 18
	data.slice(0, 7).forEach((d, i) => {
		ctx.setFillStyle(CHART_COLORS[i % CHART_COLORS.length])
		ctx.fillRect(w - 150 * PX(), ly, 10, 10)
		ctx.setFillStyle('#333')
		ctx.setFontSize(10)
		ctx.setTextAlign('left')
		ctx.fillText(`${truncate(d[0], 8)} (${d[1]})`, w - 150 * PX() + 16, ly + 9)
		ly += 18
	})
	ctx.draw()
}

const drawBar = (data) => {
	const ctx = uni.createCanvasContext('barChart')
	const w = 660 * PX()
	const h = 300 * PX()
	const padL = 30, padB = 30, padT = 18, padR = 10
	const cw = w - padL - padR
	const ch = h - padT - padB
	const top = data.slice(0, 6)
	ctx.clearRect(0, 0, w, h)
	if (top.length === 0) {
		ctx.setFillStyle('#999')
		ctx.setFontSize(12)
		ctx.setTextAlign('center')
		ctx.fillText('暂无数据', w / 2, h / 2)
		ctx.draw()
		return
	}
	const max = Math.max(...top.map(d => d[1]), 1)
	const slot = cw / top.length
	const bw = Math.min(slot * 0.6, 42)
	ctx.setStrokeStyle('#E5E5EA')
	ctx.setLineWidth(1)
	ctx.beginPath()
	ctx.moveTo(padL, padT)
	ctx.lineTo(padL, padT + ch)
	ctx.lineTo(padL + cw, padT + ch)
	ctx.stroke()
	top.forEach((d, i) => {
		const x = padL + slot * i + (slot - bw) / 2
		const bh = ch * d[1] / max
		ctx.setFillStyle(CHART_COLORS[i % CHART_COLORS.length])
		ctx.fillRect(x, padT + ch - bh, bw, bh)
		ctx.setFillStyle('#333')
		ctx.setFontSize(11)
		ctx.setTextAlign('center')
		ctx.fillText(String(d[1]), x + bw / 2, padT + ch - bh - 6)
		ctx.setFillStyle('#888')
		ctx.setFontSize(10)
		ctx.fillText(truncate(d[0], 4), x + bw / 2, padT + ch + 16)
	})
	ctx.draw()
}

const drawLine = (data) => {
	const ctx = uni.createCanvasContext('lineChart')
	const w = 660 * PX()
	const h = 300 * PX()
	const padL = 28, padB = 30, padT = 20, padR = 14
	const cw = w - padL - padR
	const ch = h - padT - padB
	ctx.clearRect(0, 0, w, h)
	if (data.length === 0) {
		ctx.setFillStyle('#999')
		ctx.setFontSize(12)
		ctx.setTextAlign('center')
		ctx.fillText('暂无数据', w / 2, h / 2)
		ctx.draw()
		return
	}
	const max = Math.max(...data.map(d => d[1]), 1)
	const stepX = cw / Math.max(data.length - 1, 1)
	ctx.setStrokeStyle('#E5E5EA')
	ctx.setLineWidth(1)
	ctx.beginPath()
	ctx.moveTo(padL, padT)
	ctx.lineTo(padL, padT + ch)
	ctx.lineTo(padL + cw, padT + ch)
	ctx.stroke()
	ctx.setStrokeStyle('#007AFF')
	ctx.setLineWidth(2)
	ctx.beginPath()
	data.forEach((d, i) => {
		const x = padL + i * stepX
		const y = padT + ch - ch * d[1] / max
		if (i === 0) ctx.moveTo(x, y)
		else ctx.lineTo(x, y)
	})
	ctx.stroke()
	data.forEach((d, i) => {
		const x = padL + i * stepX
		const y = padT + ch - ch * d[1] / max
		ctx.beginPath()
		ctx.arc(x, y, 3, 0, Math.PI * 2)
		ctx.setFillStyle('#007AFF')
		ctx.fill()
		ctx.setFillStyle('#333')
		ctx.setFontSize(10)
		ctx.setTextAlign('center')
		ctx.fillText(String(d[1]), x, y - 8)
	})
	const skip = Math.ceil(data.length / 6)
	ctx.setFillStyle('#999')
	ctx.setFontSize(9)
	ctx.setTextAlign('center')
	data.forEach((d, i) => {
		if (i % skip !== 0) return
		const x = padL + i * stepX
		ctx.fillText(String(d[0]).slice(5), x, padT + ch + 16)
	})
	ctx.draw()
}

// ===== 数据加载 =====
const loadSchedule = async () => {
	try {
		const uid = getUid()
		myUid.value = uid
		const res = await callApi('schedules', 'detail', { schedule_id: scheduleId.value, user_id: uid }).catch(e => {
			console.error('detail fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			const s = res.result.data
			s.schedule_status = s.schedule_status || (computeStatus(s) === '已结束' ? 'ended' : computeStatus(s) === '进行中' ? 'in_progress' : 'not_started')
			s.status_label = s.status_label || computeStatus(s)
			schedule.value = s
			if (s.scope === 'group' && s.signup_prefill) {
				Object.keys(s.signup_prefill).forEach(k => { signupForm[k] = s.signup_prefill[k] })
			}
			await loadGroups(uid)
			if (s.group_id) {
				const g = groups.value.find(x => x._id === s.group_id)
				groupName.value = g ? g.group_name : ''
				const gd = await callApi('groups', 'detail', { user_id: uid, group_id: s.group_id }).catch(() => null)
				if (gd?.code === 200) {
					const me = (gd.data.members || []).find(m => m.user_id === uid)
					if (me && me.role === 'owner') {
						canEdit.value = true
						canManage.value = true
					}
				}
			}
			if (s.owner_id === uid) {
				canEdit.value = true
				canManage.value = true
			}
			await Promise.all([loadHistory(uid), loadSignups(uid)])
		} else {
			showToast('日程不存在或无权查看')
		}
	} catch (e) {
		console.error('load detail fail:', e)
	} finally {
		loaded.value = true
	}
}

const loadGroups = async (uid) => {
	const res = await callApi('groups', 'myGroups', { user_id: uid }).catch(() => ({ result: null }))
	if (res?.result?.code === 200) {
		groups.value = res.result.data || []
	}
}

const loadSignups = async (uid) => {
	if (schedule.value.scope !== 'group') return
	const res = await callApi('schedules', 'signups', { schedule_id: scheduleId.value, user_id: uid }).catch(() => ({ result: null }))
	if (res?.result?.code === 200) {
		signupList.value = res.result.data || []
	}
}

const loadHistory = async (uid) => {
	const res = await callApi('schedules', 'history', { schedule_id: scheduleId.value, user_id: uid }).catch(() => ({ result: null }))
	if (res?.result?.code === 200) {
		historyList.value = (res.result.data || []).map(h => ({
			...h,
			diffText: buildDiffText(h)
		}))
	}
}

const loadAll = async () => {
	await Promise.all([loadHistory(myUid.value), loadSignups(myUid.value)])
	redrawIfStats()
}

const redrawIfStats = () => {
	if (activeTab.value === 'stats') {
		nextTick(() => { setTimeout(drawCharts, 120) })
	}
}

const buildDiffText = (h) => {
	if (h.action === 'create') return '创建了该日程'
	if (h.action === 'delete') return '删除了该日程'
	const fields = [
		['title', '标题'], ['date', '日期'], ['start_time', '开始时间'], ['end_time', '结束时间'],
		['description', '备注'], ['signup_quota', '名额上限'], ['signup_closed', '报名开关'], ['sessions', '场次']
	]
	const changes = []
	fields.forEach(([key, label]) => {
		const b = h.before ? h.before[key] : undefined
		const a = h.after ? h.after[key] : undefined
		if (String(b || '') !== String(a || '')) {
			changes.push(`${label}：${String(b || '') === 'true' ? '开启' : String(b || '') === 'false' ? '关闭' : (b || '空')} → ${String(a || '') === 'true' ? '开启' : String(a || '') === 'false' ? '关闭' : (a || '空')}`)
		}
	})
	return changes.length > 0 ? changes.join('；') : '修改了日程'
}

const historyActionLabel = (a) => {
	const m = { create: '创建', update: '修改', updateActivity: '设置', delete: '删除' }
	return m[a] || a
}

const formatTime = (ts) => {
	if (!ts) return ''
	const d = new Date(ts)
	const p = (n) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const formatDate = (ts) => {
	if (!ts) return ''
	const d = new Date(ts)
	const p = (n) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ===== 报名操作 =====
const submitSignup = async () => {
	const fd = {}
	formMeta.value.forEach(f => {
		const v = signupForm[f.key]
		if (v === undefined || v === null) return
		fd[f.key] = f.type === 'checkbox' ? (Array.isArray(v) ? v : []) : v
	})
	try {
		const res = await callApi('schedules', 'signup', {
			user_id: myUid.value,
			schedule_id: scheduleId.value,
			form_data: fd
		}).catch(e => {
			console.error('signup fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			showToast(res.result.message)
			formMeta.value.forEach(f => { signupForm[f.key] = f.type === 'checkbox' ? [] : '' })
			await reloadSchedule()
		} else {
			showToast(res?.result?.message || '操作失败')
		}
	} catch (e) {
		console.error('signup fail:', e)
	}
}

const cancelSignup = async () => {
	try {
		const res = await callApi('schedules', 'cancelSignup', { user_id: myUid.value, schedule_id: scheduleId.value }).catch(e => {
			console.error('cancel fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			showToast(res.result.message)
			await reloadSchedule()
		} else {
			showToast(res?.result?.message || '操作失败')
		}
	} catch (e) {
		console.error('cancel fail:', e)
	}
}

const removeSignup = (r) => {
	uni.showModal({
		title: '移除报名',
		content: `确定移除「${(r.form_data && r.form_data.name) || '该成员'}」的报名？`,
		success: async (res) => {
			if (!res.confirm) return
			const rr = await callApi('schedules', 'cancelSignup', { user_id: r.user_id, schedule_id: scheduleId.value }).catch(() => ({ result: null }))
			if (rr?.result?.code === 200) {
				showToast('已移除')
				await reloadSchedule()
			} else {
				showToast('操作失败')
			}
		}
	})
}

const reloadSchedule = async () => {
	const res = await callApi('schedules', 'detail', { schedule_id: scheduleId.value, user_id: myUid.value }).catch(() => ({ result: null }))
	if (res?.result?.code === 200) {
		const s = res.result.data
		s.schedule_status = s.schedule_status || 'not_started'
		s.status_label = s.status_label || computeStatus(s)
		schedule.value = s
	}
	await loadAll()
}

// ===== 活动设置 =====
const showSettings = ref(false)
const settings = reactive({ title: '', quota: 0, form: [], sessions: [], closed: false, deadline: '', use_sessions: false })

const fieldTypeLabels = ['单行文本', '多行文本', '数字', '日期', '单选', '多选']
const typeValues = ['text', 'textarea', 'number', 'date', 'select', 'checkbox']
const prefillLabels = ['手动填写', '群昵称', '个人档案']
const prefillValues = ['manual', 'group', 'profile']
const fieldTypeLabel = (t) => ({ text: '单行文本', textarea: '多行文本', number: '数字', date: '日期', select: '单选', checkbox: '多选' }[t] || '单行文本')
const prefillLabel = (v) => ({ manual: '手动填写', group: '群昵称', profile: '个人档案' }[v] || '手动填写')

const openSettings = () => {
	const s = schedule.value
	settings.title = s.title || ''
	settings.quota = s.signup_quota || 0
	settings.form = (s.signup_form || []).map(f => ({
		key: f.key,
		label: f.label || f.key,
		type: f.type || 'text',
		required: !!f.required,
		options: f.options || [],
		_options: (f.options || []).join(','),
		prefill: f.prefill || 'manual',
		save_to_profile: f.save_to_profile || ''
	}))
	settings.sessions = (s.sessions || []).map(x => ({ name: x.name, quota: x.quota, start_time: x.start_time || '', end_time: x.end_time || '' }))
	settings.use_sessions = !!s.use_sessions
	settings.form = syncSettingsSessionField(settings.form)
	settings.closed = !!s.signup_closed
	settings.deadline = s.signup_deadline || ''
	showSettings.value = true
}

const onClosedChange = (e) => {
	settings.closed = !e.detail.value
}

const normalizeSettingsForm = () => {
	return settings.form.map(f => {
		const opts = (f.type === 'select' || f.type === 'checkbox')
			? String(f._options || '').split(/[,，]/).map(s => s.trim()).filter(Boolean)
			: []
		return {
			key: f.key,
			label: (f.label || '').trim() || f.key,
			type: f.type,
			required: !!f.required,
			options: opts,
			prefill: f.prefill || 'manual',
			save_to_profile: (f.type === 'date' && f.save_to_profile) ? 'birthday' : ''
		}
	})
}

const addSettingsField = () => {
	settings.form.push({ key: 'f' + Date.now(), label: '自定义字段', type: 'text', required: false, options: [], _options: '', prefill: 'manual', save_to_profile: '' })
}

const removeSettingsField = (i) => {
	settings.form.splice(i, 1)
}

const changeSettingsFieldType = (i, ti) => {
	settings.form[i].type = typeValues[ti] || 'text'
}

const toggleSettingsFieldRequired = (i) => {
	settings.form[i].required = !settings.form[i].required
}

const toggleSettingsSave = (i) => {
	settings.form[i].save_to_profile = settings.form[i].save_to_profile ? '' : 'birthday'
}

const addSession = () => {
	settings.sessions.push({ name: '', quota: 0, start_time: '', end_time: '' })
}

const removeSession = (i) => {
	settings.sessions.splice(i, 1)
}

const onSettingsUseSessionsChange = (e) => {
	settings.use_sessions = e.detail.value
	settings.form = syncSettingsSessionField(settings.form)
}

const syncSettingsSessionField = (form) => {
	if (settings.use_sessions) {
		if (form.some(f => f.key === 'session')) return form
		return [...form, { key: 'session', label: '参加场次', type: 'select', required: true, options: [], _options: '', prefill: 'manual', save_to_profile: '' }]
	}
	return form.filter(f => f.key !== 'session')
}

const saveSettings = async () => {
	if (!settings.title.trim()) return showToast('请填写活动名称')
	try {
		const res = await callApi('schedules', 'updateActivity', {
			user_id: myUid.value,
			schedule_id: scheduleId.value,
			title: settings.title.trim(),
			signup_quota: Number(settings.quota) || 0,
			signup_form: normalizeSettingsForm(),
			signup_deadline: settings.deadline,
			use_sessions: settings.use_sessions,
			sessions: settings.use_sessions ? settings.sessions : [],
			signup_closed: settings.closed
		}).catch(e => {
			console.error('updateActivity fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			showToast('已保存')
			showSettings.value = false
			await reloadSchedule()
		} else {
			showToast(res?.result?.message || '保存失败')
		}
	} catch (e) {
		console.error('updateActivity fail:', e)
	}
}

// ===== Tab 切换 =====
const switchTab = (key) => {
	activeTab.value = key
	if (key === 'stats') redrawIfStats()
}

const SIGNUP_PUBLISH_TMPL = '46MLVHkksG2sXsydt_CuGDdRlW1Pdhv5YjdHf1Ojpgc' // 最近活动提醒：活动名称/活动时间/剩余天数
const SIGNUP_RESULT_TMPL = 'UVDiKNJ5K6pYWCC94empCnhmVjMep3nfOmkgQmYd2J0' // 日程提醒：提醒人/提醒日期/提醒事项

const mySubscribed = ref(false)

const loadNotifyState = async () => {
	const uid = getUid()
	if (!uid || uid.startsWith('visitor_')) return
	const res = await callApi('schedules', 'getNotifyState', { user_id: uid }).catch(() => ({ result: null }))
	if (res?.result?.code === 200) {
		mySubscribed.value = (res.result.data || []).includes(SIGNUP_RESULT_TMPL)
	}
}

const toggleNotify = async () => {
	const uid = getUid()
	if (!uid || uid.startsWith('visitor_')) {
		showToast('请先登录')
		return
	}
	if (mySubscribed.value) {
		await callApi('schedules', 'subscribeNotify', { user_id: uid, template_id: SIGNUP_RESULT_TMPL, enabled: false }).catch(() => null)
		mySubscribed.value = false
		showToast('已关闭提醒')
		return
	}
	if (!SIGNUP_RESULT_TMPL) {
		showToast('提醒模板未配置')
		return
	}
	uni.requestSubscribeMessage({
		tmplIds: [SIGNUP_RESULT_TMPL],
		success: async (res) => {
			if (res[SIGNUP_RESULT_TMPL] === 'accept') {
				await callApi('schedules', 'subscribeNotify', { user_id: uid, template_id: SIGNUP_RESULT_TMPL, enabled: true }).catch(() => null)
				mySubscribed.value = true
				showToast('提醒已开启')
			} else {
				showToast('未授权，无法开启提醒')
			}
		},
		fail: () => { showToast('未授权，无法开启提醒') }
	})
}

watch(() => signupList.value.length, () => { redrawIfStats() })

// ===== 编辑/删除 =====
const goEdit = () => {
	uni.navigateTo({ url: '/pages/create-schedule/create-schedule?schedule_id=' + scheduleId.value })
}

const deleteSchedule = () => {
	uni.showModal({
		title: '删除日程', content: '确定删除该日程？报名与历史将一并删除。',
		success: async (res) => {
			if (!res.confirm) return
			await callApi('schedules', 'delete', { user_id: myUid.value, schedule_id: scheduleId.value }).catch(e => console.error('delete schedule fail:', e))
			uni.showToast({ title: '已删除', icon: 'none' })
			setTimeout(() => { uni.navigateBack() }, 600)
		}
	})
}

onMounted(() => {
	const pages = getCurrentPages()
	const page = pages[pages.length - 1]
	const options = page?.options || {}
	scheduleId.value = options.schedule_id || ''
	if (scheduleId.value) {
		loadSchedule()
		loadNotifyState()
	} else {
		loaded.value = true
		showToast('缺少参数')
	}
})
</script>

<style>
page { background-color: #F0F1F5; }
.container { padding: 30rpx; padding-bottom: 140rpx; }

.loading-box { display: flex; justify-content: center; padding-top: 200rpx; }
.loading-text { font-size: 28rpx; color: #999; }

.status-bar { display: flex; gap: 12rpx; margin-bottom: 20rpx; flex-wrap: wrap; align-items: center; }
.status-tag { padding: 6rpx 16rpx; border-radius: 10rpx; }
.status-tag-text { font-size: 22rpx; }
.tag-not_started { background: rgba(255,193,7,0.1); }
.tag-not_started .status-tag-text { color: #FFC107; }
.tag-in_progress { background: rgba(76,175,80,0.1); }
.tag-in_progress .status-tag-text { color: #4CAF50; }
.tag-ended { background: rgba(0,0,0,0.04); }
.tag-ended .status-tag-text { color: #999; }
.tag-closed { background: rgba(255,107,107,0.1); }
.tag-closed .status-tag-text { color: #FF6B6B; }
.scope-tag { padding: 6rpx 16rpx; border-radius: 10rpx; background: rgba(0,122,255,0.08); }
.scope-tag-text { font-size: 22rpx; color: #007AFF; }
.private-tag { background: rgba(0,0,0,0.04); }
.private-tag .scope-tag-text { color: #999; }
.status-bar-right { margin-left: auto; }
.setting-pill { padding: 8rpx 20rpx; border-radius: 26rpx; background: rgba(0,122,255,0.08); }
.setting-pill-text { font-size: 24rpx; color: #007AFF; }

.card { background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%); border-radius: 24rpx; padding: 32rpx; margin-bottom: 24rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); }
.card-title { font-size: 26rpx; color: #999; font-weight: 600; display: block; margin-bottom: 20rpx; }
.detail-title { font-size: 36rpx; font-weight: bold; color: #333; display: block; margin-bottom: 20rpx; }
.info-row { display: flex; margin-bottom: 14rpx; }
.info-label { width: 150rpx; font-size: 26rpx; color: #999; flex-shrink: 0; }
.info-value { flex: 1; font-size: 26rpx; color: #333; line-height: 1.5; }
.remind-value { color: #FF8A65; }

.quota-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
.quota-head .card-title { margin-bottom: 0; }
.quota-num { font-size: 26rpx; color: #007AFF; font-weight: 600; }
.progress-track { height: 16rpx; background: rgba(0,0,0,0.05); border-radius: 8rpx; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #007AFF, #4CAF50); border-radius: 8rpx; transition: width 0.3s; }
.quota-foot { margin-top: 14rpx; }
.quota-full-text { font-size: 24rpx; color: #FF6B6B; }

.tab-bar { display: flex; background: #FFF; border-radius: 24rpx; margin-bottom: 24rpx; padding: 8rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); }

.notify-bar { display: flex; align-items: center; gap: 16rpx; background: rgba(124,77,255,0.06); border-radius: 20rpx; padding: 20rpx 24rpx; margin-bottom: 24rpx; }
.notify-bar-text { flex: 1; font-size: 22rpx; color: #666; line-height: 1.5; }
.notify-btn { flex-shrink: 0; padding: 10rpx 24rpx; border-radius: 28rpx; background: #333; }
.notify-btn:active { opacity: 0.8; }
.notify-btn-text { font-size: 24rpx; color: #FFF; }
.tab-item { flex: 1; height: 72rpx; display: flex; align-items: center; justify-content: center; border-radius: 18rpx; }
.tab-text { font-size: 28rpx; color: #666; }
.tab-active { background: #333; }
.tab-active .tab-text { color: #FFF; font-weight: 600; }

.empty-box { display: flex; justify-content: center; padding: 30rpx 0; }
.empty-text { font-size: 26rpx; color: #CCC; }

.my-info-row { display: flex; margin-bottom: 14rpx; }

.form-row { display: flex; align-items: center; margin-bottom: 24rpx; }
.form-label { width: 160rpx; font-size: 26rpx; color: #666; flex-shrink: 0; }
.form-hint { font-size: 22rpx; color: #BBB; margin: -12rpx 0 16rpx 160rpx; display: block; }
.form-input { flex: 1; height: 72rpx; background: rgba(0,0,0,0.04); border-radius: 16rpx; padding: 0 24rpx; font-size: 28rpx; color: #333; }
.ph { color: #BBB; }
.picker-view { flex: 1; height: 72rpx; background: rgba(0,0,0,0.04); border-radius: 16rpx; padding: 0 24rpx; display: flex; align-items: center; }
.picker-text { font-size: 28rpx; color: #333; }
.picker-empty { color: #BBB; }
.req-star { color: #FF6B6B; margin-left: 4rpx; }
.form-textarea { flex: 1; height: 120rpx; background: rgba(0,0,0,0.04); border-radius: 16rpx; padding: 16rpx 24rpx; font-size: 28rpx; color: #333; box-sizing: border-box; }
.checkbox-wrap { flex: 1; display: flex; gap: 16rpx; flex-wrap: wrap; }
.check-item { padding: 12rpx 26rpx; border-radius: 26rpx; background: rgba(0,0,0,0.04); border: 2rpx solid transparent; }
.check-item-text { font-size: 26rpx; color: #666; }
.check-on { background: rgba(0,122,255,0.08); border-color: #007AFF; }
.check-on .check-item-text { color: #007AFF; }

.field-card { margin-top: 20rpx; background: rgba(0,0,0,0.03); border-radius: 16rpx; padding: 16rpx; }
.field-head { display: flex; align-items: center; }
.field-label-input { flex: 1; height: 60rpx; background: rgba(255,255,255,0.85); border-radius: 12rpx; padding: 0 16rpx; font-size: 26rpx; color: #333; box-sizing: border-box; }
.field-del { width: 44rpx; height: 44rpx; border-radius: 22rpx; background: rgba(255,107,107,0.08); display: flex; align-items: center; justify-content: center; margin-left: 12rpx; flex-shrink: 0; }
.field-row { display: flex; gap: 12rpx; flex-wrap: wrap; margin-top: 14rpx; }
.mini-btn { padding: 8rpx 20rpx; border-radius: 22rpx; background: rgba(0,0,0,0.05); }
.mini-active { background: #333; }
.mini-btn-text { font-size: 24rpx; color: #666; }
.mini-active .mini-btn-text { color: #FFF; }
.opts-input { height: 64rpx; margin-top: 14rpx; font-size: 24rpx; }

.signup-btn { margin-top: 24rpx; height: 80rpx; display: flex; align-items: center; justify-content: center; background: #333; border-radius: 40rpx; }
.signup-btn:active { opacity: 0.8; }
.cancel-btn { background: rgba(0,0,0,0.04); }
.signup-btn-text { font-size: 28rpx; color: #FFF; }
.cancel-btn .signup-btn-text { color: #666; }

.search-row { margin-bottom: 20rpx; }
.search-input { height: 72rpx; background: rgba(0,0,0,0.04); border-radius: 16rpx; padding: 0 24rpx; font-size: 28rpx; color: #333; }
.filter-scroll { white-space: nowrap; margin-bottom: 20rpx; }
.filter-row { display: inline-flex; gap: 14rpx; padding: 4rpx 0; }
.filter-pill { padding: 10rpx 24rpx; border-radius: 30rpx; background: rgba(0,0,0,0.04); }
.filter-pill-text { font-size: 24rpx; color: #666; }
.pill-active { background: #333; }
.pill-active .filter-pill-text { color: #FFF; }

.record-item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0; border-bottom: 1rpx solid rgba(0,0,0,0.04); }
.record-avatar { width: 64rpx; height: 64rpx; border-radius: 32rpx; background: #007AFF; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.rec-cancelled { background: #CCC; }
.record-avatar-text { font-size: 26rpx; color: #FFF; }
.record-body { flex: 1; min-width: 0; }
.record-top { display: flex; align-items: center; gap: 12rpx; }
.record-name { font-size: 28rpx; color: #333; font-weight: 600; }
.record-status { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; }
.st-signed { background: rgba(76,175,80,0.1); color: #4CAF50; }
.st-cancelled { background: rgba(0,0,0,0.05); color: #999; }
.record-sub { margin-top: 6rpx; }
.record-sub-text { font-size: 22rpx; color: #999; }
.record-time { text-align: right; flex-shrink: 0; }
.record-time-text { font-size: 20rpx; color: #CCC; }
.record-remove { margin-left: 12rpx; padding: 8rpx 20rpx; border-radius: 24rpx; background: rgba(255,107,107,0.1); flex-shrink: 0; }
.record-remove-text { font-size: 22rpx; color: #FF6B6B; }

.metric-grid { display: flex; gap: 16rpx; margin-bottom: 24rpx; }
.metric-card { flex: 1; background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%); border-radius: 24rpx; padding: 28rpx 12rpx; display: flex; flex-direction: column; align-items: center; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); }
.metric-num { font-size: 36rpx; font-weight: bold; color: #007AFF; }
.metric-warn { color: #FF6B6B; }
.metric-label { font-size: 22rpx; color: #999; margin-top: 8rpx; }
.chart-canvas { width: 660rpx; height: 300rpx; }

.history-item { padding: 16rpx 0; border-bottom: 1rpx solid rgba(0,0,0,0.04); }
.history-top { display: flex; align-items: center; gap: 12rpx; }
.history-action { font-size: 22rpx; padding: 4rpx 12rpx; border-radius: 8rpx; }
.ha-create { background: rgba(76,175,80,0.1); color: #4CAF50; }
.ha-update { background: rgba(0,122,255,0.08); color: #007AFF; }
.ha-updateActivity { background: rgba(156,39,176,0.08); color: #9C27B0; }
.ha-delete { background: rgba(255,107,107,0.08); color: #FF6B6B; }
.history-actor { font-size: 24rpx; color: #333; flex: 1; }
.history-time { font-size: 22rpx; color: #CCC; }
.history-diff { margin-top: 8rpx; background: rgba(0,0,0,0.03); border-radius: 8rpx; padding: 10rpx 14rpx; }
.history-diff-text { font-size: 24rpx; color: #888; line-height: 1.5; }

.action-bar { display: flex; gap: 16rpx; margin-top: 8rpx; }
.op-btn { flex: 1; height: 84rpx; display: flex; align-items: center; justify-content: center; background: #333; border-radius: 42rpx; }
.op-btn:active { opacity: 0.8; }
.op-btn-text { font-size: 28rpx; color: #FFF; }
.danger-btn { background: transparent; border: 2rpx solid #FF6B6B; }
.danger-text { color: #FF6B6B; }

.mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: flex-end; }
.modal { width: 100%; background: #FFF; border-radius: 32rpx 32rpx 0 0; padding: 32rpx; max-height: 80vh; display: flex; flex-direction: column; }
.modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24rpx; }
.modal-title { font-size: 32rpx; font-weight: bold; color: #333; }
.modal-close { width: 52rpx; height: 52rpx; background: rgba(0,0,0,0.05); border-radius: 26rpx; display: flex; align-items: center; justify-content: center; }
.modal-close-text { font-size: 26rpx; color: #999; }
.modal-body { flex: 1; }
.field-group { margin-top: 20rpx; padding-top: 20rpx; border-top: 1rpx solid rgba(0,0,0,0.05); }
.field-tags { display: flex; gap: 16rpx; flex-wrap: wrap; margin-top: 14rpx; }
.field-tag { padding: 10rpx 28rpx; border-radius: 30rpx; background: rgba(0,0,0,0.04); border: 2rpx solid transparent; }
.field-tag-text { font-size: 26rpx; color: #999; }
.tag-on { background: rgba(0,122,255,0.08); border-color: #007AFF; }
.tag-on .field-tag-text { color: #007AFF; }
.sess-head { display: flex; align-items: center; justify-content: space-between; }
.add-sess { padding: 8rpx 20rpx; border-radius: 24rpx; background: rgba(0,122,255,0.08); }
.add-sess-text { font-size: 24rpx; color: #007AFF; }
.sess-row { display: flex; align-items: center; gap: 12rpx; margin-top: 20rpx; }
.sess-input { flex: 1; height: 68rpx; background: rgba(0,0,0,0.04); border-radius: 14rpx; padding: 0 16rpx; font-size: 24rpx; color: #333; min-width: 0; }
.sess-quota { flex: 0.8; }
.sess-time { height: 68rpx; background: rgba(0,0,0,0.04); border-radius: 14rpx; padding: 0 14rpx; display: flex; align-items: center; }
.sess-time-text { font-size: 24rpx; color: #666; }
.sess-del { width: 48rpx; height: 48rpx; border-radius: 24rpx; background: rgba(255,107,107,0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sess-del-text { font-size: 22rpx; color: #FF6B6B; }
.modal-foot { margin-top: 24rpx; }
.modal-btn { height: 84rpx; background: #333; border-radius: 42rpx; display: flex; align-items: center; justify-content: center; }
.modal-btn:active { opacity: 0.8; }
.modal-btn-text { font-size: 30rpx; color: #FFF; }

.toast { position: fixed; top: 200rpx; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.75); border-radius: 16rpx; padding: 16rpx 32rpx; z-index: 999; }
.toast-text { font-size: 28rpx; color: #FFF; }
</style>
