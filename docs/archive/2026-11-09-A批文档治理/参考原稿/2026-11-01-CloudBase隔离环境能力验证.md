# CloudBase PostgreSQL 隔离环境能力验证

> 阶段：DYData 国产化迁移 · 第二阶段准备
> 环境：`dydata-d6g0gd1v37fcddf21`（上海 / PostgreSQL 模式 / **体验版**）
> 执行时间：2026-11-01 01:29–01:55（GMT+8）
> 执行方式：CloudBase 连接器 → 云 API `tcb:ExecutePGSql`（Region `ap-shanghai`），全部在测试环境内进行
> **未触碰生产数据库、未部署、未升级套餐、未创建正式迁移**

---

## 〇、结论速览

| # | 验证项 | 结论 |
|---|---|---|
| 1 | 单次请求多条 SQL | ✅ **支持**，但**只返回最后一条的结果集** |
| 2 | BEGIN+DDL+INSERT+SELECT+ROLLBACK 同请求 | ✅ **支持**，事务语义正确 |
| 3 | 跨请求同一会话 | ❌ **不保持**（每次请求换后端 PID，临时表跨请求即消失） |
| 4 | 单次 SQL 最大长度 | ⚠️ **未验证**（成本原因，见 §1.4） |
| 5 | 单次执行超时 | ⚠️ **25 秒通过 / 35 秒失败**，阈值在两者之间（推测 30 秒，来自调用链而非数据库） |
| 6 | 结果返回限制 | ✅ **2,000 行完整返回**；10,000 行服务端也返回了，是宿主工具内联上限截断 |
| 7 | DDL 是否需要 DO 包装 | ✅ **不需要**——文档说"可能报错"，本环境直接 `CREATE TABLE` 成功 |
| 8 | 4 个扩展可用性 | ✅ **全部四位验证通过**（列入清单 / 有权限装 / 装成功 / 能实际用） |
| 9 | Supabase 三角色 | ✅ 全部存在 |
| 10 | `auth.uid()` / `auth.jwt()` | ✅ 存在且可用 |
| 11 | **用 Role 参数模拟真实用户身份** | ❌ **做不到**——只切数据库角色，不注入 JWT，`auth.uid()` 恒为 NULL |
| 12 | RLS 策略 | ✅ 可建、可生效、可拒绝 |
| 13 | SECURITY DEFINER + `search_path=''` | ✅ 可建可用 |
| 14 | 触发器 | ✅ 生效 |
| 15 | **`auth.users` 结构** | ⚠️ **与官方文档不一致（重大发现）**，见 §3.8 |

**最重要的一条**：单次请求可以塞进**多条语句**，且整批构成一个隐式事务（一条失败整批回滚）。这意味着第三阶段的导入**不需要"一条 SQL 一个请求"**，工作量比原计划低一个量级，但需要设计分批策略。

---

## 一、ExecutePGSql 行为验证

### 1.1 单次请求能否执行多条 SQL —— ✅ 已验证

```
请求： select 1 as a; select 2 as b;
返回： Columns=["b"], Rows=[["2"]]，ExecutionTimeMs=9
RequestId： c888e854-343a-4506-bda4-d1b91c95565c
```

**行为**：多条语句按顺序全部执行，**只把最后一条语句的结果集返回**。前面的语句不留执行痕迹（结果被丢弃），但副作用保留。

配套证据（DDL+DML+SELECT 同请求，返回最后一条）：

```
请求： create temp table tx_probe(x int); insert into tx_probe values (1); select count(*) as n from tx_probe;
返回： n=1，16ms；RequestId 3d588b60-600e-49cc-9338-df04d582717b
```

### 1.2 同请求完成 BEGIN / DDL / INSERT / SELECT / ROLLBACK —— ✅ 已验证

```
请求： begin; create table public.tx_rb(x int); insert into public.tx_rb values (1); rollback;
       select to_regclass('public.tx_rb') as after_rollback,
              (select count(*) from pg_class where relname='tx_rb') as relcount;
返回： after_rollback=null, relcount=0，11ms
RequestId： 7c289f68-c732-4598-b79d-72d3081e628c
```

**结论**：DDL 在事务内可回滚，`CREATE TABLE` 不是"不可撤销"操作。→ 导入演练可以放心用"整批 BEGIN…ROLLBACK"做预演。

**追加验证：整批原子性**

