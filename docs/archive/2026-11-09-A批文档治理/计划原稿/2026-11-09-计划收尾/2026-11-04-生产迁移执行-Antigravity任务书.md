# 生产迁移执行 · Antigravity 任务书（2026-11-04）

> 任务：把 AI 渠道治理的数据库迁移应用到**生产 Supabase 库**。只做迁移，不发布应用、不改业务代码、不动其他表。
> 分工备注：数据库操作常规归 Codex，本单由阿禅直接指派 Antigravity 执行；照本规格逐步走，任何一步与预期不符立即停止上报，禁止自行变通。

## 执行纪律

- 不理解就停下来问；不优化流程、不加步骤、不改迁移文件内容。
- 全程禁止：打印/粘贴/落盘任何连接串、密码、API Key；禁止 push、禁止触发部署、禁止改环境变量。
- 每一步的判定标准写死在本单里；任何一步判定失败 → 停止，保留现场证据，报告 CC。

## 文件与凭据清单

| 项 | 位置 | 用法 |
|---|---|---|
| 迁移文件 | `supabase/migrations/20261104120000_ai_channel_availability_governance.sql`（分支 `codex/ai-availability-governance` 工作区版本，含 2026-11-04 晚的交换函数修订） | 只执行此版本，不得改写 |
| 生产库连接 | `.env.local` 中 `SUPABASE_DB_URL`（直接读环境变量使用，不回显） | psql 直连 |
| 证据目录 | `~/.local/share/dydata/review/2026-11-04-生产迁移/`（仓库外） | 所有快照与核对结果 |

## 第 0 步：前置核对（全部只读）

1. 确认生产当前运行的是旧代码：`https://dydata.cc/api/health` 返回 200，且 Vercel 当前生产部署对应提交为 `9e1d1f84`（用 Vercel API 或页面表现核对；核对方式受限时记录「以 CC 已验证事实为准」）。
2. 确认目标库是生产 Supabase（非本地 127.0.0.1、非 CloudBase）：`SUPABASE_DB_URL` 主机名不含 `127.0.0.1`/`localhost`。
3. 只读快照迁移前状态，存证据目录 `before-snapshot.json`：
   ```sql
   select m.id, m.model_id, m.key_id, k.priority + p.priority as legacy_score, k.id as key_id_order, m.id as m_id_order
   from public.ai_provider_key_models m
   join public.ai_provider_keys k on k.id = m.key_id
   join public.ai_providers p on p.id = k.provider_id
   order by m.model_id, legacy_score, k.id, m.id;
   ```
   同时快照 `ai_provider_keys`、`ai_providers` 的行数与主键集合。
4. 确认迁移前置结构在位（生产 10-05 已执行过健康字段迁移）：
   ```sql
   select column_name from information_schema.columns
   where table_schema='public' and table_name='ai_provider_key_models'
   and column_name in ('consecutive_failures','unhealthy_until','last_failure_at','last_success_at','last_error_message','last_failure_scope','global_is_enabled');
   ```
   应返回 7 行。缺任一列 → 停止上报。

## 第 1 步：执行迁移（单事务）

```bash
PGPASSWORD=... psql "<SUPABASE_DB_URL>" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261104120000_ai_channel_availability_governance.sql
```

- 文件自带 begin/commit；任何语句失败整体回滚，生产保持原状。
- 预期耗时秒级（约 119 行模型记录）。
- 若报「AI channel order migration changed existing ordering」→ 说明初始化与线上顺序不一致，迁移已自动回滚：停止，把报错原文与 before-snapshot 交 CC，禁止绕过校验。

## 第 2 步：迁移后核对（全部只读，结果存 `after-checks.json`）

1. **新列在位**：
   - `ai_provider_keys`：`first_failure_at`、`invalidated_at`、`manual_sleep_until`
   - `ai_provider_key_models`：`first_failure_at`、`invalidated_at`、`sort_order`（且 `sort_order` 为 NOT NULL）
2. **顺位初始化 diff=0**：用第 0 步同一条查询重算 legacy 顺序，与 `select id, model_id, sort_order from ai_provider_key_models` 逐模型比较——每个模型内第 N 小的 `sort_order` 必须对应 legacy 顺序第 N 位。任何一条不符 → 记录并停止上报（此时迁移已提交，等 CC 处置，禁止自行修数）。
3. **约束与触发器**：
   ```sql
   select conname from pg_constraint where conname='ai_provider_key_models_model_order_unique';
   select tgname from pg_trigger where tgname in ('assign_ai_channel_sort_order','reset_ai_key_failure_window_on_success','reset_ai_model_failure_window_on_success');
   ```
   应各返回 1/3 行。
4. **函数与权限**：
   ```sql
   select p.proname, pg_get_userbyid(d.grantor) as grantor, d.grantee::regrole::text
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   left join pg_default_acl d on true
   where n.nspname='public' and p.proname in ('swap_provider_key_model_order','bump_provider_key_failure','bump_provider_key_model_failure');
   ```
   三函数存在；再用 `\df+` 或 `has_function_privilege` 确认 `anon`/`authenticated` 无 execute、`service_role` 有 execute。
5. **业务行数不变**：`ai_providers`、`ai_provider_keys`、`ai_provider_key_models`、`ai_feature_bindings` 行数与第 0 步快照一致（迁移只加列/换函数，不增删行）。
6. **旧代码无感**：生产 `GET /api/admin/ai-config`（用现有登录态）仍 200 且渠道列表正常；`/api/health` 正常。旧代码不读新列，此步只是兜底确认。

## 第 3 步：留档与上报

- 证据目录写入：`before-snapshot.json`、`after-checks.json`、迁移执行的完整 stdout/stderr（脱敏连接串后）。
- `日志/2026-11-04.md` 追加一行 `[An]`：执行时间、迁移文件名与提交号、六项核对结果、结论。
- 向阿禅/CC 上报：**只报告迁移完成，应用尚未发布**；push 与上线是独立步骤，需另行授权，不得顺手执行。

## 回滚预案（仅供了解，未触发不得操作）

- 第 1 步失败：自动回滚，无需操作。
- 第 2 步发现异常：新列/新函数对旧代码不可见，**保留现场比强行回滚更安全**；等 CC 决定。
- 完全回滚 SQL（仅当 CC 明确要求时使用）：drop 三个函数、三个触发器、`ai_provider_key_models_model_order_unique` 约束及五个新增列。

## 禁区汇总

不改迁移文件；不 push；不部署；不改任何业务数据行；不碰 COS/CloudBase/其他表；不输出凭据；判定失败不自作主张继续下一步。

## 完成判据

六项核对全绿 + 生产旧代码页面正常 + 证据与日志齐备。达成后停在这里等发布授权。
