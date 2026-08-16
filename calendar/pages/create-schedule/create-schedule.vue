<template>
	<view class="container">
		<!-- 编辑模式提示 -->
		<view class="edit-banner" v-if="editId">
			<text class="edit-banner-text">编辑模式</text>
		</view>

		<!-- 模板选择 -->
		<view class="template-section">
			<text class="form-label">快速模板</text>
			<view class="template-row">
				<view class="template-pill" :class="{ 'tpl-active': selectedTemplate === 'birthday' }" @click="selectTemplate('birthday')">
					<text class="tpl-text">生日</text>
				</view>
				<view class="template-pill" :class="{ 'tpl-active': selectedTemplate === 'event' }" @click="selectTemplate('event')">
					<text class="tpl-text">活动</text>
				</view>
				<view class="template-pill" :class="{ 'tpl-active': selectedTemplate === 'meeting' }" @click="selectTemplate('meeting')">
					<text class="tpl-text">会议</text>
				</view>
				<view class="template-pill" :class="{ 'tpl-active': selectedTemplate === 'other' }" @click="selectTemplate('other')">
					<text class="tpl-text">其他</text>
				</view>
			</view>
			<text class="form-hint">发布到群并开启报名时，将按模板自动生成报名问卷，可再手动调整</text>
		</view>

		<!-- 成员名（生日模板时显示） -->
		<view class="form-group" v-if="selectedTemplate === 'birthday'">
			<text class="form-label">过生日的人</text>
			<input class="form-input" v-model="memberName" placeholder="输入成员名字" />
		</view>

		<view class="form-group">
			<text class="form-label">标题</text>
			<input class="form-input" v-model="title" :placeholder="titlePlaceholder" />
		</view>

		<view class="form-group">
			<text class="form-label">日期</text>
			<picker mode="date" :value="date" @change="onDateChange">
				<view class="form-input picker-input">
					<text :class="date ? 'picker-text' : 'picker-placeholder'">{{ date || '选择日期' }}</text>
				</view>
			</picker>
		</view>

		<view class="form-group time-row" v-if="!useSessions">
			<view class="time-col">
				<text class="form-label">开始时间</text>
				<picker mode="time" :value="startTime" @change="e => startTime = e.detail.value">
					<view class="form-input picker-input">
						<text :class="startTime ? 'picker-text' : 'picker-placeholder'">{{ startTime || '全天' }}</text>
					</view>
				</picker>
			</view>
			<view class="time-col">
				<text class="form-label">结束时间</text>
				<picker mode="time" :value="endTime" @change="e => endTime = e.detail.value">
					<view class="form-input picker-input">
						<text :class="endTime ? 'picker-text' : 'picker-placeholder'">{{ endTime || '不填' }}</text>
					</view>
				</picker>
			</view>
		</view>

		<!-- 生日：是否每年重复 -->
		<view class="form-group" v-if="selectedTemplate === 'birthday'">
			<view class="repeat-row">
				<text class="form-label" style="margin-bottom:0">每年提醒</text>
				<switch :checked="yearlyRepeat" @change="yearlyRepeat = $event.detail.value" color="#333" />
			</view>
		</view>

		<!-- 定时提醒 -->
		<view class="form-group">
			<text class="form-label">定时提醒</text>
			<view class="template-row">
				<view class="template-pill" :class="{ 'tpl-active': reminderMinutes === 0 }" @click="setReminder(0)">
					<text class="tpl-text">不提醒</text>
				</view>
				<view class="template-pill" :class="{ 'tpl-active': reminderMinutes === 5 }" @click="setReminder(5)">
					<text class="tpl-text">提前5分钟</text>
				</view>
				<view class="template-pill" :class="{ 'tpl-active': reminderMinutes === 30 }" @click="setReminder(30)">
					<text class="tpl-text">提前30分钟</text>
				</view>
				<view class="template-pill" :class="{ 'tpl-active': reminderMinutes === 60 }" @click="setReminder(60)">
					<text class="tpl-text">提前1小时</text>
				</view>
				<view class="template-pill" :class="{ 'tpl-active': reminderMinutes === 1440 }" @click="setReminder(1440)">
					<text class="tpl-text">提前1天</text>
				</view>
			</view>
			<text class="form-hint" v-if="reminderMinutes > 0">推送提醒需你授权订阅，未授权时 App 内仍会提示</text>
		</view>

		<!-- 发布范围 -->
		<view class="form-group">
			<text class="form-label">发布范围</text>
			<view class="template-row">
				<view class="template-pill" :class="{ 'tpl-active': scope === 'private' }" @click="selectScope('private')">
					<text class="tpl-text">私有保存</text>
				</view>
				<view class="template-pill" :class="{ 'tpl-active': scope === 'group' }" @click="selectScope('group')">
					<text class="tpl-text">发布到群</text>
				</view>
			</view>
		</view>

		<!-- 群选择 -->
		<view class="form-group" v-if="scope === 'group'">
			<text class="form-label">选择群组</text>
			<picker :range="groups" range-key="group_name" @change="onGroupChange">
				<view class="form-input picker-input">
					<text :class="groupId ? 'picker-text' : 'picker-placeholder'">{{ groupName || '请选择群组' }}</text>
				</view>
			</picker>
			<view class="repeat-row" style="margin-top:16rpx">
				<text class="form-label" style="margin-bottom:0">启用报名</text>
				<switch :checked="signupEnabled" @change="onSignupEnabledChange" color="#333" />
			</view>
			<text class="form-hint" v-if="signupEnabled">群成员可报名参加，并看到报名名单；报名成功后自动进入成员个人日程</text>

			<!-- 报名配置 -->
			<template v-if="signupEnabled">
				<view class="form-group sub-group">
					<text class="form-label">名额上限</text>
					<input class="form-input" type="number" v-model="signupQuota" placeholder="0 表示不限" placeholder-class="picker-placeholder" />
				</view>

				<view class="form-group sub-group">
					<text class="form-label">报名截止</text>
					<picker mode="date" :value="signupDeadline" @change="e => signupDeadline = e.detail.value">
						<view class="form-input picker-input">
							<text :class="signupDeadline ? 'picker-text' : 'picker-placeholder'">{{ signupDeadline || '不设截止（开始前均可报名）' }}</text>
						</view>
					</picker>
				</view>

				<view class="form-group sub-group">
					<view class="repeat-row">
						<text class="form-label" style="margin-bottom:0">分场次报名</text>
						<switch :checked="useSessions" @change="onUseSessionsChange" color="#333" />
					</view>
					<text class="form-hint">{{ useSessions ? '按场次报名：隐藏整体时间段，每场单独时间与名额' : '单时间段报名：设置整体开始/结束时间与总名额' }}</text>
				</view>

				<view class="form-group sub-group">
					<view class="sess-head">
						<text class="form-label" style="margin-bottom:0">报名问卷</text>
						<view class="add-sess" @click="addFormField">
							<text class="add-sess-text">+ 添加字段</text>
						</view>
					</view>
					<text class="form-hint">报名者需填写以下字段，可增删、调整类型、必填与预填来源</text>

					<view class="field-card" v-for="(field, fi) in signupForm" :key="fi">
						<view class="field-head">
							<input class="field-label-input" v-model="field.label" placeholder="字段名" placeholder-class="picker-placeholder" />
							<view class="field-del" @click="removeFormField(fi)">
								<text class="sess-del-text">✕</text>
							</view>
						</view>
						<view class="field-row">
							<picker :range="typeLabels" @change="e => changeFieldType(fi, e.detail.value)">
								<view class="mini-btn"><text class="mini-btn-text">{{ typeLabel(field.type) }}</text></view>
							</picker>
							<picker :range="prefillLabels" @change="e => field.prefill = prefillValues[e.detail.value]">
								<view class="mini-btn"><text class="mini-btn-text">{{ prefillLabel(field.prefill) }}</text></view>
							</picker>
							<view class="mini-btn" :class="{ 'mini-active': field.required }" @click="toggleFieldRequired(fi)">
								<text class="mini-btn-text">必填</text>
							</view>
							<view class="mini-btn" v-if="field.type === 'date'" :class="{ 'mini-active': !!field.save_to_profile }" @click="toggleSaveToProfile(fi)">
								<text class="mini-btn-text">写生日档案</text>
							</view>
						</view>
						<input class="form-input opts-input" v-if="field.type === 'select' || field.type === 'checkbox'" v-model="field._options" placeholder="选项（逗号分隔）" placeholder-class="picker-placeholder" />
					</view>
				</view>

				<view class="form-group sub-group" v-if="useSessions">
					<view class="sess-head">
						<text class="form-label" style="margin-bottom:0">场次设置</text>
						<view class="add-sess" @click="addSignupSession">
							<text class="add-sess-text">+ 添加场次</text>
						</view>
					</view>
					<text class="form-hint">报名者选择场次，并受各场次名额限制</text>
					<view class="sess-row" v-for="(s, i) in signupSessions" :key="i">
						<input class="sess-input" v-model="s.name" placeholder="场次名" placeholder-class="picker-placeholder" />
						<input class="sess-input sess-quota" type="number" v-model="s.quota" placeholder="名额0不限" placeholder-class="picker-placeholder" />
						<picker mode="time" :value="s.start_time" @change="e => s.start_time = e.detail.value">
							<view class="sess-time"><text class="sess-time-text">{{ s.start_time || '开始' }}</text></view>
						</picker>
						<picker mode="time" :value="s.end_time" @change="e => s.end_time = e.detail.value">
							<view class="sess-time"><text class="sess-time-text">{{ s.end_time || '结束' }}</text></view>
						</picker>
						<view class="sess-del" @click="removeSignupSession(i)">
							<text class="sess-del-text">✕</text>
						</view>
					</view>
				</view>
			</template>
		</view>

		<view class="form-group">
			<text class="form-label">备注（可选）</text>
			<textarea class="form-textarea" v-model="description" placeholder="添加备注..." :maxlength="-1" />
		</view>

		<view class="submit-btn" :class="{ 'btn-disabled': !canSubmit }" @click="submitSchedule">
			<text class="submit-btn-text">{{ editId ? '保存修改' : '创建日程' }}</text>
		</view>

		<view class="toast" v-if="toastMsg">
			<text class="toast-text">{{ toastMsg }}</text>
		</view>
	</view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const SUBSCRIBE_TEMPLATE_ID = 'UVDiKNJ5K6pYWCC94empCnhmVjMep3nfOmkgQmYd2J0'