```
请求： create table if not exists public.tx_err(x int); insert into public.tx_err values (1); select 1/0;
返回： ERROR: division by zero (SQLSTATE 22012)
随后查询： to_regclass('public.tx_err') → null   （RequestId fbbb12bb-653b-4b2c-a1c7-c6072f6045fb）
```

**结论**：一条语句报错 → **整批（含前面的 CREATE 和 INSERT）全部回滚**，不留半成品。这是好消息（要么全成要么全不成），也是风险（一批里一条坏语句会废掉整批，必须靠分批粒度控制损失范围）。

### 1.3 不同请求之间是否保持同一数据库会话 —— ❌ 验证失败（结论：不保持）

```
请求 A： select pg_backend_pid() → 42296    RequestId 1a7cc821-5a6c-48a6-8aa5-db10038eabbc
请求 B： select pg_backend_pid() → 42346    RequestId 66b6666f-c025-406c-b18f-4c5a086bd3b7
```

```
请求 A： create temp table tx_probe(...); insert ...;   （成功）
请求 B： select count(*) from tx_probe;
返回： ERROR: relation "tx_probe" does not exist (SQLSTATE 42P01)
```

**结论**：ExecutePGSQL 走连接池，**每条请求可能落到不同后端**。因此：

- ❌ 临时表不能跨请求使用
- ❌ `SET` 会话变量不能跨请求生效
- ❌ 不能在请求 A 里 `BEGIN`、请求 B 里 `COMMIT`（跨请求事务不存在）
- ✅ **所有导入脚本必须设计成"无状态、单请求自包含"**

### 1.4 单次 SQL 最大内容长度 —— ⚠️ 未验证

**原因**：测长度必须把真实的超长字符串塞进请求参数，每一级加压都要在调用方生成等量文本，成本随长度线性上升；本轮不做暴力逼近。

**已知**：本轮所有语句（最大一条约 1.2 KB，含 5 条语句的批量建表块）均未触长度上限，**没有一条因长度被拒**。

**建议**：这一项留给 Codex 用 SDK/CLI 直接压测（本地生成字符串，不经过对话层），或者在腾讯云工单里直接问。

### 1.5 单次执行超时限制 —— ⚠️ 部分验证

| 测试 | 结果 | 耗时 | RequestId |
|---|---|---|---|
| `select pg_sleep(15)` | ✅ 成功 | 15,050 ms | 4d768b9c-d608-40e0-88c6-f80b2ff54bd8 |
| `select pg_sleep(25)` | ✅ 成功 | 25,063 ms | 951aa9f0-505d-48c4-9033-efbfb5c56d7c |
| `select pg_sleep(35)` | ❌ `timeout: context deadline exceeded` | — | （客户端报错，无 RequestId） |

**结论**：阈值在 **25–35 秒**之间，推测 30 秒。

**关键区分**：数据库侧 `current_setting('statement_timeout')` = **0（不限制）**（RequestId e86552f1）。所以这个超时**不是数据库的**，是**调用链（SDK/MCP/网关）的**。含义：在云函数或服务端直连网关调用时，超时配置可能与这里不同，**必须各自实测**。

**对导入的影响**：单批导入的 SQL 执行时间必须控制在 25 秒以内，按"每批 50–100 条语句"切分比较安全。

### 1.6 结果返回限制 —— ⚠️ 部分验证

| 测试 | 服务端行为 | 宿主工具行为 |
|---|---|---|
| `select generate_series(1,2000)` | 完整返回 2,000 行，17 ms（RequestId 3ab91fb5） | 完整内联 |
| `select generate_series(1,10000)` | 完整返回，结果 179,076 字符 | **超出宿主内联上限，落盘截断** |

**结论**：**没有观察到服务端行数截断**。制约来自调用方（本次是 MCP 宿主工具）。→ 大批量取数应走"分批 + 只取需要的列"，不要一次拉全表。

### 1.7 DDL 是否需要 DO 代码块包装 —— ✅ 已验证（结论：不需要）

```
请求： create table public.tx_ddl_probe(id int primary key, note text);
返回： 成功，7ms，RequestId 81f8bf33-7710-4dad-baed-6079c3cd96e2
复核： to_regclass('public.tx_ddl_probe') = tx_ddl_probe；public 表数 0→1（RequestId e86552f1）
```

```
请求： create index if not exists tx_ddl_probe_gist on public.tx_ddl_probe using gist (id);
返回： 成功，索引存在于 pg_indexes（RequestId aff92a1a-cd65-49bc-95dc-19edb60b54e2）
```

