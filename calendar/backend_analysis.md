# 后端技术栈与云函数 / 数据库功能分析

## 1. 后端技术栈概览

- 平台：`uniCloud`，使用阿里云 `uniCloud-aliyun` 目录部署
- 运行时：Node.js 云函数（`exports.main` 入口）
- 数据库：`uniCloud.database()`，类似 MongoDB 的文档型数据库
- 用户认证：`uni-id` 用户系统（`uni-id-users`、`uni-id-token`）
- 微信登录：微信小程序 `jscode2session` 登录接口
- 消息推送：`uni-subscribemsg` 微信小程序订阅消息模板
- 第三方 API：`hitokoto.cn`、`tianapi.com`（AI 生成、新闻、历史上的今天）

## 2. 云函数列表与功能分析

### 2.1 `cloudfunctions/login`

主要职责：用户登录、注册、档案更新、当前用户查询

功能点：
- `wxLogin`
  - 使用微信 `code` 调用 `jscode2session` 获取 `openid` / `unionid`
  - 在 `uni-id-users` 中查找用户，未注册则创建新用户
  - 生成 SHA256 token 并存入 `uni-id-token`
  - 返回 `uid`、`token`、昵称、头像、生日等
- `phoneLogin`
  - 绑定手机号
  - 通过 `event.token` 更新 `uni-id-users` 中手机号字段
- `updateProfile`
  - 更新用户昵称、头像、生日
- `getCurrentUser`
  - 通过 `token` 查询当前用户数据
  - 无 token 返回游客身份

依赖与配置：
- `login/config.json` 中微信 `appid`、`appsecret`
- `uni-id.config.json` 中 `passwordSecret`、`tokenSecret` 等 `uni-id` 配置

### 2.2 `cloudfunctions/flashcards`

主要职责：记忆卡片（Flashcards）管理

功能点：
- `create`：创建卡片
- `list`：按用户查询卡片，可按 `status` 过滤
- `search`：本地关键词搜索卡片正反面内容
- `updateStatus`：切换卡片状态（`review` / `library`）
- `delete`：删除卡片

使用集合：`flashcards`
- 主要字段：`user_id`、`front`、`back`、`deck`、`status`、`createTime`

### 2.3 `cloudfunctions/get_daily_quote`

主要职责：获取当日金句/每日一句、历史事件、AI 文案，并缓存结果

功能点：
- 默认获取当日数据，支持 `date` 和 `forceRefresh`
- 从多接口并行请求数据：
  - `https://v1.hitokoto.cn/`
  - `https://apis.tianapi.com/ai/index`
  - `https://apis.tianapi.com/generalnews/index`
  - `https://apis.tianapi.com/lishi/index`
- 将首条结果写入 `daily_data` 缓存
- 手动配置数据（非 `api_cache`）会叠加在返回列表前端

使用集合：`daily_data`
- 主要字段：`date`、`quote`、`author`、`source`、`book_name`、`items`、`createTime`、`updateTime`

### 2.4 `cloudfunctions/groups`

主要职责：群组管理与群组事件日志

功能点：
- `create`：创建群组并生成 6 位邀请码
- `join`：通过邀请码加入群
- `myGroups`：查询用户加入的群组列表
- `detail`：获取群组详情，含成员档案名、备注、生日
- `setRemark`：设置群内备注（群主可改他人，成员仅可改自己）
- `events`：查询群动态事件流
- `leave`：群成员退出群组（群主不能直接退出）
- `disband`：群主解散群组，级联删除群组相关 `schedules`、`signups`、`group_events`

使用集合：
- `groups`
  - 主要字段：`group_name`、`creator_id`、`invite_code`、`members`、`description`、`createTime`
- `group_events`
  - 事件类型：`member_joined`、`member_left`、`schedule_created`、`schedule_updated`、`schedule_deleted`、`signup_published`、`signup_added`、`signup_cancelled`、`schedule_starting`、`birthday_notify`

### 2.5 `cloudfunctions/schedules`

主要职责：日程与活动管理、报名、提醒、群内协作

功能点：
- 日程创建/更新/删除
- 个人日程与群日程的查询
- 群组报名活动发布（`publishSignup`）
- 报名草稿管理：保存、列表、删除
- 订阅消息授权状态管理
- 报名操作：报名、取消报名、名额校验、场次校验、表单校验
- 日程详情：解析问卷、预填数据、我的报名状态
- 获取生日日程
- 日程历史日志 `schedule_history`

