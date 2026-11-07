# 02 · CloudBase 迁移兼容性报告

> 对应第一期审计的第二份交付物。所有结论附官方文档出处；凡官方文档没有明说、只能推断的，标注为【推断】。
> 取证时间：2026-11-01 01:00 前后，文档均为当时线上最新版本。

---

## 一、一句话结论

**数据库层可以迁，成本可控；认证层不能"搬"，只能"重建"；存储层不建议迁到 CloudBase，应该留在已经跑通的 COS。**

分项：

| 领域 | 判断 | 理由 |
|---|---|---|
| PostgreSQL 结构（表/索引/约束/触发器/函数/RLS） | ✅ **能迁**，改动量中等 | 云开发 PG 模式就是标准 PostgreSQL，官方明确"绝大多数项目只需少量改动" |
| 客户端代码（`@supabase/supabase-js`） | ⚠️ **必须改代码**，不能只换地址 | REST 路径从 `/rest/v1` 改为 `/v1/rdb/rest` |
| 权限策略（RLS） | ⚠️ **168 条要改** | `auth.uid()` 在云开发返回 `text`，与现有 `uuid` 列比较会报错 |
| 认证（84 个员工账号） | ❌ **不能原样迁** | `auth` schema 平台托管，官方只给"重新激活 / 联系运营批量导入"两条路 |
| 截图存储 | ✅ **已经不需要迁**（保持现状最优） | 生产已切 COS；CloudBase 存储的优势在我们这个用法下体现不出来，成本还更高 |
| 实时订阅 / GraphQL / 分支 | — **不影响** | 本项目零使用 |

---

## 二、官方证据台账（全部为一手文档）

| 编号 | 主题 | 出处 | 关键原文 |
|---|---|---|---|
| E1 | 从 Supabase 迁移总览 | `https://docs.cloudbase.net/quick-start/migration/supabase` | "绝大多数 Supabase 项目可以以最小改动迁移过来""REST 端点路径：Supabase `/rest/v1/<table>` → 云开发 `/v1/rdb/rest/<table>`" |
| E2 | 同上：不支持的项 | 同 E1 | "Realtime ❌ 不支持""GraphQL ❌ 不支持""数据库 branching ❌ 不支持" |
| E3 | 同上：auth 迁移 | 同 E1 | "因 `auth` schema 由平台管理，不直接 dump/restore；建议在迁移期间通过认证 API 让用户重新激活账号，或与平台运营沟通批量导入方案" |
| E4 | 同上：数据导入方式 | 同 E1 | "通过云 API `ExecutePGSql` 逐条执行（每次只能执行一条 SQL）""大表用 `COPY` 更高效" |
| E5 | PG 模式概述 | `https://docs.cloudbase.net/quick-start/pg-overview` | "PG 模式仅新建环境支持，存量环境不支持升级"；扩展含 `pgvector` / `zhparser` / `TimescaleDB` / `PL/V8` 等 |
| E6 | 身份认证（PG） | `https://docs.cloudbase.net/authentication-v2/auth/auth-pg` | "`auth.users` 主键 `id` 类型为 `VARCHAR(64)`"；`auth.uid()` 返回 `text`；`anon` 设 `statement_timeout=3s`、`authenticated` 设 `8s`；`service_role` 具备 `BYPASSRLS` |
| E7 | 数据库架构与权限 | `https://docs.cloudbase.net/database/postgresql/initialization` | REST API "目前只支持 `public` schema"；`ExecutePGSql` 单条 SQL、DDL 失败需 `DO $$ ... $$` 包装 |
| E8 | 存储：PG 模式 | `https://docs.cloudbase.net/storage/pg/introduce` | 文件元数据在 `storage.objects`，权限只由 RLS 决定；"不允许直接 `DELETE FROM storage.objects`，有 `protect_delete` 触发器" |
| E9 | 存储：Supabase 迁移 | `https://docs.cloudbase.net/storage/pg/migrate-from-supabase` | Bucket/Object/RLS 思路可复用；SDK 方法名相近但**返回字段不一致**（`signedUrl` vs `fullSignedURL`） |
| E10 | 存储：访问方式 | `https://docs.cloudbase.net/storage/pg/serving` | 支持 `createSignedUrl()` / `createSignedUrls()`（批量）/ `download()` / `getPublicUrl()` |
| E11 | 计费（资源点） | `https://cloudbase.net/pricing`、`https://cloud.tencent.com/document/buy-guide/876/127357` | 1,000 点 ≈ ¥1；免费 3,000 点/月；个人版 ¥19.9 = 40,000 点；标准版 ¥199 = 330,000 点 |
| E12 | PG 专属计费项 | `https://cloud.tencent.com/product/tcbs/mongodb`（FAQ） | "PostgreSQL CPU 使用量 **0.342 元/核·小时**，数据库容量 **0.0005 元/GB·小时**" |
| E13 | 实例与计量 | `https://docs.cloudbase.net/database/postgresql/database-management` | 共享实例"每个按 0.5 核；5 分钟为一个计量单位；无访问不计费" |
| E14 | 用户管理 API | `https://docs.cloudbase.net/api-reference/manager/node/user` | `createUser` 支持自定义 `uid`"最长 64 字符"；密码"8~32 位，需包含大写/小写/数字/特殊字符中至少 3 类" |
| E15 | 自定义登录 | `https://docs.cloudbase.net/en/authentication-v2/method/custom-login` | `customUserId`"4–32 字符"，字符集限 `_-#@(){}[]:.,+#~` |
| E16 | 地域 | `https://cloudbase.net/blog/2026/07/27/singapore-region`、购买页配置 | 上海、新加坡两个地域；上海同时支持 PG 模式与传统模式 |
| E17 | 导入数据 | `https://docs.cloudbase.net/en/database/postgresql/import-data` | 支持 `pg_dump` / `pg_restore` / SQL 文件 / DMC 导入 |