**结论**：官方文档说"部分 DDL 直接执行可能返回 InternalError，建议用 `DO $$ ... $$` 包装"，**在本环境未复现**，普通 `CREATE TABLE` / `CREATE INDEX` 直接可用。

**但不建议因此去掉包装**：文档描述的是"可能"，属概率性失败。导入脚本应保留"失败→DO 包装重试"的兜底分支，成本很低。

---

## 二、扩展验证

区分四个层级，逐项取证。

| 扩展 | ① 在可安装清单 | ② 有权限安装 | ③ 实际创建成功 | ④ 创建后能用 |
|---|---|---|---|---|
| `btree_gist` | ✅ 1.7 | ✅ | ✅ | ✅ 建成 gist 索引 |
| `pgcrypto` | ✅ 1.3 | ✅ | ✅ | ✅ `crypt()` / `digest()` 均返回非空 |
| `uuid-ossp` | ✅ 1.1 | ✅ | ✅ | ✅ `uuid_generate_v4()` 返回合法 UUID |
| `pg_stat_statements` | ✅ 1.11 | ✅ | ✅ | ✅ 可查，返回 **517 行**（说明已预加载） |

**安装批次**：`create extension if not exists ...`（4 条同请求）→ 成功，62 ms，RequestId `3f2bc806-f0dc-488d-8c81-7f0dfe442111`

**可用性逐项取证**

| 证据 | RequestId | 结果 |
|---|---|---|
| `uuid_generate_v4()` / `crypt()` / `digest()` | `39af193a-d491-44ee-aeb9-9c3e7fff80e2` | `cbdb676d-2cee-…` / true / true |
| `select count(*) from pg_stat_statements` | `ffcbed04-ca98-46e7-9263-2b74a8361ea5` | 517 |
| `create index ... using gist (id)` | `aff92a1a-cd65-49bc-95dc-19edb60b54e2` | 索引建成 |

**额外发现**：`supabase_vault 0.3.1` 与 `pg_cron 1.6` **同样出现在可安装清单**（本轮未安装）。前者我们不需要（生产 0 处引用），后者可作为 Vercel Cron 的替代选项。

**当前状态**：4 个扩展**保留安装**（属迁移目标态所需，不是测试数据）。全部测试表 / 测试函数已删除，复核 `public` 下只剩 `pg_stat_statements`、`pg_stat_statements_info` 两个扩展自带视图，**0 张业务表、0 个自定义函数残留**（RequestId `66bf349f-e9ea-4791-a111-3283b83ca609`、`066f0b2a-148f-4dac-8094-2df985b1dfd9`）。

---

## 三、Supabase 兼容性验证

### 3.1 三角色 —— ✅ 已验证

```
RequestId 83568d58-74e6-43e8-b507-620e298a454c
roles = anon, authenticated, service_role
schemas = auth, cloudbase_migrations, extensions, public, storage, supavisor
```

**注意**：`cloudbase_postgres` 这个名字**不是**一个可 `SET ROLE` 的角色，实际连接账号是 `cloudbase_postgres_postgres_nj1t015u`（见 §3.9）。

### 3.2 `auth.uid()` / `auth.jwt()` 等辅助函数 —— ✅ 已验证

```
RequestId 83568d58：auth schema 内函数 = email, jwt, role, uid   （四个齐全，与 Supabase 同名同义）
RequestId 28b596be：在 search_path='' 的 SECURITY DEFINER 函数里调用 auth.uid() → 正常解析，返回 null 而非报错
```

### 3.3 **用 Role 参数模拟真实用户身份 —— ❌ 验证失败（本次最关键的一条）**

```
请求： ExecutePGSql，Role="authenticated"
SQL：  select current_user, session_user, auth.uid(), auth.role(), current_setting('request.jwt.claims', true);
返回： current_user = authenticated
       session_user = cloudbase_postgres_postgres_nj1t015u
       auth.uid()   = null
       auth.role()  = null
       claims       = null
RequestId： 02b2aa07-16d7-48f6-ad84-8354186558bb
```

**结论**：`Role` 参数**只做 `SET ROLE`**，不会注入 JWT claims。因此：

