# 生产 Migration 收口报告

日期：2026-08-19

最终结论：生产 migration 写入部分完成。

本次只执行生产 migration、补齐基础对象、schema cache 刷新和 localhost 数据清理；真实角色验收未做，本地测试未做，Vercel 未验证。

## 1. 生产连接

- 实际通道：Supabase Management API，`POST /v1/projects/gcrhhxaopomtposmahsw/database/query`。
- 认证来源：macOS Keychain 中 Supabase CLI 登录凭据，由 `/tmp/dydata_readonly_audit.sh` 读取。
- 数据库密码、CLI token 未写入报告、快照或迁移文件。
- `select 1` 连通性：通过。
- `psql` pooler：失败，DNS 返回 `tenant/user postgres.gcrhhxaopomtposmahsw not found`。
- `supabase migration list/repair --linked`：卡在 `Initialising login role...`；最终台账用 Management API 查询 `supabase_migrations.schema_migrations` 复核。

## 2. 已写入生产清单

### 仅记账、未重放原 SQL

- `20260805120000`：补记既有 permission v2 对象。
- `20260807103000`：补记生产更新版权限/履约对象；未覆盖生产新版 `get_fulfillment_range`。
- `20260818000000`：补记既有豁免申请 INSERT 策略。
- `20260718103000`：补记截图私有化；bucket 已为 private，公开 Storage URL 为 0。
- `20260806090000`：补记生产更新版履约函数；未覆盖 `get_fulfillment_range`。

### 补齐 migration

- `20260819130100`：owner=`all` 的 `get_data_scope`、`visible_user_ids`，新增 archived-aware `active_visible_user_ids`。
- `20260819130200`：三个豁免 RPC 切换到 `active_visible_user_ids`，保留生产函数主体。
- `20260819130300`：管理员统计和当前队列排除 archived 成员。
- `20260819130400`：`violation_cases` 三个字段、source video 唯一索引、`vc_select`/`vc_insert` 策略。
- `20260819130500`：豁免授予 request 唯一索引、profile 豁免投影保护函数和触发器。
- `20260819130600`：`teams.is_demo` 字段；深圳二部保留且值为 `false`。
- `20260819130700`：恢复缺失的 `knowledge_cases` 完整基础表、4 个索引、4 条策略、RLS 和 ACL；初始行数 0。
- `20260819130800`：恢复反馈回复基础对象：`content_feedback_cards` 的主键、4 个员工回复字段、状态约束，以及 `feedback_card_replies` 表、索引、RLS 和策略。

### 原始剩余 migration

- `20260716171000`：执行并记账 `knowledge_cases_insert`，增加 `status='submitted'` 校验。
- `20260718104500`：执行并记账 `submit_feedback_card_reply`，ACL 仅 service_role。
- `20260718111500`：执行并记账 `replace_daily_report_usage_record`，ACL 仅 service_role。
- `20260728120000`：执行并记账 `update_collaboration_attribution`，日报和当天 active 视频在同一事务更新，ACL 仅 service_role。
- `20260819120000`：执行并记账 company_role/group mode 权限模型。

## 3. 关键验证

### knowledge_cases

- 28 个字段存在。
- 11 个约束存在，包括主键、外键、legacy source 唯一约束、状态 CHECK、usage_count CHECK。
- 4 个索引存在。
- 4 条 RLS 策略存在。
- RLS 已启用。
- authenticated/service_role ACL 已授予。
- 数据行数：0。

### company_role 回填

执行前 role/data_scope：

- owner/all：1
- admin/all：18
- admin/team：1
- member/self：55，其中 active 50、archived 5

执行后 `company_role`：

- `company_owner`：1
- `admin`：19
- `member`：55

结果与要求完全一致。`group_permission_qualifications` 已创建但为空，行数为 0；`group_mode_sessions` 已创建但无预置数据。

### localhost 清理

清理前：数组地址 2 个、curve 1 个、retention 1 个，受影响行 1 行。

清理后：数组地址 0 个、curve 0 个、retention 0 个。

## 4. 快照路径

- `docs/plans/权限/2026-08-19-对账-20260805120000-前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260807103000-前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260818000000-前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260718103000-前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260806090000-前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260819110000-补齐前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260818100000-补齐前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260819100000-补齐前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260716180000-补齐前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260718113000-补齐前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260718110000-补齐前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260819130700-knowledge_cases-前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260716171000-前快照-补表后.json`
- `docs/plans/权限/2026-08-19-对账-20260819130800-feedback-reply-前快照.json`
- `docs/plans/权限/2026-08-19-对账-20260718111500-前快照-恢复后.json`
- `docs/plans/权限/2026-08-19-对账-20260728120000-前快照-恢复后.json`
- `docs/plans/权限/2026-08-19-对账-20260819120000-前快照-重建.json`
- `docs/plans/权限/2026-08-19-对账-20260819120000-后快照.json`
- `docs/plans/权限/2026-08-19-对账-localhost-清理前快照.json`

## 5. 回滚 SQL

每一步均已生成独立文件：

- `docs/plans/权限/2026-08-19-回滚-台账-only.sql`
- `docs/plans/权限/2026-08-19-回滚-20260819130100.sql`
- `docs/plans/权限/2026-08-19-回滚-20260819130200.sql`
- `docs/plans/权限/2026-08-19-回滚-20260819130300.sql`
- `docs/plans/权限/2026-08-19-回滚-20260819130400.sql`
- `docs/plans/权限/2026-08-19-回滚-20260819130500.sql`
- `docs/plans/权限/2026-08-19-回滚-20260819130600.sql`
- `docs/plans/权限/2026-08-19-回滚-20260819130700.sql`
- `docs/plans/权限/2026-08-19-回滚-20260716171000.sql`
- `docs/plans/权限/2026-08-19-回滚-20260819130800.sql`
- `docs/plans/权限/2026-08-19-回滚-20260718104500.sql`
- `docs/plans/权限/2026-08-19-回滚-20260718111500.sql`
- `docs/plans/权限/2026-08-19-回滚-20260728120000.sql`
- `docs/plans/权限/2026-08-19-回滚-20260819120000.sql`
- `docs/plans/权限/2026-08-19-回滚-localhost-清理.sql`

所有生产写入后均执行了 `select pg_notify('pgrst','reload schema')`。

## 6. 最终 migration 状态

Management API 复核：history 共 `138` 行，最新版本 `20260819130800`。

本批目标及补齐版本全部已记账：

`20260716171000`、`20260716180000`、`20260718103000`、`20260718104500`、`20260718110000`、`20260718111500`、`20260718113000`、`20260728120000`、`20260805120000`、`20260806090000`、`20260807103000`、`20260818000000`、`20260818100000`、`20260819100000`、`20260819110000`、`20260819120000`、`20260819130100`、`20260819130200`、`20260819130300`、`20260819130400`、`20260819130500`、`20260819130600`、`20260819130700`、`20260819130800`。

## 7. 未做事项

- 真实角色验收：未做。
- 本地测试与构建：未做。
- Vercel 检查：未验证。
- 未提交、未推送。

本次结论：生产 migration 写入部分完成；真实角色验收、本地测试与 Vercel 验证留待下一批。