支持字段与业务：
- `scope`：`private` 或 `group`
- `signup_enabled`：是否支持报名
- `signup_quota` / `signup_closed`：总名额与自动关闭
- `sessions`：场次配置与名额
- `signup_form` / `signup_fields`：自定义报名问卷
- `reminders` / `next_remind_at`：日程提醒与下一次触发时间
- `member_name`：提醒标题名 / 生日对象
- `description`

关键逻辑：
- `computeNextRemindAt`：计算下一次提醒时间戳
- `createScheduleDoc`：统一构建日程文档
- `resolveSignupForm`：兼容旧、新报名表单结构
- `attachSignupCounts` / `attachMyStatus`：附加报名统计和当前用户报名状态
- `sendPublishNotify` / `sendSignupNotify`：发布报名与报名成功模板消息
- `logHistory` / `logEvent`：变化追踪与群事件记录

使用集合：
- `schedules`
- `schedule_history`
- `signups`
- `signup_drafts`
- 还关联 `groups`、`group_events`、`uni-id-users`

### 2.6 `cloudfunctions/schedule_notify`

主要职责：日程提醒与生日通知

功能点：
- 定时检查 `schedules.next_remind_at` 并发送微信群/个人提醒
- 支持生日通知（按用户 `birthday` 字段匹配当天生日）
- 兼容旧数据，补写缺失 `next_remind_at`
- 发送订阅消息模板：`SCHEDULE_NOTIFY_TMPL`、`BIRTHDAY_NOTIFY_TMPL`
- 记录生日通知事件，避免重复发送

提醒对象：
- 私有日程：日程创建者
- 群日程：已报名用户（报名活动）或群组成员（无报名活动）

使用集合：
- `schedules`
- `groups`
- `group_events`
- `uni-id-users`

### 2.7 `cloudfunctions/toggle_favorite`

主要职责：用户收藏管理

功能点：
- `list`：查询用户所有收藏
- `getMarks`：返回收藏日期与个人日程日期，用于日历标记
- `check`：检查某内容是否已收藏
- `add`：添加收藏项
- `remove`：取消收藏

使用集合：`user_favorites`
- 主要字段：`user_id`、`date`、`content`、`author`、`source`、`createTime`

## 3. 数据库集合与功能映射

| 集合 | 功能归属 | 说明 |
|---|---|---|
| `uni-id-users` | 用户身份 / 个人档案 | 微信用户档案、头像、昵称、手机号、生日、订阅模板、群组关系 |
| `uni-id-token` | 登录令牌 | 存储用户 token，登录验证使用 |
| `flashcards` | 记忆卡片管理 | 用户记忆卡正反面内容、分类、状态 |
| `daily_data` | 每日金句缓存 | 金句/每日一句/历史上的今天/AI 文案缓存 |
| `groups` | 群组协作 | 群信息、邀请码、成员列表、备注、描述 |
| `group_events` | 群活动日志 | 群内成员、日程、报名、提醒等事件历史 |
| `schedules` | 日程活动 | 私人日程、群活动、报名配置、提醒配置、状态追踪 |
| `schedule_history` | 日程变更历史 | 记录日程创建/更新/删除前后数据 |
| `signups` | 报名记录 | 群活动报名、表单数据、状态、时间戳 |
| `signup_drafts` | 报名草稿 | 保存用户未发布的活动草稿 |
| `user_favorites` | 收藏 | 用户收藏内容、日期、来源 |

## 4. 关键后端逻辑关系

- `login` 提供身份与 token，其他云函数依赖 `user_id` / token 进行权限判断
- `groups` 构建群组关系，`schedules` 依赖群成员校验、`group_events` 记录动态
- `schedules` 负责日程与报名生命周期，`schedule_notify` 负责到点提醒与生日通知
- `daily_data` 作为 `get_daily_quote` 的缓存层，避免频繁触发外部 API
- `user_favorites` 与 `schedules`、`daily_data` 共同支撑用户收藏与日历高亮

## 5. 结论

当前后端架构为典型 `uniCloud` 云函数模式：

- 单入口 `exports.main` 由 `event.action` 驱动接口路由
- 数据层使用文档型数据库集合映射业务实体
- 通过 `uni-id` 与 `uni-subscribemsg` 集成微信登录与订阅消息
- 具备群组协作、活动报名、日程提醒、每日金句、记忆卡片、收藏等多个业务子系统

该分析文件已生成为 `backend_analysis.md`。