const editId = ref('')
const selectedTemplate = ref('birthday')
const title = ref('')
const date = ref('')
const startTime = ref('')
const endTime = ref('')
const memberName = ref('')
const description = ref('')
const yearlyRepeat = ref(true)
const reminderMinutes = ref(0)
const scope = ref('private')
const groups = ref([])
const groupId = ref('')
const groupName = ref('')
const signupEnabled = ref(false)
const signupQuota = ref('')
const signupDeadline = ref('')
const useSessions = ref(false)
const signupForm = ref([])
const signupSessions = ref([])
const creating = ref(false)
const toastMsg = ref('')

const titlePlaceholder = computed(() => {
	const m = { birthday: 'XX的生日', event: '活动名称', meeting: '会议主题', other: '日程标题' }
	return m[selectedTemplate.value] || '日程标题'
})

const canSubmit = computed(() => title.value.trim() && date.value && !creating.value && (scope.value === 'private' || !!groupId.value))

const selectTemplate = (t) => {
	if (editId.value) return
	selectedTemplate.value = t
	if (scope.value === 'group' && signupEnabled.value) {
		signupForm.value = syncSessionField(defaultFormFor(t))
	}
}

const onDateChange = (e) => { date.value = e.detail.value }

const selectScope = (s) => {
	if (editId.value && scope.value === 'group' && s === 'private') return
	scope.value = s
}