---

## 三、功能兼容矩阵

分类：**A** 直接迁移 · **B** 少量代码改动 · **C** 需调整业务逻辑 · **D** 需重新设计 · **E** 官方不支持 · **F** 需官方确认

| # | DYData 实际依赖 | 现状证据 | 分类 | 差异与解决办法 | 风险 |
|---|---|---|---|---|---|
| 1 | PostgreSQL 17.6 | `select version()` | **A** | 云开发 PG 为 17 系；语法/事务/窗口函数/CTE/分区全支持（E5） | 低 |
| 2 | 99 张表 / 321 索引 / 180 外键 / 95 主键 / 29 唯一 / 106 检查 | 库内统计 | **A** | 标准 DDL，`pg_dump --schema-only` 后经 `ExecutePGSQL` 逐条执行 | 低 |
| 3 | 1 个视图、1 个序列 | `ai_unified_config_view`、`usage_events_id_seq` | **A** | 视图可建；序列需额外 `GRANT USAGE ON SEQUENCE`（E7 明确提醒） | 低 |
| 4 | 0 物化视图、0 枚举 | 库内统计 | **A** | 少两类风险 | 无 |
| 5 | 89 个业务函数（含 78 个 SECURITY DEFINER） | 库内统计 | **A** | 纯 SQL/PLpgSQL，不依赖 `auth.users` 表，只用 `auth.uid()`；云开发预置同名函数（E6） | 低 |
| 6 | 24 个触发器 | `pg_trigger` | **A** | 常规行级触发器，`search_path` 已显式设置 | 低 |
| 7 | 240 条 RLS 策略 | `pg_policies` | **C** | 其中 **168 条**用 `auth.uid()` 与 `uuid` 列直接比较；云开发 `auth.uid()` 返回 `text`（E6）→ 需统一加 `::uuid` 或把列改 `text`。**这是本次改造量最大的一块 SQL** | 中高 |
| 8 | 表级 GRANT 模型 | 三角色 `anon/authenticated/service_role` | **A** | 同名同语义、同样"GRANT + RLS 双层"，`service_role` 同样 `BYPASSRLS`（E6） | 低 |
| 9 | `.rpc()` 32 处 | 代码扫描 | **A/B** | 官方声明 `.rpc()` 写法一致（E1）；但 SDK 换成云开发后入参形式需逐个核对 | 低 |
| 10 | `.from()` 约 325 处链式查询 | 代码扫描 | **B** | `select/eq/in/order/limit/upsert` 官方声明一致；**但 REST 基础路径变了**（E1），`@supabase/supabase-js` 写死 `/rest/v1`，不能靠改 baseURL 迁移，必须换客户端或自建适配层 | 中 |
| 11 | 浏览器端只读客户端 | `src/lib/supabase/client.ts` | **B** | 换 `@cloudbase/js-sdk`；需要 `accessKey`（Publishable Key） | 低 |
| 12 | 服务端 `createAdminClient`（service_role，82 处） | 代码扫描 | **B** | 换 API Key；**84 处调用签名不用动**，只要工厂函数内部换实现 | 中 |
| 13 | SSR 会话（`@supabase/ssr` HttpOnly cookie + middleware 每次校验） | `src/middleware.ts` 304 行 | **D** | 云开发是 JWT + refresh token（默认 Access Token 2 小时，E6），没有现成的 Next.js SSR cookie 适配器。需要自己写：登录后把 refresh token 存 HttpOnly cookie、middleware 内换 token、过期刷新 | 高 |
| 14 | 浏览器直连登录（`signInWithPassword`） | `login/page.tsx` | **D** | 建议改为本站服务端代理登录，浏览器不直接持凭证 | 中 |
| 15 | 找回密码 / 邮箱验证 | `forgot-password-form.tsx` | **C** | 云开发有邮箱验证与找回流，但**邮件模板、发信域名、回调地址要重配**；`auth/v1` 路径一致（E1） | 中 |
| 16 | 封禁 / 建号 / 删号（`auth.admin.*`） | `member-lifecycle-service.ts` 等 | **B/C** | 云开发用 `userStatus: ACTIVE/BLOCKED`；语义接近但要改调用方式（E14） | 中 |
| 17 | 84 个账号的**密码** | `auth.users`（未读哈希） | **E/D** | **官方无密码哈希导入通道**（E3）。可选路径见 §5 | **高（阻塞级）** |
| 18 | 用户 ID（uuid 36 字符）保留 | 29 张表用 uuid 存用户 | **B** | `createUser({uid})` 支持自定义 uid，最长 64 字符（E14）→ **ID 可以原样保留**；但云开发 `auth.users.id` 是 `varchar(64)`，与现有 `uuid` 列比较需 `::uuid` 或改列类型 | 中 |
| 19 | 12 个外键指向 `auth.users(id)` | `pg_constraint` | **C** | uuid 列无法外键指向 varchar 列 → 迁移时**去掉这 12 个外键**，列值保留（应用层已保证一致性） | 中 |
| 20 | `supabase_vault` 扩展 | 库内存在，**业务零使用**（0 处引用） | **A**（不迁） | 不需要迁移 | 无 |
| 21 | `btree_gist` / `pgcrypto` / `uuid-ossp` / `pg_stat_statements` | 库内存在 | **F** | 官方扩展清单只列了 pgvector / zhparser / TimescaleDB / PL-V8 等（E5），未明确列出这 4 个。**需官方确认**；若不可装，`btree_gist` 影响不大（我们没用到排他约束），`uuid-ossp` 可用 `gen_random_uuid()` 替代 | 低 |
| 22 | Supabase Storage 截图（已降级为备份） | 3,661 对象 / 911 MB | **B** | 若真要迁到 CloudBase 存储：需建 3 个 Bucket + 迁移 RLS + 改 SDK；**但建议不迁**，见 §6 | 中 |
| 23 | 私有文件 + 签名链接 | `createSignedUrl` / 批量 grant | **A** | 云开发支持 `createSignedUrl` 与批量 `createSignedUrls`（E10），"公共/私有"由 RLS 决定而非桶标签（E8） | 低 |
| 24 | 服务端代理读图（当前生产做法） | `/api/submission-screenshots/file` | **A** | 与云开发无关，走 HTTP API 即可 | 低 |
| 25 | Realtime | **零使用** | **E→不适用** | — | 无 |
| 26 | GraphQL | **零使用** | **E→不适用** | — | 无 |
| 27 | 数据库分支（branching） | **零使用** | **E→不适用** | 用多个环境隔离代替 | 无 |
| 28 | Vercel Cron 3 个任务 | `vercel.json` | **A** | 与本迁移无关，保持 Vercel 即可 | 低 |
| 29 | 数据库直连（psql / pg_dump / DDL） | `SUPABASE_DB_URL` 用法 | **F** | 官方文档两处口径不一致：E1/E4 说"经 `ExecutePGSQL` 逐条执行"，E17 又说支持 `pg_dump`/`pg_restore`。**直连连接串是否提供、是否限流，必须官方确认** | **高（影响工期）** |
| 30 | `statement_timeout` | 当前 Supabase 无此限制 | **C** | 云开发 `authenticated` 限 8 秒、`anon` 限 3 秒（E6）。我们实测最重函数 122 ms，**当前安全**；但全量路径合并查询若变慢会撞墙 | 低（需监控） |
| 31 | REST 只能访问 `public` schema | 我们只用 public | **A** | 无影响（E7） | 无 |

