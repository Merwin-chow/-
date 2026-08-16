<template>
	<view class="container">
		<!-- 群信息 -->
		<view class="card">
			<view class="group-header">
				<view class="group-icon">
					<text class="icon-text">{{ group.group_name?.charAt(0) || '群' }}</text>
				</view>
				<view class="group-info">
					<text class="group-name">{{ group.group_name }}</text>
					<text class="group-desc">{{ group.description || '暂无描述' }}</text>
				</view>
			</view>
			<view class="invite-row" @click="copyInviteCode">
				<text class="invite-label">邀请码</text>
				<text class="invite-code">{{ group.invite_code }}</text>
				<text class="invite-tip">点击复制</text>
			</view>
		</view>

		<!-- 创建入口 -->
		<view class="create-entry-row">
			<view class="create-entry create-primary" @click="startSignup">
				<text class="create-entry-text">＋ 发起报名</text>
			</view>
			<view class="create-entry create-plain" @click="createInGroup">
				<text class="create-entry-text">＋ 创建日程</text>
			</view>
		</view>

		<!-- 成员列表 -->
		<view class="card">
			<text class="card-title">成员（{{ members.length }}）</text>
			<view class="my-remark-row" v-if="myMember">
				<view class="member-avatar">
					<text class="member-avatar-text">{{ (myMember.group_remark || myMember.profile_name || '成').charAt(0) }}</text>
				</view>
				<view class="member-main">
					<text class="member-name">我的群内名称</text>
					<text class="member-profile" v-if="myMember.group_remark && myMember.group_remark !== myMember.profile_name">档案名：{{ myMember.profile_name }}</text>
				</view>
				<view class="remark-edit" @click="openRemarkModal(myMember)">
					<text class="remark-edit-text">修改</text>
				</view>
			</view>
			<view class="member-item" v-for="m in members" :key="m.user_id">
				<view class="member-avatar">
					<text class="member-avatar-text">{{ (m.group_remark || m.profile_name || '成').charAt(0) }}</text>
				</view>
				<view class="member-main">
					<view class="member-name-row">
						<text class="member-name">{{ m.group_remark || m.profile_name || '成员' }}</text>
						<text class="member-role" v-if="m.role === 'owner'">群主</text>
					</view>
					<text class="member-profile" v-if="m.group_remark && m.group_remark !== m.profile_name">档案：{{ m.profile_name }}</text>
					<text class="member-birthday" v-if="m.birthday">{{ birthdayLabel(m.birthday) }}</text>
					<text class="member-birthday member-birthday-empty" v-else>未填生日</text>
				</view>
				<view class="remark-edit" v-if="canEditRemark(m)" @click="openRemarkModal(m)">
					<text class="remark-edit-text">备注</text>
				</view>
			</view>
		</view>

		<!-- 群日程 -->
		<view class="card">
			<text class="card-title">群日程（{{ schedules.length }}）</text>
			<view v-if="schedules.length === 0" class="empty-inline">
				<text class="empty-inline-text">暂无日程，点击上方创建</text>
			</view>
			<view class="sched-item" v-for="s in schedules" :key="s._id" @click="openSchedule(s._id)">
				<view class="sched-date">
					<text class="sched-day">{{ s.date?.slice(8) }}</text>
					<text class="sched-month">{{ s.date?.slice(5, 7) }}月</text>
				</view>
				<view class="sched-body">
					<text class="sched-title">{{ s.title }}</text>
					<text class="sched-meta">{{ s.start_time || '全天' }} · {{ typeLabel(s.type) }}</text>
				</view>
				<view class="sched-right">
					<text class="sched-signup" v-if="s.signup_enabled">{{ s.signup_count || 0 }}人报名</text>
					<view class="status-tag" :class="'tag-' + s.schedule_status">
						<text class="status-tag-text">{{ s.status_label }}</text>
					</view>
				</view>
			</view>
		</view>

		<!-- 群动态 -->
		<view class="card">
			<text class="card-title">群动态</text>
			<view v-if="events.length === 0" class="empty-inline">
				<text class="empty-inline-text">暂无动态</text>
			</view>
			<view class="event-item" v-for="(ev, i) in events" :key="i">
				<view class="event-dot" :class="'ev-' + ev.type"></view>
				<view class="event-main">
					<text class="event-text">{{ eventText(ev) }}</text>
					<text class="event-time">{{ formatTime(ev.createTime) }}</text>
				</view>
			</view>
		</view>

		<!-- 群操作 -->
		<view class="group-actions">
			<view class="danger-btn" v-if="myRole !== 'owner'" @click="leaveGroup">
				<text class="danger-text">退出群组</text>
			</view>
			<view class="danger-btn" v-if="myRole === 'owner'" @click="disbandGroup">
				<text class="danger-text">解散群组</text>
			</view>
		</view>

		<!-- 备注编辑弹窗 -->
		<view class="modal-mask" v-if="showRemarkModal" @click="showRemarkModal = false">
			<view class="modal-body" @click.stop>
				<text class="modal-title">设置群内备注</text>
				<text class="modal-sub">{{ remarkTarget?.profile_name || '成员' }} 在群内的称呼</text>
				<input class="modal-input" v-model="remarkValue" placeholder="输入备注" />
				<view class="modal-actions">
					<view class="modal-btn" @click="saveRemark">
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
import { ref, computed, onMounted } from 'vue'
import { getUid } from '@/utils/auth.js'
import { callApi } from '@/utils/cloud.js'