const onGroupChange = (e) => {
	const g = groups.value[e.detail.value]
	if (g) {
		groupId.value = g._id
		groupName.value = g.group_name
	}
}

const typeLabels = ['单行文本', '多行文本', '数字', '日期', '单选', '多选']
const typeValues = ['text', 'textarea', 'number', 'date', 'select', 'checkbox']
const prefillLabels = ['手动填写', '群昵称', '个人档案']
const prefillValues = ['manual', 'group', 'profile']

const typeLabel = (t) => ({ text: '单行文本', textarea: '多行文本', number: '数字', date: '日期', select: '单选', checkbox: '多选' }[t] || '单行文本')
const prefillLabel = (v) => ({ manual: '手动填写', group: '群昵称', profile: '个人档案' }[v] || '手动填写')

const defaultFormFor = (t) => {
	const base = { key: 'name', label: '姓名', type: 'text', required: true, options: [], _options: '', prefill: 'group', save_to_profile: '' }
	if (t === 'birthday') return [
		base,
		{ key: 'birthday', label: '我的生日', type: 'date', required: true, options: [], _options: '', prefill: 'profile', save_to_profile: 'birthday' },
		{ key: 'note', label: '备注', type: 'textarea', required: false, options: [], _options: '', prefill: 'manual', save_to_profile: '' }
	]
	if (t === 'meeting') return [
		base,
		{ key: 'phone', label: '联系方式', type: 'text', required: false, options: [], _options: '', prefill: 'profile', save_to_profile: '' }
	]
	if (t === 'event') return [
		base,
		{ key: 'phone', label: '联系方式', type: 'text', required: false, options: [], _options: '', prefill: 'profile', save_to_profile: '' },
		{ key: 'session', label: '参加场次', type: 'select', required: false, options: [], _options: '', prefill: 'manual', save_to_profile: '' }
	]
	return [base]
}