- ✅ 能验证"某个角色有没有表级 GRANT"
- ❌ **不能验证任何依赖 `auth.uid()` 的 RLS 策略**——因为 `auth.uid()` 恒为 NULL
- ❌ 不能验证"用户 A 看不到用户 B 的数据"这类行级问题

**影响**：第三阶段做 RLS 迁移时，**只能用真实 access token 走网关（HTTP）验证**，不能用 ExecutePGSQL 图省事。这一点必须先写进验收方案，否则会得到"全部 0 行 = 策略正常"的假绿灯。

### 3.4 RLS 策略 —— ✅ 已验证（能力具备）

测试对象：`public.rls_probe`（`owner_sub text`），策略 `using (owner_sub = auth.uid())`，`GRANT SELECT TO authenticated, anon`。

| 执行身份 | 可见行数 | RequestId | 说明 |
|---|---:|---|---|
| 默认（`cloudbase_postgres_*`，BYPASSRLS） | 2 | `f59e1d38-9da1-44e0-8adc-8afcb9fa0f3d` | 管理员可见全部 |
| `Role=authenticated` | **0** | `86841f88-1624-4068-809a-6d6bf770f0bb` | 策略生效，但 uid 为 NULL 导致匹配不到 |
| `Role=anon` | **0** | `3947c6da-39b1-4ae1-8dbe-90c049b28126` | 无对应策略 = 默认拒绝 |

**结论**：RLS 机制完整可用，"默认拒绝"语义与 Supabase 一致。但**身份无法注入**（见 3.3）。

### 3.5 SECURITY DEFINER 函数 —— ✅ 已验证

```
SQL： create function public.probe_uid() returns text language sql stable security definer set search_path='' as $$ select auth.uid(); $$
返回： 创建成功；has_function_privilege('authenticated', 'public.probe_uid()', 'EXECUTE') = true
RequestId： 28b596be-0154-4116-a351-823806ed115c
```

**附带证实了生产漏洞的成因**：`CREATE FUNCTION` 默认把 EXECUTE 授予 `PUBLIC`，所以新建函数**天然对 anon/authenticated 开放**，必须显式 `REVOKE`。这与第一阶段审计中"31 个函数对 anon 开放"的现象完全对得上。

### 3.6 触发器 —— ✅ 已验证

```
SQL： 建表 + before insert 触发器（设置 new.touched := true）+ insert
返回： v=42, touched=true，10ms
RequestId： 874bd132-eb7c-4861-a085-f764d8a0beb5
```

### 3.7 `search_path` —— ✅ 已验证

以 `SET search_path = ''` 定义的 SECURITY DEFINER 函数可以正常创建并执行，函数体内用 `auth.uid()` 全限定名调用无报错（§3.5）。生产 89 个函数大量使用 `SET search_path TO ''` / `public` 的写法，**可以原样迁移**。

### 3.8 **`auth.users` 结构与官方文档不一致 —— ⚠️ 重大发现**

```
RequestId 866ec32e-970a-4d7d-a17b-65df8c2a7b55
```

实际列（38 个）：
```
id(bigint), project, sub(varchar), name, picture, username, email, email_verified,
phone_number, providers(jsonb), password(varchar), status(smallint), gender, birthdate,
zoneinfo, locale, groups(jsonb), position, address(jsonb), raw_app_meta_data(jsonb),
created_from, created_at, updated_at, password_updated_at, last_login, two_factor(jsonb),
register_info(jsonb), internal_user_type, type, user_source, user_desc, open_id, corp_id,
parent_user_id, main_dep
```

| 对比项 | 官方迁移文档说 | 实测 |
|---|---|---|
| `auth.users.id` 类型 | `varchar(64)` | **`bigint`**（另有一个 `sub varchar` 列） |
| `encrypted_password` | 未提及 | **不存在**；实际列名是 `password` |
| `banned_until` / `aud` / `role` | 未提及 | 不存在 |

**三条影响（都改变原计划）**：

1. **业务表 `uuid` 外键 → `auth.users` 彻底不可建**：不只是"类型不匹配"，而是 `bigint` 对 `uuid`，连强转都没有意义。→ 原计划"去掉 12 个外键"从"建议"变成"必须"。
2. **`auth.uid()` 很可能读的是 `sub` 列**（需用真实 token 验证，见 §5 待验证项）。若成立，则只要把 84 个 UUID 写进 `sub`，`auth.uid()` 就能返回我们的 UUID，**业务表可以继续用 uuid 类型**。
3. **存在 `password` 列**：理论上"直接写入哈希"这条通道存在，但 CloudBase 用什么算法（bcrypt cost？argon2？）**文档没有写**，**不得自行尝试**。这是一条"可能存在但未确认"的备用路线，若要动必须先问官方。

