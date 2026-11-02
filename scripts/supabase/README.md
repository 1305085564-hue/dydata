# Supabase 批次 A 隔离演练

只处理已审阅的 31 个函数，权限为 **R11 / S15 / O5**；排行榜保留员工会话调用。批次 B、网站部署、三张历史台账、生产业务数据与 Auth 账号均不在范围内。

- `batch-a-guards.sql`：四个内部守卫，复用现有 `has_permission` / `is_owner`。入团只接受在职、无团队归属的普通成员。
- `batch-a-reviewed-source.mjs`：历史只读审计的31项定义摘要、角色和原路径。新的来源不一致时拒绝生成，不自动接受新快照覆盖审阅基线。
- `permission-batch-a.mjs`：纯生成器，不建立数据库连接。正向和回滚均为单事务，3秒锁超时、60秒语句超时；检查完整元数据与依赖摘要。回滚精确恢复原定义、owner、ACL及路径，并校验结果。
- `prepare-permission-rehearsal.mjs`：新建独立本地 Supabase，只恢复历史 DDL 和权限，补齐 btree_gist 与4个 private 辅助函数；不读取数据 dump、真实用户或生产凭据。
- `rehearse-permission-batch-a.mjs`：真实 Auth 登录令牌经本地网关验证守卫、7表策略和触发链；注入失败、漂移硬停、精确回滚、重复执行。初始 Auth 必须为0；结束删除本轮自建身份并对99张表逐表断言为空。
- `rehearse-permission-pages.mjs`：在主线代码的隔离副本检查3种角色，修复前后逐项对比页面和API；从成员管理页面实际审批首次入团。全部浏览器请求限制本地地址。

所有运行器只接受 `/tmp/dydata-supabase-batch-a-*`，使用该目录配置对应的自有 Docker 容器和 localhost HTTP 地址；没有远端执行模式。全表清理只用于入口硬断言为空、由本轮创建的独立本地项目，不可移植到共享测试库。

## 复跑

先指定新的私有临时目录、历史只读结构快照目录（包含 `schema.sql`、`catalog.json`、`acl_snapshot.json`、`private-catalog.json`）和空闲端口55800–55999，端口之后六位也需空闲。环境准备和验证命令如下，完整证据写入临时目录：

```sh
DYDATA_BATCH_A_LOCAL_DIR=/tmp/dydata-supabase-batch-a-<独立运行名> DYDATA_BATCH_A_SOURCE_DIR=<结构快照目录> DYDATA_BATCH_A_API_PORT=55841 node scripts/supabase/prepare-permission-rehearsal.mjs
DYDATA_BATCH_A_LOCAL_DIR=/tmp/dydata-supabase-batch-a-<独立运行名> node scripts/supabase/rehearse-permission-batch-a.mjs
node --test scripts/supabase/permission-batch-a.test.mjs
```

页面演练另需用 `git archive <已核实主线提交>` 创建**无 `.env` 的代码副本**，仅为其链接当前仓库的 `node_modules`。然后设置 `DYDATA_BATCH_A_LOCAL_DIR`、`DYDATA_BATCH_A_APP_DIR`（同样位于上述私有临时目录）、`DYDATA_BATCH_A_APP_SHA`，运行 `node scripts/supabase/rehearse-permission-pages.mjs`。使用3389端口，独立副本自行构建开发产物，不写当前仓库的 Next.js 产物。只向子进程传入本地 Supabase 配置，所有服务端生产密钥、COS、飞书和 AI 环境变量均不继承。

失败即保留原记录；不得将原 FAIL 改写 PASS。调查后恢复自建库、精确清理自建身份，再启动新的完整运行。成功后关闭本轮私有项目，保留 Docker 卷和证据，不使用 `stop --all` 或 `--no-backup`。

## 生产边界

演练 SQL 绑定的是**本地**快照，不可直接投产。生产执行前必须另获仅批次 A 的正向及必要回滚授权，读取新鲜只读快照并与已审阅定义、ACL及辅助依赖核对；漂移即停止。先备份恢复点，再从新鲜快照生成绑定包，不得把更换快照当作接受漂移。不在生产执行这些清理、角色写入或故障注入脚本。回滚将重新开放原风险权限，仅为故障恢复，不是安全终态。

本轮证据：[隔离演练](../../docs/reference/2026-11-02-生产Supabase批次A隔离演练.md)。
