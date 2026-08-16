# 存量数据迁移（Phase 7）

> 背景：旧版本身份体系混乱——前端 `getUserId()` 优先用 `uni_id_token`（SHA256 哈希）当作用户 id，
> 云函数也把这个 token 当作 `user_id` 写入集合，导致集合中的 `user_id` 字段实际存的是 **token 哈希**，
> 而非真实用户 id（`uni-id-users._id`）。
>
> Phase 1/2 已把身份统一为「前端 `getUid()` + 云函数 `resolveUid(event.token)` 解析真实 uid」，
> 并约定日程归属字段为 `owner_id`（`schedules.owner_id = 解析后的 uid`）。
> 因此需对存量文档做字段修正与映射回填。

## 需迁移的集合与字段

| 集合 | 现状（旧） | 迁移后（新） |
|---|---|---|
| `schedules` | 用 `user_id` 存 token 哈希，无 `owner_id` | 新增 `owner_id` = 真实 uid；删除/保留 `user_id`（建议删） |
| `schedule_history` | `changed_by` 存 token 哈希 | 回写为真实 uid（可选） |
| `signups` | `user_id` 存 token 哈希 | 回写为真实 uid |
| `signup_drafts` | `user_id` 存 token 哈希 | 回写为真实 uid |
| `user_favorites` | `user_id` 存 token 哈希 | 回写为真实 uid |
| `groups.members[].user_id` / `groups.creator_id` | token 哈希 | 回写为真实 uid |
| `flashcards` | `user_id` 存 token 哈希 | 回写为真实 uid |

> 判断标准：`uni-id-token.token === 集合里的 user_id` 的可判定为旧 token；不可判别的（已是真实 uid、或游客 id `visitor_*`）跳过。

## 运行方式

**方式 A（推荐，云函数一次性执行）**：将本目录 `migrate_identity.js` 临时注册为一个云函数
（如 `cloudfunctions/migrate_identity/index.js`），在 uniCloud 控制台以定时触发或手动调用执行，
执行完成后删除该云函数。

**方式 B（uniCloud CLI / 本地脚本）**：若使用 `unicloud` 前端 v3 或 CLI，可借助 `uniCloud.database()`
在本地 Node 环境跑（需要服务空间密钥）。

> ⚠️ 迁移前请先备份：`uniCloud` 控制台 → 数据库 → 各集合 → 导出全部数据。
> 迁移脚本带**幂等**设计（按 `content_hash`/`_id` 判定，可重复执行）。

## 迁移后收尾

1. 确认无残留：再次 grep 代码中不再信任 `event.user_id` / `event.owner_id` 直传（已在 Phase 2 完成）。
2. 可执行 `schedules` 上 `signup_count` 回填（按 `signups(signed)` 重算），见 `recomputeSignupState`。
3. 索引（控制台操作）：为 `schedules.owner_id`、`user_favorites.content_hash`、`groups.invite_code`
   建立唯一/普通索引后，再执行下一轮并发测试（T-501~T-506）。