### 3.9 Schema 与角色全景

| 项 | 实测 | 与 Supabase 的差异 |
|---|---|---|
| 存在的 schema | `auth`、`storage`、`public`、`extensions`、`cloudbase_migrations`、`supavisor` | 缺 `graphql`/`graphql_public`/`realtime`/`supabase_migrations`/`vault` |
| `auth` 对象数 | 119（表+索引） | Supabase 侧 139 |
| `auth` 函数 | `email`, `jwt`, `role`, `uid` | 一致 |
| `storage` 表 | `buckets`, `objects`, `s3_multipart_uploads`, `s3_multipart_uploads_parts`, `migrations` | 一致（多一个 `migrations`） |
| `storage` 函数 | 含 `foldername`, `filename`, `operation`, `allow_only_operation`… | 一致 |
| 连接账号 | `cloudbase_postgres_postgres_nj1t015u` | 不是 `postgres` |
| 实例形态 | `SHARED`（共享） | — |

**Storage 策略可直接迁移的证据**：生产 2 条策略用的是
`(storage.foldername(name))[1] = (auth.uid())::text` —— 已经带了 `::text` 转换，而 CloudBase 的 `storage.foldername` 与 `auth.uid()` 都返回 text，**不需要改一个字符**。

---

## 四、导入方案重估

### 4.1 方法

不预设"全迁 99 张表"，按依赖闭包重新算。口径：

```
种子 = ① 代码直连的表（grep .from("...")，44 个名字，其中 5 个 douyin_* 库内不存在）
       ② 被函数体引用的表（按表名在 prosrc 中做词边界匹配）
闭包 = 种子 ∪ 递推所有外键父表
```

两种口径分别算：

| 口径 | 保留哪些函数 | 表 | 索引 | 外键 | 主键 | 唯一 | 检查 | 策略 | 函数 | 触发器 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **完整**（保留全部 89 个业务函数） | 89 | **55** | — | — | — | — | — | — | 89 | — |
| **精简**（只保留代码实际调用的 29 个 RPC + 被保留表的 12 个触发器函数） | 41 | **47** | 189 | 79 | 43 | 14 | 61 | 137 | 41 | 12 |

**对象总量对比**：全量约 800+ 个对象 → 精简后约 **623 个**（47 表 + 189 索引 + 79 外键 + 43 主键 + 14 唯一 + 61 检查 + 137 策略 + 41 函数 + 12 触发器）。

### 4.2 必须迁移的对象

**表（47 张，按行数排序的前 15）**：
`admin_first_screen_perf_events`(19,939) · `usage_events`(15,990) · `video_tags`(8,209) · `videos`(2,703) · `video_metrics_snapshots`(2,669) · `notifications`(2,648) · `daily_reports`(2,615) · `exemption_request_date`(972) · `audit_logs`(774) · `exemption_request`(680) · `exemption_grant`(505) · `remind_logs`(427) · `fulfillment_appeals`(216) · `rewrite_conversations`(145) · `ai_provider_key_models`(119)（其余 32 张均 < 100 行）

**函数（41 个）**：代码直接调用的 29 个 RPC + 12 个触发器函数（`touch_updated_at`、`guard_profile_exemption_projection`、`guard_profile_membership_lifecycle`、`clear_fulfillment_absent_after_daily_report`、`preserve_daily_report_manual_source`、`update_script_usage_aggregate`、`set_violation_case_script_hash`、`log_content_edit` 等）

**其余**：189 索引、79 外键、61 检查约束、137 条 RLS 策略、12 触发器、1 序列（`usage_events_id_seq`）、4 扩展（已在测试环境装好）

### 4.3 可以省略的对象

**44 张表**，其中 **12 张有数据**（省略即丢弃这些数据）：