### 统计

| 分类 | 条数 | 说明 |
|---|---:|---|
| A 直接迁移 | 12 | 数据库结构主体 |
| B 少量代码改动 | 6 | SDK 与查询层 |
| C 需调整业务逻辑 | 6 | RLS 策略、外键、邮件流程 |
| D 需重新设计 | 3 | **会话层、登录链路、认证迁移** |
| E 官方不支持 | 3 | Realtime / GraphQL / branching（**全部零使用**）+ 密码自助迁移 |
| F 需官方确认 | 3 | 扩展清单、直连/导入通道、上海个人版 PG 支持 |

---

## 四、明确不兼容、必须重新设计的四项

### 4.1 密码迁移（阻塞级）

三条已知路径全部有硬限制：

| 路径 | 可行性 | 硬限制（官方） |
|---|---|---|
| 直接 dump/restore `auth` schema | ❌ | E3 明确禁止 |
| `createUser({ uid, password })` 批量建号 | ⚠️ 只能"重建" | 需要明文密码；且密码规则"8~32 位、至少 3 类字符"（E14），**比现有系统更严**，老用户的弱密码过不了 |
| 自定义登录承接（自校验哈希 + 换票） | ⚠️ 理论上可行 | `customUserId` **限 4–32 字符**（E15），我们的 UUID 是 36 字符 → 直接被卡死 |