const groupId = ref('')
const group = ref({})
const members = ref([])
const schedules = ref([])
const events = ref([])
const myUid = ref('')
const myRole = ref('')
const myMember = computed(() => members.value.find(m => m.user_id === myUid.value) || null)
const showRemarkModal = ref(false)
const remarkTarget = ref(null)
const remarkValue = ref('')
const toastMsg = ref('')

const showToast = (msg) => {
	toastMsg.value = msg
	setTimeout(() => { toastMsg.value = '' }, 2000)
}

const typeLabel = (t) => {
	const m = { birthday: '生日', event: '活动', meeting: '会议', other: '其他' }
	return m[t] || '其他'
}

const birthdayLabel = (b) => {
	if (!b) return ''
	const p = String(b)
	const mm = p.slice(5, 7).replace(/^0/, '')
	const dd = p.slice(8, 10).replace(/^0/, '')
	return `生日 ${mm}月${dd}日`
}

const canEditRemark = (m) => {
	if (m.user_id === myUid.value) return true
	return myRole.value === 'owner'
}

const openRemarkModal = (m) => {
	remarkTarget.value = m
	remarkValue.value = m.group_remark || m.profile_name || ''
	showRemarkModal.value = true
}

const saveRemark = async () => {
	if (!remarkValue.value.trim()) {
		showToast('备注不能为空')
		return
	}
	try {
		const res = await callApi('groups', 'setRemark', {
			user_id: myUid.value,
			group_id: groupId.value,
			target_user_id: remarkTarget.value.user_id,
			group_remark: remarkValue.value.trim()
		}).catch(e => {
			console.error('setRemark fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			showRemarkModal.value = false
			showToast('备注已更新')
			loadDetail()
		} else {
			showToast(res?.result?.message || '保存失败')
		}
	} catch (e) {
		console.error('setRemark fail:', e)
	}
}

const copyInviteCode = () => {
	uni.setClipboardData({
		data: group.value.invite_code || '',
		success: () => { showToast('已复制邀请码') }
	})
}

const createInGroup = () => {
	uni.navigateTo({ url: '/pages/create-schedule/create-schedule?group_id=' + groupId.value })
}

const startSignup = () => {
	uni.navigateTo({ url: '/pages/signup-create/signup-create?group_id=' + groupId.value })
}

const openSchedule = (sid) => {
	uni.navigateTo({ url: '/pages/schedule-detail/schedule-detail?schedule_id=' + sid })
}

const eventText = (ev) => {
	const actor = ev.actor_name || '成员'
	const t = ev.data?.title || ''
	switch (ev.type) {
		case 'member_joined': return `${actor} 加入了群组`
		case 'member_left': return `${actor} 退出了群组`
		case 'schedule_created': return `${actor} 创建了日程「${t}」`
		case 'schedule_updated': return `${actor} 修改了日程「${t}」`
		case 'schedule_deleted': return `${actor} 删除了日程「${t}」`
		case 'signup_added': return ev.data?.name ? `${actor}（${ev.data.name}）报名了日程「${t}」` : `${actor} 报名了日程「${t}」`
		case 'signup_cancelled': return ev.data?.name ? `${actor}（${ev.data.name}）取消了日程「${t}」的报名` : `${actor} 取消了日程「${t}」的报名`
		case 'schedule_starting': return `日程「${t}」即将开始（${ev.data?.date || ''} ${ev.data?.start_time || ''}）`
		case 'signup_published': return `${actor} 发起了报名「${t}」，快去报名吧`
		default: return `${actor} ${ev.type}`
	}
}

const formatTime = (ts) => {
	if (!ts) return ''
	const d = new Date(ts)
	const p = (n) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const loadDetail = async () => {
	try {
		const uid = getUid()
		const res = await callApi('groups', 'detail', { user_id: uid, group_id: groupId.value }).catch(e => {
			console.error('group detail fail:', e)
			return { result: null }
		})
		if (res?.result && res.result.code === 200) {
			group.value = res.result.data
			members.value = res.result.data.members || []
			const me = members.value.find(m => m.user_id === uid)
			myRole.value = me ? me.role : ''
			await loadSchedules(uid)
			await loadEvents(uid)
		} else {
			showToast(res?.result?.message || '群组不存在')
		}
	} catch (e) {
		console.error('load group detail fail:', e)
	}
}

const loadSchedules = async (uid) => {
	const res = await callApi('schedules', 'getGroupSchedules', { user_id: uid, group_id: groupId.value }).catch(() => ({ result: null }))
	if (res?.result?.code === 200) {
		schedules.value = res.result.data || []
	}
}

const loadEvents = async (uid) => {
	const res = await callApi('groups', 'events', { user_id: uid, group_id: groupId.value }).catch(() => ({ result: null }))
	if (res?.result?.code === 200) {
		events.value = res.result.data || []
	}
}

const leaveGroup = () => {
	uni.showModal({
		title: '退出群组', content: '确定退出该群组？',
		success: async (res) => {
			if (!res.confirm) return
			await callApi('groups', 'leave', { user_id: myUid.value, group_id: groupId.value }).catch(e => console.error('leave group fail:', e))
			showToast('已退出')
			setTimeout(() => { uni.navigateBack() }, 800)
		}
	})
}

const disbandGroup = () => {
	uni.showModal({
		title: '解散群组', content: '确定解散该群组？群日程和动态将一并删除',
		success: async (res) => {
			if (!res.confirm) return
			await callApi('groups', 'disband', { user_id: myUid.value, group_id: groupId.value }).catch(e => console.error('disband group fail:', e))
			showToast('已解散')
			setTimeout(() => { uni.navigateBack() }, 800)
		}
	})
}

onMounted(() => {
	const pages = getCurrentPages()
	const page = pages[pages.length - 1]
	const options = page?.options || {}
	groupId.value = options.group_id || ''
	if (groupId.value) {
		loadDetail()
	} else {
		showToast('缺少参数')
	}
})
</script>

<style>
page { background-color: #F0F1F5; }
.container { padding: 30rpx; padding-bottom: 140rpx; }

.card { background: linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(248,249,253,0.88) 100%); border-radius: 24rpx; padding: 32rpx; margin-bottom: 24rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); }
.card-title { font-size: 26rpx; color: #999; font-weight: 600; display: block; margin-bottom: 20rpx; }

.group-header { display: flex; align-items: center; gap: 20rpx; margin-bottom: 24rpx; }
.group-icon { width: 88rpx; height: 88rpx; border-radius: 44rpx; background: #333; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.icon-text { font-size: 36rpx; color: #FFF; font-weight: 500; }
.group-info { flex: 1; }
.group-name { font-size: 34rpx; font-weight: bold; color: #333; display: block; }
.group-desc { font-size: 24rpx; color: #999; display: block; margin-top: 6rpx; }
.invite-row { display: flex; align-items: center; gap: 12rpx; background: rgba(0,0,0,0.03); border-radius: 12rpx; padding: 16rpx 20rpx; }
.invite-label { font-size: 24rpx; color: #999; }
.invite-code { flex: 1; font-size: 28rpx; color: #333; font-weight: bold; letter-spacing: 2rpx; }
.invite-tip { font-size: 22rpx; color: #CCC; }

.create-entry { height: 88rpx; flex: 1; display: flex; align-items: center; justify-content: center; border-radius: 44rpx; }
.create-entry:active { opacity: 0.8; }
.create-entry-row { display: flex; gap: 16rpx; margin-bottom: 24rpx; }
.create-primary { background: #333; }
.create-plain { background: rgba(0,0,0,0.05); }
.create-plain .create-entry-text { color: #333; }
.create-entry-text { font-size: 28rpx; color: #FFF; font-weight: 500; }

.member-item { display: flex; align-items: center; gap: 14rpx; padding: 14rpx 0; border-bottom: 1rpx solid rgba(0,0,0,0.04); }
.my-remark-row { display: flex; align-items: center; gap: 14rpx; padding: 16rpx 0; margin-bottom: 8rpx; border-bottom: 2rpx solid rgba(0,0,0,0.08); }
.member-avatar { width: 60rpx; height: 60rpx; border-radius: 30rpx; background: #E5E5EA; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.member-avatar-text { font-size: 26rpx; color: #666; }
.member-main { flex: 1; }
.member-name-row { display: flex; align-items: center; gap: 10rpx; }
.member-name { font-size: 28rpx; color: #333; }
.member-role { font-size: 20rpx; color: #999; padding: 2rpx 10rpx; background: rgba(0,0,0,0.04); border-radius: 8rpx; }
.member-profile { font-size: 22rpx; color: #CCC; display: block; margin-top: 4rpx; }
.member-birthday { font-size: 22rpx; color: #FF8A65; display: block; margin-top: 4rpx; }
.member-birthday-empty { color: #DDD; }
.remark-edit { padding: 8rpx 16rpx; background: rgba(0,122,255,0.08); border-radius: 24rpx; }
.remark-edit-text { font-size: 22rpx; color: #007AFF; }

.empty-inline { padding: 20rpx 0; }
.empty-inline-text { font-size: 26rpx; color: #CCC; }

.sched-item { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 0; border-bottom: 1rpx solid rgba(0,0,0,0.04); }
.sched-date { width: 64rpx; text-align: center; flex-shrink: 0; }
.sched-day { font-size: 30rpx; font-weight: bold; color: #333; display: block; }
.sched-month { font-size: 20rpx; color: #999; display: block; }
.sched-body { flex: 1; }
.sched-title { font-size: 28rpx; color: #333; display: block; }
.sched-meta { font-size: 22rpx; color: #999; display: block; margin-top: 4rpx; }
.sched-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6rpx; }
.sched-signup { font-size: 22rpx; color: #007AFF; }
.status-tag { padding: 4rpx 12rpx; border-radius: 8rpx; }
.status-tag-text { font-size: 20rpx; }
.tag-not_started { background: rgba(255,193,7,0.1); }
.tag-not_started .status-tag-text { color: #FFC107; }
.tag-in_progress { background: rgba(76,175,80,0.1); }
.tag-in_progress .status-tag-text { color: #4CAF50; }
.tag-ended { background: rgba(0,0,0,0.04); }
.tag-ended .status-tag-text { color: #999; }

.event-item { display: flex; gap: 14rpx; padding: 12rpx 0; }
.event-dot { width: 14rpx; height: 14rpx; border-radius: 50%; margin-top: 8rpx; flex-shrink: 0; }
.ev-member_joined { background: #4CAF50; }
.ev-member_left { background: #999; }
.ev-schedule_created { background: #007AFF; }
.ev-schedule_updated { background: #FFC107; }
.ev-schedule_deleted { background: #FF6B6B; }
.ev-signup_added { background: #4CAF50; }
.ev-signup_cancelled { background: #FF8A65; }
.ev-schedule_starting { background: #FF6B6B; }
.ev-signup_published { background: #7C4DFF; }
.event-main { flex: 1; }
.event-text { font-size: 26rpx; color: #333; line-height: 1.5; display: block; }
.event-time { font-size: 22rpx; color: #CCC; display: block; margin-top: 4rpx; }

.group-actions { display: flex; gap: 16rpx; margin-bottom: 24rpx; }
.danger-btn { flex: 1; height: 84rpx; display: flex; align-items: center; justify-content: center; border: 2rpx solid #FF6B6B; border-radius: 42rpx; }
.danger-btn:active { opacity: 0.6; }
.danger-text { font-size: 28rpx; color: #FF6B6B; }

.modal-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
.modal-body { width: 80%; background: #FFF; border-radius: 24rpx; padding: 40rpx; }
.modal-title { font-size: 32rpx; font-weight: bold; color: #333; display: block; margin-bottom: 12rpx; }
.modal-sub { font-size: 24rpx; color: #999; display: block; margin-bottom: 20rpx; }
.modal-input { width: 100%; height: 80rpx; border: 2rpx solid #E5E5EA; border-radius: 12rpx; padding: 0 20rpx; font-size: 28rpx; box-sizing: border-box; }
.modal-actions { display: flex; gap: 16rpx; margin-top: 20rpx; }
.modal-btn { flex: 1; height: 72rpx; display: flex; align-items: center; justify-content: center; background: #333; border-radius: 36rpx; }
.modal-btn:active { opacity: 0.8; }
.modal-btn-text { font-size: 28rpx; color: #FFF; }

.toast { position: fixed; top: 200rpx; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.75); border-radius: 16rpx; padding: 16rpx 32rpx; z-index: 999; }
.toast-text { font-size: 28rpx; color: #FFF; }
</style>