| 表 | 行数 | 性质 |
|---|---:|---|
| `sop_daily_status` | 952 | 已下线 SOP 模块 |
| `rewrite_document_paragraphs` / `rewrite_messages` / `rewrite_documents` / `rewrite_document_revisions` / `rewrite_generation_runs` | 332 / 297 / 43 / 41 / 22 | 已下线文案工具 |
| `yike_item_events` / `yike_items` / `yike_areas` / `yike_projects` / `yike_execution_slots` / `yike_people` / `yike_workspaces` | 106 / 20 / 5 / 2 / 1 / 1 / 1 | 疑似废弃（代码零引用） |
| `sop_checkpoint_submissions` | 30 | 已下线 |
| `report_date_fix_20261019_ledger` / `appeal_backfill_20261019_ledger` / `ai_provider_priority_migration_backup_20261009` | 13 / 3 / 5 | 一次性修复台账 |
| `violation_reason_tags` / `violation_case_reason_tags` / `market_context_daily` / `script_purposes` / `rewrite_conversation_skills` / `rewrite_skill_versions` / `rewrite_skills` / `rewrite_model_routes` | 7 / 1 / 1 / 2 / 2 / 2 / 2 / 4 | 已下线模块的配置表 |

其余 **32 张为 0 行**（`advice_actions`、`ai_feedback`、`ai_result`、`content_asset`、`weekly_decisions`、`visual_tags` 等），省略无数据损失。

> **决策建议**：这些表不迁不是"删数据"。生产库保持不动，CloudBase 侧不建即可；需要留档就先 `pg_dump --table` 导出到 COS 备查。**必须由阿禅确认**，因为 `sop_daily_status`(952) 和 `rewrite_*`(735) 加起来是 1,687 行历史数据。

### 4.4 无法在 CloudBase 还原的对象

| Supabase 对象 | CloudBase 现状 | 处理 |
|---|---|---|
| `supabase_migrations.schema_migrations`（220 条账本） | 不存在；替代品是 `cloudbase_migrations` | 换账本，历史 220 条不迁 |
| `graphql` / `graphql_public` schema | 不存在 | 本项目零使用，忽略 |
| `realtime` schema | 不存在 | 本项目零使用，忽略 |
| `vault` schema / `supabase_vault` 扩展 | 扩展可装，业务零引用 | 不迁 |
| `auth.identities` / `sessions` / `mfa_*`（Supabase 专有） | 结构完全不同 | 由 CloudBase 认证体系接管 |
| **`auth.users` 的密码哈希** | `password` 列存在但算法未知 | **不得自行写入，见 §3.8** |
| 12 个指向 `auth.users(id)` 的外键 | `bigint` vs `uuid`，无法重建 | **必须去掉**，改由应用层保证 |

### 4.5 需要模拟的 Supabase 专属能力

| 能力 | 现状 | 模拟方式 |
|---|---|---|
| `auth.uid()` 返回 UUID | 可用，但返回值来自 `sub`（待验证） | 建号时把 UUID 写进 `sub` |
| RLS 双层权限 | 一致 | 无需模拟 |
| PostgREST `/rest/v1` 路径 | 变为 `/v1/rdb/rest` | 客户端适配层（03 号报告阶段 6） |
| `service_role` BYPASSRLS | 一致 | 无需模拟 |
| `storage.foldername()` | 存在且同义 | 无需模拟 |
| Supabase CLI 迁移账本 | 变为 `cloudbase_migrations` | 换工具链 |
| Vercel Cron 触发 | 保持 Vercel | 无需模拟（`pg_cron` 可装但不必要） |

### 4.6 工作量修正（相对 03 号报告）

| 项 | 原估 | 修正后 | 变化原因 |
|---|---|---|---|
| 迁移对象数 | 800+ | **623** | 依赖闭包裁剪掉 44 张表、48 个函数 |
| 执行方式 | "一条 SQL 一个请求" | **分批多语句，每批 50–100 条** | §1.1 实测多语句可用 |
| 阶段 3 工期 | 3–5 个工作日 | **2–3 个工作日** | 批量执行 + 对象数减少 |
| 新增风险 | — | **整批原子性**：一批里一条坏语句废整批 | §1.2，靠小批粒度控制 |
| 新增风险 | — | **RLS 无法用 ExecutePGSQL 验证** | §3.3，必须走真实 token |

---

## 五、未完成项与需要额外权限的事项

