<template>
	<view class="container">
		<!-- 我的草稿 -->
		<view class="card" v-if="drafts.length > 0">
			<view class="sess-head">
				<text class="card-title" style="margin-bottom:0">我的草稿（{{ drafts.length }}）</text>
				<view class="add-sess" @click="loadDrafts">
					<text class="add-sess-text">刷新</text>
				</view>
			</view>
			<view class="draft-item" v-for="d in drafts" :key="d._id" @click="loadDraft(d)">
				<view class="draft-main">
					<text class="draft-title">{{ d.title }}</text>
					<text class="draft-sub">{{ d.date || '未定日期' }}<template v-if="d.group_id"> · 已选群</template></text>
				</view>
				<view class="draft-del" @click.stop="deleteDraft(d)">
					<text class="sess-del-text">✕</text>
				</view>
			</view>
		</view>

		<!-- 模板 -->
		<view class="template-section">
			<text class="form-label">报名类型</text>
			<view class="template-row">
				<view class="template-pill" :class="{ 'tpl-active': selectedTemplate === 'event' }" @click="selectTemplate('event')">
					<text class="tpl-text">活动</text>
				</view>
				<view class="template-pill" :class="{ 'tpl-active': selectedTemplate === 'meeting' }" @click="selectTemplate('meeting')">
					<text class="tpl-text">会议</text>
				</view>
				<view class="template-pill" :class="{ 'tpl-active': selectedTemplate === 'birthday' }" @click="selectTemplate('birthday')">
					<text class="tpl-text">生日</text>
				</view>
				<view class="template-pill" :class="{ 'tpl-active': selectedTemplate === 'other' }" @click="selectTemplate('other')">
					<text class="tpl-text">其他</text>
				</view>
			</view>
			<text class="form-hint">发布到群后，将自动加入该群日程</text>
		</view>

		<!-- 基本信息 -->
		<view class="form-group">
			<text class="form-label">标题</text>
			<input class="form-input" v-model="title" :placeholder="titlePlaceholder" />
		</view>

		<view class="form-group">
			<text class="form-label">发布到群</text>
			<picker :range="groups" range-key="group_name" @change="onGroupChange">
				<view class="form-input picker-input">
					<text :class="groupId ? 'picker-text' : 'picker-placeholder'">{{ groupName || '请选择群组' }}</text>
				</view>
			</picker>
		</view>

		<view class="form-group">
			<text class="form-label">活动日期</text>
			<picker mode="date" :value="date" @change="e => date = e.detail.value">
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

		<!-- 报名配置 -->
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

		<!-- 报名问卷 -->
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

		<!-- 场次设置 -->
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

		<view class="form-group">
			<text class="form-label">备注（可选）</text>
			<textarea class="form-textarea" v-model="description" placeholder="活动说明..." :maxlength="-1" />
		</view>

		<view class="notify-row">
			<text class="notify-text">发布后可授权「活动发布」订阅消息，群成员在群内也可自助开启</text>
		</view>

		<view class="btn-row">
			<view class="btn draft-btn" :class="{ 'btn-disabled': saving }" @click="saveDraft">
				<text class="draft-btn-text">{{ editDraftId ? '更新草稿' : '保存草稿' }}</text>
			</view>
			<view class="btn publish-btn" :class="{ 'btn-disabled': !canPublish }" @click="publishSignup">
				<text class="publish-btn-text">发布到群</text>
			</view>
		</view>

		<view class="toast" v-if="toastMsg">
			<text class="toast-text">{{ toastMsg }}</text>
		</view>
	</view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getUid } from '@/utils/auth.js'
import { callApi } from '@/utils/cloud.js'

const SIGNUP_PUBLISH_TMPL = '46MLVHkksG2sXsydt_CuGDdRlW1Pdhv5YjdHf1Ojpgc' // 最近活动提醒：活动名称/活动时间/剩余天数

