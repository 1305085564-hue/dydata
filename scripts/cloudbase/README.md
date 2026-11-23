# CloudBase 运维与发版脚本

本目录存放腾讯云 CloudBase（上海云托管 `dydata` + CloudBase PostgreSQL）的现役发版、设置项对账、数据库备份恢复、定时清理函数与验收夹具脚本。原一次性割接脚本（`target-*.sql`、`auth-import`、`permission-repair`、`sql-batches`、`service-key-check`）已于 2026-11-23 第四批清理。

## 目录现役文件说明

### 1. 发版与线上设置项对账

- `deploy-service.mjs`（单测 `deploy-service.test.mjs`）：腾讯云上海云托管服务 `dydata` 的手动发布脚本。
  - 发版前自动校验：① 工作区干净且处于已推送的 `main`；② 推送前门禁通过标记 `dydata-gate-pass` 等于当前 `HEAD`；③ 调用 `check-env-vars.mjs` 确认云托管环境变量已覆盖 `.env.example` 全部 `[必填]` 项。
  - 用 `git archive --format=tar` + 系统 `zip` 保留中文路径，只把 `NEXT_PUBLIC_*` 写进 Dockerfile 构建参数（私钥不进包），并写入 `/deployment.json`。
- `check-env-vars.mjs`（单测 `check-env-vars.test.mjs`）：只读对账脚本，仅读取云托管 `dydata` 的环境变量**名称**（绝不读取或打印值），对照 `.env.example` 列出「代码必填但线上没配（阻断）」与「线上配了但代码不读」。

### 2. 正式库只读导出与本机恢复演练

- `db-backup-core.mjs`、`db-export.mjs`（单测 `db-export.test.mjs`）：正式库只读全量导出到 `~/.local/share/dydata/db-export/`。
- `db-restore-local.mjs`（单测 `db-restore-local.test.mjs`）、`db-restore-schema.mjs`：在本机临时 Docker Postgres 中恢复导出备份并逐表校验行数。

### 3. 定时云函数与验收工具

- `notifications-cleanup/index.js`：每日北京时间 02:00 触发的过期通知清理云函数（触发器 `daily-notifications-cleanup`，cron `0 0 2 * * * *`）。
- `permission-fixtures.mjs`、`identity-baseline.mjs`（单测 `identity-baseline.test.mjs`）、`write-fixtures.mjs`、`write-acceptance.mjs`（单测 `write-acceptance.test.mjs`）：角色权限门禁与写验收夹具。
- `rate-limit-capacity.mjs`：限流本地多进程容量校验脚本。

## 云托管发版与通知清理（2026-11-21）

正式手动发布命令（先通过推送前门禁、构建、文档扫描并正常 push）：

```sh
# 可单独先跑只读环境变量对账
node scripts/cloudbase/check-env-vars.mjs

# 正式发版
CLOUDBASE_MCP_MODULE="$(find "$HOME/.npm/_npx" -path '*/@cloudbase/cloudbase-mcp/dist/index.cjs' -print -quit)" node scripts/cloudbase/deploy-service.mjs
```

部署完成后查 `https://dydata.cc/deployment.json` 与 `https://dydata.cc/api/health?check=cloudbase`，回滚步骤见[上线与运维](../../docs/reference/上线与运维.md#现行-部署)。

```sh
node --test scripts/cloudbase/*.test.mjs
npx tsx --test 'src/lib/cloudbase/*.test.ts' 'src/app/api/cloudbase/**/*.test.ts'
```