**因此只有三个现实选项**（三选一，需阿禅拍板）：

| 选项 | 做法 | 用户体验 | 成本 | 风险 |
|---|---|---|---|---|
| **① 全员重置密码**（推荐） | 迁移前发通知，用户在旧站自助重置，或迁移后用"忘记密码"重设 | 每人一次操作 | 低 | 中（24 个封禁账号、17 个从未登录账号可顺带清理） |
| **② 自建密码校验 + 自定义登录** | 把 bcrypt 哈希搬到自己的一张表，登录时服务端校验，再用 CloudBase 票据换 token。**需要把 UUID 映射成 ≤32 字符的新 ID**，或在票据里用转换后的 ID | 无感 | 中高（多维护一套认证 + ID 映射表） | **高**（ID 映射一旦出错，历史数据全错位） |
| **③ 向腾讯云申请批量导入** | 提工单，请官方导入含哈希的账号 | 无感 | 取决于官方 | 未知，**必须先问** |

**我的建议：走 ①。** 84 个账号、且 24 个已封禁、17 个从未登录——真正需要"无感"的人不到 45 个，为这 45 个人搭一套 ID 映射体系，收益不划算。

### 4.2 会话层

现在是 `@supabase/ssr` 帮我们处理 cookie、刷新、SSR。云开发没有对应适配器。需要新写：
- 登录成功后把 refresh token 写进 HttpOnly cookie
- `middleware.ts`（304 行）里换成"校验 access token → 过期则刷新"
- 所有 `createClient().auth.getUser()`（33 个文件）替换为读自己的会话

这是**代码改造量最大的一块**，不是"改个地址"。

### 4.3 RLS 策略（168 条）