const editDraftId = ref('')
const selectedTemplate = ref('event')
const title = ref('')
const date = ref('')
const startTime = ref('')
const endTime = ref('')
const description = ref('')
const groups = ref([])
const groupId = ref('')
const groupName = ref('')
const signupQuota = ref('')
const signupDeadline = ref('')
const signupForm = ref([])
const signupSessions = ref([])
const useSessions = ref(false)
const drafts = ref([])
const saving = ref(false)
const publishing = ref(false)
const toastMsg = ref('')

const titlePlaceholder = computed(() => {
	const m = { birthday: 'XX的生日聚会报名', event: '活动名称', meeting: '会议主题', other: '报名标题' }
	return m[selectedTemplate.value] || '报名标题'
})

const canPublish = computed(() => title.value.trim() && date.value && !!groupId.value && !publishing.value)

const showToast = (msg) => {
	toastMsg.value = msg
	setTimeout(() => { toastMsg.value = '' }, 2000)
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

const selectTemplate = (t) => {
	selectedTemplate.value = t
	signupForm.value = syncSessionField(defaultFormFor(t))
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

const onGroupChange = (e) => {
	const g = groups.value[e.detail.value]
	if (g) {
		groupId.value = g._id
		groupName.value = g.group_name
	}
}

const addFormField = () => {
	signupForm.value.push({ key: 'f' + Date.now(), label: '自定义字段', type: 'text', required: false, options: [], _options: '', prefill: 'manual', save_to_profile: '' })
}

const removeFormField = (i) => { signupForm.value.splice(i, 1) }
const changeFieldType = (i, ti) => { signupForm.value[i].type = typeValues[ti] || 'text' }
const toggleFieldRequired = (i) => { signupForm.value[i].required = !signupForm.value[i].required }
const toggleSaveToProfile = (i) => { signupForm.value[i].save_to_profile = signupForm.value[i].save_to_profile ? '' : 'birthday' }

const addSignupSession = () => { signupSessions.value.push({ name: '', quota: '', start_time: '', end_time: '' }) }
const removeSignupSession = (i) => { signupSessions.value.splice(i, 1) }

const loadGroups = async () => {
	const uid = getUid()
	if (!uid || uid.startsWith('visitor_')) return
	const res = await callApi('groups', 'myGroups', { user_id: uid }).catch(e => {
		console.error('load groups fail:', e)
		return { result: null }
	})
	if (res?.result && res.result.code === 200) {
		groups.value = res.result.data || []
	}
}

const loadDrafts = async () => {
	const uid = getUid()
	if (!uid || uid.startsWith('visitor_')) return
	const res = await callApi('schedules', 'listSignupDrafts', { user_id: uid }).catch(() => ({ result: null }))
	if (res?.result?.code === 200) {
		drafts.value = res.result.data || []
	}
}

const loadDraft = (d) => {
	editDraftId.value = d._id
	selectedTemplate.value = d.type || 'event'
	title.value = d.title || ''
	date.value = d.date || ''
	startTime.value = d.start_time || ''
	endTime.value = d.end_time || ''
	description.value = d.description || ''
	signupQuota.value = d.signup_quota ? String(d.signup_quota) : ''
	signupDeadline.value = d.signup_deadline || ''
	signupForm.value = (d.signup_form || []).map(f => ({
		key: f.key,
		label: f.label || f.key,
		type: f.type || 'text',
		required: !!f.required,
		options: f.options || [],
		_options: (f.options || []).join(','),
		prefill: f.prefill || 'manual',
		save_to_profile: f.save_to_profile || ''
	}))
	useSessions.value = !!d.use_sessions
	signupForm.value = syncSessionField(signupForm.value)
	signupSessions.value = (d.sessions || []).map(s => ({ name: s.name || '', quota: s.quota ? String(s.quota) : '', start_time: s.start_time || '', end_time: s.end_time || '' }))
	if (d.group_id) {
		const g = groups.value.find(x => x._id === d.group_id)
		if (g) {
			groupId.value = g._id
			groupName.value = g.group_name
		}
	}
	showToast('已载入草稿')
}

const deleteDraft = async (d) => {
	const uid = getUid()
	await callApi('schedules', 'deleteSignupDraft', { user_id: uid, draft_id: d._id }).catch(() => null)
	if (editDraftId.value === d._id) editDraftId.value = ''
	await loadDrafts()
	showToast('草稿已删除')
}

const saveDraft = async () => {
	if (!title.value.trim()) return showToast('请填写标题')
	if (saving.value) return
	saving.value = true
	try {
		const uid = getUid()
		const res = await callApi('schedules', 'saveSignupDraft', {
			user_id: uid,
			draft_id: editDraftId.value,
			group_id: groupId.value,
			title: title.value.trim(),
			date: date.value,
			start_time: startTime.value,
			end_time: endTime.value,
			type: selectedTemplate.value,
			description: description.value.trim(),
			signup_form: normalizeForm(),
			use_sessions: useSessions.value,
			sessions: useSessions.value ? signupSessions.value.filter(s => s.name && s.name.trim()).map(s => ({
				name: s.name.trim(),
				quota: Number(s.quota) || 0,
				start_time: s.start_time || '',
				end_time: s.end_time || ''
			})) : [],
			signup_quota: Number(signupQuota.value) || 0,
			signup_deadline: signupDeadline.value
		}).catch(e => {
			console.error('save draft fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			editDraftId.value = res.result.id || editDraftId.value
			showToast('草稿已保存')
			await loadDrafts()
		} else {
			showToast(res?.result?.message || '保存失败')
		}
	} catch (e) {
		showToast('保存失败')
	} finally {
		saving.value = false
	}
}

const publishSignup = async () => {
	if (!canPublish.value) {
		if (!groupId.value) return showToast('请先选择发布群组')
		if (!date.value) return showToast('请选择活动日期')
		if (!title.value.trim()) return showToast('请填写标题')
		return
	}
	publishing.value = true
	try {
		const uid = getUid()
		const res = await callApi('schedules', 'publishSignup', {
			user_id: uid,
			draft_id: editDraftId.value,
			group_id: groupId.value,
			title: title.value.trim(),
			date: date.value,
			start_time: startTime.value,
			end_time: endTime.value,
			type: selectedTemplate.value,
			description: description.value.trim(),
			signup_form: normalizeForm(),
			use_sessions: useSessions.value,
			sessions: useSessions.value ? signupSessions.value.filter(s => s.name && s.name.trim()).map(s => ({
				name: s.name.trim(),
				quota: Number(s.quota) || 0,
				start_time: s.start_time || '',
				end_time: s.end_time || ''
			})) : [],
			signup_quota: Number(signupQuota.value) || 0,
			signup_deadline: signupDeadline.value
		}).catch(e => {
			console.error('publish signup fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			showToast(res.result.message)
			if (SIGNUP_PUBLISH_TMPL) {
				uni.requestSubscribeMessage({
					tmplIds: [SIGNUP_PUBLISH_TMPL],
					fail: () => {}
				})
			}
			setTimeout(() => {
				uni.redirectTo({
					url: '/pages/schedule-detail/schedule-detail?schedule_id=' + (res.result.id || '')
				})
			}, 900)
		} else {
			showToast(res?.result?.message || '发布失败')
		}
	} catch (e) {
		showToast('发布失败')
	} finally {
		publishing.value = false
	}
}

onMounted(async () => {
	await loadGroups()
	await loadDrafts()
	if (signupForm.value.length === 0) signupForm.value = defaultFormFor('event')
	const pages = getCurrentPages()
	const page = pages[pages.length - 1]
	const options = page?.options || {}
	if (options.group_id) {
		groupId.value = options.group_id
		const g = groups.value.find(x => x._id === options.group_id)
		groupName.value = g ? g.group_name : ''
	}
})
</script>

<style>
page { background-color: #F0F1F5; }
.container { padding: 30rpx; }

.card { background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%); border-radius: 24rpx; padding: 28rpx 32rpx; margin-bottom: 24rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); }
.card-title { font-size: 26rpx; color: #999; font-weight: 600; display: block; }
.draft-item { display: flex; align-items: center; padding: 18rpx 0; border-bottom: 1rpx solid rgba(0,0,0,0.04); }
.draft-item:last-child { border-bottom: none; }
.draft-main { flex: 1; min-width: 0; }
.draft-title { font-size: 28rpx; color: #333; font-weight: 500; display: block; }
.draft-sub { font-size: 22rpx; color: #999; display: block; margin-top: 4rpx; }
.draft-del { width: 44rpx; height: 44rpx; border-radius: 22rpx; background: rgba(255,107,107,0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-left: 12rpx; }

.template-section { margin-bottom: 28rpx; }
.form-label { font-size: 26rpx; color: #999; font-weight: 600; margin-bottom: 12rpx; display: block; }
.template-row { display: flex; gap: 12rpx; flex-wrap: wrap; }
.template-pill { padding: 12rpx 28rpx; border-radius: 30rpx; background: rgba(0,0,0,0.04); }
.tpl-active { background: #333; }
.tpl-text { font-size: 26rpx; color: #666; }
.tpl-active .tpl-text { color: #FFF; }
.form-hint { font-size: 22rpx; color: #CCC; display: block; margin-top: 12rpx; }

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

.time-row { display: flex; gap: 20rpx; }
.time-col { flex: 1; }

.form-textarea { width: 100%; height: 160rpx; background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%); border-radius: 16rpx; padding: 20rpx 24rpx; font-size: 28rpx; color: #333; box-sizing: border-box; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); }

.sub-group { margin-top: 24rpx; padding-top: 24rpx; border-top: 1rpx solid rgba(0,0,0,0.05); }
.sess-head { display: flex; align-items: center; justify-content: space-between; }
.add-sess { padding: 8rpx 20rpx; border-radius: 24rpx; background: rgba(0,122,255,0.08); }
.add-sess-text { font-size: 24rpx; color: #007AFF; }

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

.sess-row { display: flex; align-items: center; gap: 12rpx; margin-top: 20rpx; flex-wrap: nowrap; }
.sess-input { flex: 1; height: 68rpx; background: rgba(0,0,0,0.04); border-radius: 14rpx; padding: 0 16rpx; font-size: 24rpx; color: #333; min-width: 0; box-sizing: border-box; box-shadow: none; }
.sess-quota { flex: 0.8; }
.sess-time { height: 68rpx; background: rgba(0,0,0,0.04); border-radius: 14rpx; padding: 0 14rpx; display: flex; align-items: center; }
.sess-time-text { font-size: 24rpx; color: #666; }
.sess-del { width: 48rpx; height: 48rpx; border-radius: 24rpx; background: rgba(255,107,107,0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sess-del-text { font-size: 22rpx; color: #FF6B6B; }

.notify-row { margin-top: 8rpx; }
.notify-text { font-size: 22rpx; color: #CCC; }

.btn-row { display: flex; gap: 16rpx; margin-top: 24rpx; }
.btn { flex: 1; height: 88rpx; display: flex; align-items: center; justify-content: center; border-radius: 44rpx; transition: all 0.2s; }
.btn:active { transform: scale(0.98); }
.btn-disabled { opacity: 0.4; }
.draft-btn { background: rgba(0,0,0,0.04); }
.draft-btn-text { font-size: 30rpx; color: #666; font-weight: 500; }
.publish-btn { background: #333; }
.publish-btn-text { font-size: 30rpx; color: #FFF; font-weight: 500; }

.toast { position: fixed; top: 200rpx; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.75); border-radius: 16rpx; padding: 16rpx 32rpx; z-index: 999; }
.toast-text { font-size: 28rpx; color: #FFF; }
</style>
