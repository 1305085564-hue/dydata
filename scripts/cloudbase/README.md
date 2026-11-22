# CloudBase 脚本与目标端适配

本目录存放 CloudBase（腾讯云云托管 + CloudBase PostgreSQL）相关的发版脚本、目标端 SQL 适配、权限修复与验收夹具、离线密码导入及批次执行工具。

## 目录现有文件说明

### 1. SQL 批次执行与目标端 SQL 适配

- `sql-batches.mjs`（单测 `sql-batches.test.mjs`）：
  - `RECEIPT_SCHEMA_SQL`：初始化 `dydata_migration` 回执表结构，并撤销新函数默认的 `PUBLIC EXECUTE`。
  - `splitPostgresDump`：将 PostgreSQL SQL 文本按完整语句切分，过滤导出元命令并校验字符串/美元符/块注释闭合。
  - `packSqlBatches`：按 UTF-8 字节预算（如 512 KiB）分批并计算摘要。
  - `runBatches`：接受显式注入的目标执行器和持久回执读取器，每批业务 SQL 与回执在同一个事务内提交；`ReceiptConflictError` / `BatchExecutionError` 区分摘要冲突与执行失败。
- 目标端 SQL 适配（**不要放进 Supabase 生产迁移目录执行**）：
  - `target-permissions.sql`（测试 `target-permissions.test.mjs`）：目标端权限收口与初始团队边界。
  - `target-function-guards.sql`：恢复现有 `SECURITY DEFINER` RPC 内部调用方校验。
  - `target-auth-readers.sql`（测试 `target-auth-readers.test.mjs`）：Auth 只读适配函数（避免向 API 角色暴露 `auth.users` 凭据列）。
  - `target-auth-status.sql`（测试 `target-auth-status.test.mjs`）：独立增量函数 `cloudbase_set_auth_user_status(text, smallint, text)`，仅服务端执行以写账号状态 `1`/`3`。
  - `topic-rls-helpers.sql`：`private` schema 下的主题策略辅助函数。

执行批次的恢复原则：
- 相同批次 ID 且相同摘要的已提交回执：跳过，不重放。
- 相同 ID 但摘要不同：立即停止，不得覆盖回执。
- 请求超时或连接中断：结果未知，先查持久回执，不得盲目重试。
- 已确认回滚的批次：修复该批次后继续，不要把任意网络错误当成已回滚。

### 2. 权限修复与角色/写验收夹具

- `permission-repair.mjs`（测试 `permission-repair.test.mjs`）与 `apply-permission-repair.mjs`（测试 `apply-permission-repair.test.mjs`）：生成并按 `packSqlBatches/runBatches` 批次执行隔离环境权限与视图修复计划。
- `permission-fixtures.mjs`、`identity-baseline.mjs`（测试 `identity-baseline.test.mjs`）、`write-fixtures.mjs`、`write-acceptance.mjs`（测试 `write-acceptance.test.mjs`）：角色权限门禁与写验收使用的隔离夹具、身份基线校验和写证据采集。
- `service-key-check.mjs`（测试 `service-key-check.test.mjs`）与 `rate-limit-capacity.mjs`：服务端密钥检查与限流容量辅助脚本。

## 云托管发版与通知清理（2026-11-21）

`deploy-service.mjs` 是腾讯云上海云托管服务 `dydata` 的手动发布脚本：从已推送且干净的 `main` 打包，沿用云托管现有运行变量，只把 `NEXT_PUBLIC_*` 写进 Docker 构建参数；运行私钥不进包。先用 `git archive --format=tar` 取源码、再用系统 `zip` 保留中文路径，避免 `git archive --format=zip` 被构建机解包为 `#Uxxxx`。生成 `/deployment.json`，供默认域名查询实际提交号。该脚本只部署服务，不导出、接管或迁移数据库，不改域名和证书。

正式手动发布命令（先通过推送前门禁、构建、文档扫描并正常 push）：

```sh
CLOUDBASE_MCP_MODULE="$(find "$HOME/.npm/_npx" -path '*/@cloudbase/cloudbase-mcp/dist/index.cjs' -print -quit)" node scripts/cloudbase/deploy-service.mjs
```