`auth.uid()` 在云开发返回 `text`，我们 168 条策略写成 `user_id = auth.uid()`，而 `user_id` 是 `uuid` → 报"操作符不存在"。两种修法：
- **改策略**：`user_id = auth.uid()::uuid`（168 处机械改写，风险低，兼容回 Supabase）
- **改列类型**：所有用户字段从 `uuid` 改 `text`（改动面更大，但一劳永逸）

建议**改策略**，保留列类型不变——这样 Supabase 侧仍可作回退。

### 4.4 REST 路径

`@supabase/supabase-js` 内部拼 `{url}/rest/v1/{table}`，云开发是 `{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}`。**这不是配置项，是代码里的硬编码。** 所以：

- 要么全站换成 `@cloudbase/js-sdk`（`db.from(...)` 链式写法基本一致）
- 要么在 `src/lib/supabase/admin.ts` / `server.ts` / `client.ts` 三个工厂里自己实现一层薄适配（内部用 `fetch` 打 `v1/rdb/rest`），业务代码几乎不动

**推荐后者**：改动集中、可灰度（同一套业务代码可以指 Supabase 或 CloudBase）、可回退。

---

## 五、截图存储：建议**不迁到 CloudBase 存储**

| 维度 | 留在 COS（现状） | 迁到 CloudBase 存储 |
|---|---|---|
| 当前状态 | 已上线运行 13 天，回退率 0 | 需从零建桶、迁 3,264 个对象、重写 RLS |
| 私有访问 | 已实现（服务端代理，不产公开 URL） | 同样能实现（RLS + 签名链接） |
| 批量签名 | 已有 grant cookie 批量票据，一次 55 张 | 支持 `createSignedUrls`，但要重写现有票据机制 |
| 鉴权逻辑 | 在应用层（`visibleUserIds` + 视频级可见性），**已经很复杂** | 要么搬到 RLS（SQL 里重写一遍同逻辑），要么维持应用层 |
| 成本 | COS 存储 + 流量，独立账单 | **额外占 CloudBase 资源点**：CDN 流量 460 点/GB（≈¥0.46/GB），存储 4.54 点/GB/天 |
| 迁移风险 | 0 | 高（3,264 个对象 + 权限模型重写） |

**结论**：迁到 CloudBase 存储**只增加风险和成本，不带来能力**。真正该做的是另一件事：**把 COS 桶从新加坡换到广州/上海**——但这条同样有坑（见 03 号报告 §2.2：Vercel sin1 去广州实测 p95 1.2 秒、60% 超时）。

---

## 六、成本测算

### 6.1 计费口径（官方）

- 1,000 资源点 ≈ ¥1（E11）
- PostgreSQL 计算：**0.342 元/核·小时 = 342 点/核·小时**；容量 **0.0005 元/GB·小时 = 0.5 点/GB·小时**（E12）
- 共享实例按 **0.5 核** 计，**5 分钟粒度，无访问不计费**（E13）
- 云存储：容量 4.54 点/GB/天；CDN 流量 **460 点/GB**；读/写请求 10 点/万次（E11）

### 6.2 三种用量场景（仅数据库）

假设：共享实例、0.5 核、只在有访问的时段计费。

| 场景 | 每日活跃时长 | 月核·小时 | 数据库算力点数 | ≈人民币 |
|---|---:|---:|---:|---:|
| 低频（每天集中用 4 小时） | 4 h | 44 | 15,048 | ¥15 |
| **工作时段（10 h × 22 天）** | 10 h | 110 | **37,620** | **¥37.6** |
| 全天在线 | 24 h | 360 | 123,120 | ¥123 |

数据库容量：81 MB ≈ 0.081 GB → 约 **29 点/月（¥0.03）**，可忽略。

**关键读数**：光是数据库算力，"正常工作时段"这一档就已经吃掉个人版 40,000 点里的 **94%**（37,620 点）。留给存储和流量的只剩 2,380 点。

### 6.3 如果把截图也放进 CloudBase

| 项 | 用量假设 | 点数/月 |
|---|---|---:|
| 存储 912 MB | 0.912 GB × 4.54 × 30 | **124** |
| CDN 出流量（保守） | 每人每天 20 张 × 250 KB × 84 人 × 22 天 ≈ 9.2 GB | **4,232** |
| CDN 出流量（重度） | 每人每天 100 张 ≈ 46 GB | **21,160** |