const normalizeForm = () => {
	return signupForm.value.map(f => {
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

const onSignupEnabledChange = (e) => {
	signupEnabled.value = e.detail.value
	if (signupEnabled.value && signupForm.value.length === 0) {
		signupForm.value = defaultFormFor(selectedTemplate.value)
	}
}

const onUseSessionsChange = (e) => {
	useSessions.value = e.detail.value
	signupForm.value = syncSessionField(signupForm.value)
}

const syncSessionField = (form) => {
	if (useSessions.value) {
		if (form.some(f => f.key === 'session')) return form
		return [...form, { key: 'session', label: '参加场次', type: 'select', required: true, options: [], _options: '', prefill: 'manual', save_to_profile: '' }]
	}
	return form.filter(f => f.key !== 'session')
}

const addFormField = () => {
	signupForm.value.push({ key: 'f' + Date.now(), label: '自定义字段', type: 'text', required: false, options: [], _options: '', prefill: 'manual', save_to_profile: '' })
}

const removeFormField = (i) => {
	signupForm.value.splice(i, 1)
}

const changeFieldType = (i, ti) => {
	signupForm.value[i].type = typeValues[ti] || 'text'
}

const toggleFieldRequired = (i) => {
	signupForm.value[i].required = !signupForm.value[i].required
}

const toggleSaveToProfile = (i) => {
	signupForm.value[i].save_to_profile = signupForm.value[i].save_to_profile ? '' : 'birthday'
}

const addSignupSession = () => {
	signupSessions.value.push({ name: '', quota: '', start_time: '', end_time: '' })
}

const removeSignupSession = (i) => {
	signupSessions.value.splice(i, 1)
}

const setReminder = (minutes) => {
	reminderMinutes.value = minutes
	if (minutes <= 0) return
	if (!SUBSCRIBE_TEMPLATE_ID) return
	uni.requestSubscribeMessage({
		tmplIds: [SUBSCRIBE_TEMPLATE_ID],
		success: (res) => {
			if (res[SUBSCRIBE_TEMPLATE_ID] !== 'accept') {
				showToast('未授权推送，App 内仍会提醒')
			}
		},
		fail: () => {
			showToast('未授权推送，App 内仍会提醒')
		}
	})
}

const requireLogin = () => {
	const token = uni.getStorageSync('uni_id_token')
	const userInfo = uni.getStorageSync('uni_id_user_info')
	if (!token || !userInfo) {
		uni.navigateTo({ url: `/pages/login/login?redirect=${encodeURIComponent('/pages/create-schedule/create-schedule')}` })
		return false
	}
	return true
}

const getUserId = async () => {
	const token = uni.getStorageSync('uni_id_token')
	const userInfo = uni.getStorageSync('uni_id_user_info')
	if (token && userInfo) return token
	return null
}

const generateVisitorId = () => {
	const id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
	uni.setStorageSync('visitor_id', id)
	return id
}

const loadGroups = async () => {
	const uid = await getUserId()
	if (!uid) return
	if (!uid || uid.startsWith('visitor_')) return
	const res = await uniCloud.callFunction({
		name: 'groups',
		data: { action: 'myGroups', user_id: uid }
	}).catch(e => {
		console.error('load groups fail:', e)
		return { result: null }
	})
	if (res?.result && res.result.code === 200) {
		groups.value = res.result.data || []
	}
}

const loadEditSchedule = async (sid) => {
	try {
		const uid = await getUserId()
		const res = await uniCloud.callFunction({
			name: 'schedules',
			data: { action: 'detail', schedule_id: sid, user_id: uid }
		}).catch(e => {
			console.error('load schedule fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			const s = res.result.data
			editId.value = sid
			selectedTemplate.value = s.type || 'other'
			title.value = s.title || ''
			date.value = s.date || ''
			startTime.value = s.start_time || ''
			endTime.value = s.end_time || ''
			memberName.value = s.member_name || ''
			description.value = s.description || ''
			scope.value = s.scope === 'group' ? 'group' : 'private'
			signupEnabled.value = !!s.signup_enabled
			useSessions.value = !!s.use_sessions
			signupQuota.value = s.signup_quota ? String(s.signup_quota) : ''
			signupDeadline.value = s.signup_deadline || ''
			signupForm.value = (s.signup_form || []).map(f => ({
				key: f.key,
				label: f.label || f.key,
				type: f.type || 'text',
				required: !!f.required,
				options: f.options || [],
				_options: (f.options || []).join(','),
				prefill: f.prefill || 'manual',
				save_to_profile: f.save_to_profile || ''
			}))
			signupForm.value = syncSessionField(signupForm.value)
			signupSessions.value = (s.sessions || []).map(x => ({ name: x.name || '', quota: x.quota ? String(x.quota) : '', start_time: x.start_time || '', end_time: x.end_time || '' }))
			const first = (s.reminders || [])[0]
			reminderMinutes.value = first ? (first.minutes_before || 0) : 0
			if (scope.value === 'group' && s.group_id) {
				groupId.value = s.group_id
				const g = groups.value.find(x => x._id === s.group_id)
				groupName.value = g ? g.group_name : ''
			}
		} else {
			showToast('日程不存在')
		}
	} catch (e) {
		console.error('load edit schedule fail:', e)
	}
}

const submitSchedule = async () => {
	if (!requireLogin()) return
	if (!canSubmit.value) return
	creating.value = true
	try {
		const user_id = await getUserId()
		const finalTitle = selectedTemplate.value === 'birthday' && memberName.value
			? `${memberName.value}的生日`
			: title.value.trim()
		const reminders = reminderMinutes.value > 0
			? [{ minutes_before: reminderMinutes.value }]
			: []
		const data = {
			action: editId.value ? 'update' : 'create',
			user_id,
			title: finalTitle,
			date: date.value,
			start_time: startTime.value,
			end_time: endTime.value,
			type: selectedTemplate.value,
			scope: scope.value,
			group_id: scope.value === 'group' ? groupId.value : '',
			signup_enabled: scope.value === 'group' ? signupEnabled.value : false,
			signup_quota: scope.value === 'group' ? (Number(signupQuota.value) || 0) : 0,
			signup_deadline: scope.value === 'group' ? signupDeadline.value : '',
			use_sessions: scope.value === 'group' && signupEnabled.value ? useSessions.value : false,
			signup_form: scope.value === 'group' ? normalizeForm() : [],
			sessions: scope.value === 'group' && useSessions.value
				? signupSessions.value.filter(s => s.name && s.name.trim()).map(s => ({
					name: s.name.trim(),
					quota: Number(s.quota) || 0,
					start_time: s.start_time || '',
					end_time: s.end_time || ''
				}))
				: [],
			reminders,
			member_name: selectedTemplate.value === 'birthday' ? memberName.value.trim() : '',
			description: description.value.trim()
		}
		if (editId.value) data.schedule_id = editId.value
		const res = await uniCloud.callFunction({
			name: 'schedules',
			data
		}).catch(e => {
			console.error('schedule cloud fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			showToast(editId.value ? '已保存' : '创建成功')
			setTimeout(() => { uni.navigateBack() }, 800)
		} else {
			showToast(res?.result?.message || '操作失败，请重试')
		}
	} catch (e) {
		showToast('操作失败，请重试')
	} finally {
		creating.value = false
	}
}

const showToast = (msg) => {
	toastMsg.value = msg
	setTimeout(() => { toastMsg.value = '' }, 2000)
}

onMounted(async () => {
	if (!requireLogin()) return
	await loadGroups()
	const pages = getCurrentPages()
	const page = pages[pages.length - 1]
	const options = page?.options || {}
	if (options.schedule_id) {
		await loadEditSchedule(options.schedule_id)
	} else if (options.group_id) {
		scope.value = 'group'
		groupId.value = options.group_id
		const g = groups.value.find(x => x._id === options.group_id)
		groupName.value = g ? g.group_name : ''
	}
})
</script>

<style>
page { background-color: #F0F1F5; }
.container { padding: 30rpx; }

.edit-banner { background: rgba(0,122,255,0.08); border-radius: 16rpx; padding: 16rpx 24rpx; margin-bottom: 24rpx; }
.edit-banner-text { font-size: 26rpx; color: #007AFF; }

.template-section { margin-bottom: 28rpx; }
.form-label { font-size: 26rpx; color: #999; font-weight: 600; margin-bottom: 12rpx; display: block; }
.template-row { display: flex; gap: 12rpx; flex-wrap: wrap; }
.template-pill { padding: 12rpx 28rpx; border-radius: 30rpx; background: rgba(0,0,0,0.04); transition: all 0.2s; }
.tpl-active { background: #333; }
.tpl-text { font-size: 26rpx; color: #666; }
.tpl-active .tpl-text { color: #FFF; }

.form-group { margin-bottom: 24rpx; }
.form-input {
	width: 100%;
	height: 80rpx;
	background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%);
	border-radius: 16rpx;
	padding: 0 24rpx;
	font-size: 30rpx;
	color: #333;
	box-sizing: border-box;
	box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04);
}
.picker-input { display: flex; align-items: center; }
.picker-text { font-size: 30rpx; color: #333; }
.picker-placeholder { font-size: 30rpx; color: #CCC; }
.form-hint { font-size: 22rpx; color: #CCC; display: block; margin-top: 12rpx; }

.time-row { display: flex; gap: 20rpx; }
.time-col { flex: 1; }

.form-textarea { width: 100%; height: 160rpx; background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%); border-radius: 16rpx; padding: 20rpx 24rpx; font-size: 28rpx; color: #333; box-sizing: border-box; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); }

.sub-group { margin-top: 24rpx; padding-top: 24rpx; border-top: 1rpx solid rgba(0,0,0,0.05); }
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
.sess-head { display: flex; align-items: center; justify-content: space-between; }
.add-sess { padding: 8rpx 20rpx; border-radius: 24rpx; background: rgba(0,122,255,0.08); }
.add-sess-text { font-size: 24rpx; color: #007AFF; }
.sess-row { display: flex; align-items: center; gap: 12rpx; margin-top: 20rpx; flex-wrap: nowrap; }
.sess-input { flex: 1; height: 68rpx; background: rgba(0,0,0,0.04); border-radius: 14rpx; padding: 0 16rpx; font-size: 24rpx; color: #333; min-width: 0; box-sizing: border-box; box-shadow: none; }
.sess-quota { flex: 0.8; }
.sess-time { height: 68rpx; background: rgba(0,0,0,0.04); border-radius: 14rpx; padding: 0 14rpx; display: flex; align-items: center; }
.sess-time-text { font-size: 24rpx; color: #666; }
.sess-del { width: 48rpx; height: 48rpx; border-radius: 24rpx; background: rgba(255,107,107,0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sess-del-text { font-size: 22rpx; color: #FF6B6B; }

.repeat-row { display: flex; align-items: center; justify-content: space-between; }

.submit-btn { width: 100%; height: 88rpx; display: flex; align-items: center; justify-content: center; background: #333; border-radius: 44rpx; margin-top: 16rpx; transition: all 0.2s; }
.submit-btn:active { transform: scale(0.98); }
.btn-disabled { opacity: 0.4; }
.submit-btn-text { font-size: 30rpx; color: #FFF; font-weight: 500; }

.toast { position: fixed; top: 200rpx; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.75); border-radius: 16rpx; padding: 16rpx 32rpx; z-index: 999; }
.toast-text { font-size: 28rpx; color: #FFF; }
</style>