| 项 | 状态 | 需要什么 |
|---|---|---|
| 单次 SQL 最大长度 | **未验证** | 用 SDK/CLI 在本地生成超长字符串压测（不经过对话层），或问官方 |
| 超时阈值精确值（25–35s 之间） | **未验证** | 逐级 5s 逼近：30s、31s…；成本低但需要 5–6 次调用 |
| `auth.uid()` 是否读取 `sub` 列 | **需要额外权限** | 需要一个真实登录用户的 access token（测试账号即可，不用员工账号），走网关发请求后看返回值 |
| 真实用户身份下的 RLS 可见范围 | **需要额外权限** | 同上，且需要两个不同用户各一个 token |
| 导入 61,301 行数据的实际耗时 | **未验证** | 属第三阶段演练，本轮不应执行 |
| 云函数/服务端侧的超时是否同为 30s | **未验证** | 需要部署一个测试云函数 |

---

## 六、RequestId 台账（可复核）

| 用途 | RequestId | 耗时 |
|---|---|---|
| 后端 PID（第 1 次） | `1a7cc821-5a6c-48a6-8aa5-db10038eabbc` | 7 ms |
| 后端 PID（第 2 次） | `66b6666f-c025-406c-b18f-4c5a086bd3b7` | 11 ms |
| 多语句（只返回最后一条） | `c888e854-343a-4506-bda4-d1b91c95565c` | 9 ms |
| 临时表建+插+查 | `3d588b60-600e-49cc-9338-df04d582717b` | 16 ms |
| BEGIN/DDL/INSERT/ROLLBACK | `7c289f68-c732-4598-b79d-72d3081e628c` | 11 ms |
| 直接 CREATE TABLE | `81f8bf33-7710-4dad-baed-6079c3cd96e2` | 7 ms |
| pg_sleep(15) | `4d768b9c-d608-40e0-88c6-f80b2ff54bd8` | 15,050 ms |
| 表已建 + statement_timeout=0 | `e86552f1-9790-41e9-aa9b-45eed11f320e` | 60 ms |
| pg_sleep(25) | `951aa9f0-505d-48c4-9033-efbfb5c56d7c` | 25,063 ms |
| Role=authenticated 身份探测 | `02b2aa07-16d7-48f6-ad84-8354186558bb` | 10 ms |
| 角色/schema/扩展全景 | `83568d58-74e6-43e8-b507-620e298a454c` | 9 ms |
| auth.users 结构 + storage 表 | `866ec32e-970a-4d7d-a17b-65df8c2a7b55` | 12 ms |
| 4 扩展安装 | `3f2bc806-f0dc-488d-8c81-7f0dfe442111` | 62 ms |
| uuid-ossp / pgcrypto 可用 | `39af193a-d491-44ee-aeb9-9c3e7fff80e2` | 10 ms |
| pg_stat_statements 可查 | `ffcbed04-ca98-46e7-9263-2b74a8361ea5` | 10 ms |
| btree_gist 建成 gist 索引 | `aff92a1a-cd65-49bc-95dc-19edb60b54e2` | 9 ms |
| RLS 表/策略建立 + 管理员看到 2 行 | `f59e1d38-9da1-44e0-8adc-8afcb9fa0f3d` | 14 ms |
| SECURITY DEFINER + search_path='' | `28b596be-0154-4116-a351-823806ed115c` | 8 ms |
| Role=authenticated 看到 0 行 | `86841f88-1624-4068-809a-6d6bf770f0bb` | 7 ms |
| Role=anon 看到 0 行 | `3947c6da-39b1-4ae1-8dbe-90c049b28126` | 7 ms |
| 触发器生效 | `874bd132-eb7c-4861-a085-f764d8a0beb5` | 10 ms |
| 2,000 行返回完整 | `3ab91fb5-ce2f-4f45-b3ab-fbf741422d01` | 17 ms |
| 整批回滚（CREATE 未留下） | `fbbb12bb-653b-4b2c-a1c7-c6072f6045fb` | 7 ms |
| 清理后残留检查 | `66bf349f-e9ea-4791-a111-3283b83ca609` / `066f0b2a-148f-4dac-8094-2df985b1dfd9` | 10 / 18 ms |

---

## 七、环境最终状态

| 项 | 状态 |
|---|---|
| 业务表 | **0 张**（测试表全部删除，已复核） |
| 自定义函数 | **0 个**（`probe_uid`、`trg_fn` 已删除；剩余 237 个均为扩展自带） |
| 扩展 | `btree_gist`、`pgcrypto`、`uuid-ossp`、`pg_stat_statements`、`plpgsql` —— **保留安装**（迁移目标态所需） |
| 数据 | 无任何测试数据残留 |
| 套餐/计费 | 未变更（体验版，用量仍为 0） |
| 生产库 | **未触碰** |