→ 数据库 37,620 + 存储 124 + 流量 4,232 ≈ **42,000 点**，**已超个人版**。重度使用直接翻倍。

### 6.4 结论

| 方案 | 月成本 | 判断 |
|---|---:|---|
| 免费体验版 | ¥0 | **不可用于生产**：3,000 点 ≈ 17.5 核·小时/月（约每天 35 分钟），且不支持加购与按量付费，超了直接停 |
| 个人版 + 截图留 COS | **¥19.9**（37,620+ 点，勉强在 40,000 内） | **可行，但没有余量**；一旦活跃时长增加就要按量付费（1:1，约 ¥0.34/额外核·小时） |
| 个人版 + 截图也进 CloudBase | ¥19.9 + 按量约 ¥10–25 | **不推荐**，等于花钱买风险 |
| 标准版 | ¥199 | 资源充裕，含 14 天数据回档（**这是个人版没有的能力**，见 §7） |

**建议**：先按"个人版 + 截图留 COS"起步，把 40,000 点当预算上限监控；连续两周点数消耗超过 80% 就升标准版。

---

## 七、免费版 / 个人版的真实能力边界

| 能力 | 免费体验版 | 个人版 ¥19.9 | 标准版 ¥199 |
|---|---|---|---|
| 资源点 | 3,000 | 40,000 | 330,000 |
| 超限处理 | **停用**（不支持加购/按量） | 可加购资源包、可按量 | 同 |
| 环境数 | 1 个/账号 | — | — |
| 有效期 | 6 个月，到期前 1 个月内可续 | 月付 | 月付 |
| **数据回档** | ❌ | ❌ | **✅ 14 天** |
| SLA | — | 99.95% | 同 |

**需要阿禅知道的一条**：**数据回档（PITR）只有标准版起才有。** 个人版没有"误删回滚"。对一个存着全公司内容数据的系统，这条比省 180 块钱重要。我建议**直接上标准版**，或者至少在上个人版期间自建"每日逻辑备份到 COS"作为补偿。

---

## 八、迁移可行性总判断

| 维度 | 判断 |
|---|---|
| 技术可行性 | **可行**。数据库/函数/触发器天然兼容，改动集中在 SDK 适配、RLS 改写、会话层重写 |
| 工期主要变量 | ① 认证方案（重置密码 vs 官方批量导入）② 是否有直连可 `pg_dump/restore` ③ 会话层重写 |
| 最大风险 | **搬家后未必更快**。计算在新加坡、数据在上海 = 新的跨境；若要真快，需要把 Next.js 也搬进国内 |
| 成本结论 | 免费版不行；个人版 19.9 元**技术上够用但没有余量且无数据回档**；标准版 199 元才是有保障的档位 |
| 建议 | **分两步走**：先迁"数据库 + 存储（已在 COS）"，认证单独作为可暂停的第二段；并且**先解决 §1 的匿名越权漏洞和页面性能问题**——这两件事不依赖迁移，且搬家之后不会自动变好 |

---

## 九、需要腾讯云官方书面确认的 6 个问题

1. 上海地域 PG 模式是否支持**直连数据库**（提供 `postgres://` 连接串）？还是必须全程 `ExecutePGSQL` 单条执行？
2. 是否支持 `pg_dump` / `pg_restore` 全量导入？单次 SQL 体积/时长有没有上限？
3. `btree_gist`、`pgcrypto`、`uuid-ossp`、`pg_stat_statements` 能否安装？不能的话推荐替代方案？
4. **能否批量导入含 bcrypt 哈希的 `auth.users`？**（我们 84 个账号，希望用户不改密码）
5. `auth.users.id` 是 `varchar(64)`，能否允许我们把业务表的 `uuid` 列保留并建立外键？
6. `service_role` 调用 RPC 是否也受 `statement_timeout=8s` 限制？

> 这 6 条答案会直接改变 03 号报告里第二、三、四阶段的工作量和风险等级。建议在第二阶段开工**前**一次性提工单问清。