依赖本机已安装的官方 `@cloudbase/cloudbase-mcp` 管理模块；凭据仍从仓库外原位置读取。执行输出只含提交号、包摘要、版本和请求号。部署完成后查默认域名 `/deployment.json` 与 `/api/health?check=cloudbase`，前者等于 `origin/main`，后者 HTTP 200 且 `checks.cloudbase.status="up"`。`git push` 不会自动发版，云托管发布须执行上面的命令。

`notifications-cleanup/index.js` 保存已部署云函数的零依赖实现：用 Node `https` 发送 GET，读取 `TARGET_URL` / `CRON_SECRET`，请求超时 35 秒；云函数总超时 60 秒。触发器 `daily-notifications-cleanup` 保留 `0 0 2 * * * *`（北京时间每日 02:00）。手动触发须确认返回 200 和日志中的 `method=GET,status=200`，不是只看部署成功。

验证：`node --test scripts/cloudbase/deploy-service.test.mjs`，覆盖中文文件名、提交号、公开参数及密钥不入包。

## 定向验证

### PG 账号冻结（2026-11-02）

`target-auth-status.sql` 是独立的 CloudBase 专用增量：只新增 `cloudbase_set_auth_user_status(text, smallint, text)`，仅服务端执行，使用项目和原 sub 精确写 status 1/3；pending/未知状态拒绝恢复，不改密码、邮箱或 UUID。应用接在原成员生命周期入口上，不新增管理权限或另一个成员管理入口。

隔离库执行沿用 `packSqlBatches/runBatches` 的持久回执，创建前要求同签名不存在；网络结果未知先查回执，不能改成盲目 `CREATE OR REPLACE`。这是目标端写适配，不并入 `target-auth-readers.sql`，不进入 Supabase 生产 migration，不把托管认证表写入推广到其他业务。

```sh
node --test scripts/cloudbase/*.test.mjs
npx tsx --test 'src/lib/cloudbase/*.test.ts' 'src/app/api/cloudbase/**/*.test.ts'
npm run gate:static
```

本地测试不能替代真实 JWT 网关和角色验收；开发环境耗时不能作为生产性能结论。

## 密码哈希导入工具（`auth-import.mjs`）

`auth-import.mjs`（测试 `auth-import.test.mjs`）是离线生成器，不连接数据库、不读取生产凭据、不自动执行 SQL。只支持上海目标环境及已核实的 `$2a$10$` 格式，账号按 PG 注册用户 `type=external` 导入（管控 API 对应显式 `externalUser`，不是组织成员 `internalUser`）：UUID 写 `sub`，密码按 UTF-8 转 base64（80 字符、无换行），封禁状态按明确的采样时间映射。来源必须显式带邮箱确认时间：值为 null 的身份保留未激活（status=2、email_verified=false）；有效确认时间才标记邮箱已验证。未来封禁优先保留 status=3；邮箱确认或封禁字段缺失、undefined 或时间非法会拒绝计划。完整模式要求 84 个唯一来源身份；指定 `sampleIds` 才生成样本计划。

- `buildAuthImportPlan({sourceUsers,targetIdentities,capturedAt,project,sampleIds?})` 返回 `summary`、敏感 `batches` 和执行前置条件。只可打印 `summary`；SQL、expectedRows、原始哈希均按密码资料保存到 Git 之外的 700 目录、600 文件。
- 计划每批最多 50 条：独立事务内锁表、再次查身份冲突、插入、`RETURNING id::text,sub`。
- 内部 bigint ID 必须保留十进制字符串，不能转换为 JavaScript Number。执行方须持久保存完整 RETURNING 结果、计划/批次摘要、RequestId，再继续下一批。网络结果不明时停止核对，不能盲重试。
- `buildAuthImportRollback(plan,insertedReceipts)` 只有收到完整、与计划绑定的真实批次回执才生成回退 SQL。

关于 2026-11-01 隔离导入与后续线上切换事实见[上线与运维](../../docs/reference/上线与运维.md#现行-部署)。
