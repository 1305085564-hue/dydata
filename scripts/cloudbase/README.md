# CloudBase 隔离迁移工具

仅用于明确指定的 CloudBase 隔离环境。这里没有生产库迁移入口，不会自动切换网站。

## 文件与执行顺序

1. 使用 `pg_dump --format=custom --serializable-deferrable` 对来源库做一致性只读导出。分别用同一归档生成 schema 与 COPY 数据；不要把不同时间的逐表导出混在一起。
2. `splitPostgresDump` 识别完整 SQL 语句；`adaptSchemaStatement` 转换 `auth.uid()` 的 UUID 使用、根身份外键与 profiles 子外键。未处理的 auth 引用必须人工核实，不能忽略失败。
3. 在目标初始化 `RECEIPT_SCHEMA_SQL`，撤销新函数默认的 PUBLIC EXECUTE。按表/函数等前置对象、数据、约束/索引/触发器/策略的顺序导入。主题策略还依赖 `topic-rls-helpers.sql` 的四个 private 函数，须在策略前导入。
4. `copyDumpToStatements` 将同归档的 COPY 文本转换为 INSERT，保留 NULL、转义、数组、JSON、identity 与序列状态。生成列不作为普通列插入。
5. `packSqlBatches` 按 UTF-8 字节分批；本次使用 512 KiB。`runBatches` 接受显式注入的目标执行器和持久回执读取器，每批的业务 SQL 与回执在同一个事务内提交。每次调用独立完成，不使用跨请求会话或临时表。
6. 数据完成后执行 `target-permissions.sql`、`target-function-guards.sql`、`target-auth-readers.sql`。这些是目标端适配，**不要放进 Supabase 生产迁移目录执行**。
7. 用 `data-reconciliation.mjs` 对同一归档与目标实际类型做逐表数量和两组摘要对账。补充同参数 RPC 结果对比、真实 JWT 和网站角色测试。

执行器必须保存 RequestId、批次 ID、SQL 摘要、成功/失败与恢复状态。不要把 SQL 正文、业务行、账号密码或令牌写入公开日志。实际执行时的导出、驱动脚本和完整回执在私有执行包中，位置见本次执行报告。

## 重试与恢复

- 相同批次 ID 和相同摘要的已提交回执：跳过，不重新 INSERT。
- 相同 ID、不同摘要：停止；使用新的迁移编号，不能覆盖回执。
- 请求超时或连接中断：结果未知，先读取持久回执；没有确定结果时不得盲目重试。
- SQL 错误且平台已确认批次回滚：只修该批次，重新验证后继续。不要把任意网络错误当成已回滚。
- 前置结构批次、后置约束批次同样走回执。数据库之外的副作用不能由此事务保证。

本次业务快照已导入并完成对账。测试账号、操作日志等后续验证数据是额外数据；不能再把原始快照行数直接当成当前目标总行数。重复验证不得删除历史业务表或覆盖已导入数据。

## 回退

本轮生产没有切换，无需生产回滚。隔离库的错误批次在事务内回滚；已提交批次不提供通用 DROP/CASCADE 逆操作。若需要重建，须另行授权使用明确的新隔离库，并从私有一致性归档恢复。当前隔离库中的业务数据不应自动清空。

网站默认仍走 Supabase。测试构建同时设置 `DYDATA_BACKEND=cloudbase` 和 `NEXT_PUBLIC_DYDATA_BACKEND=cloudbase`，并配置同一目标环境 ID。回到旧后端需要恢复两项开关并重新构建，不能仅修改运行时变量。生产切换与最后增量同步须单独授权。

## 定向验证

```sh
node --test scripts/cloudbase/*.test.mjs
npx tsx --test 'src/lib/cloudbase/*.test.ts' 'src/app/api/cloudbase/**/*.test.ts'
npm run gate:static
```

本地测试不能替代真实 JWT 网关和角色验收；开发环境耗时不能作为生产性能结论。

## 密码哈希导入计划（2026-11-01 补充）

`auth-import.mjs` 是离线生成器，不连接数据库、不读取生产凭据、不自动执行 SQL。只支持当前上海隔离环境及已核实的 `$2a$10$` 格式：UUID 写 `sub`，密码按 UTF-8 转 base64（80 字符、无换行），封禁状态按明确的采样时间映射。来源必须带邮箱确认时间；未确认或缺少确认信息的选中身份会拒绝计划，避免误激活。完整模式要求 84 个唯一来源身份；指定 `sampleIds` 才生成样本计划。

- `buildAuthImportPlan({sourceUsers,targetIdentities,capturedAt,project,sampleIds?})` 返回 `summary`、敏感 `batches` 和执行前置条件。只可打印 `summary`；SQL、expectedRows、原始哈希均按密码资料保存到 Git 之外的 700 目录、600 文件。
- 计划每批最多 50 条：独立事务内锁表、再次查身份冲突、插入、`RETURNING id::text,sub`。目标没有 sub/email 唯一约束，必须另行控制所有 Auth 写入口，禁止把离线查重当成并发保障。重复直接执行会拒绝，不是静默跳过或覆盖。
- 内部 bigint ID 必须保留十进制字符串，不能转换为 JavaScript Number。执行方须持久保存完整 RETURNING 结果、计划/批次摘要、RequestId，再继续下一批。网络结果不明时停止核对，不能盲重试。
- `buildAuthImportRollback(plan,insertedReceipts)` 只有收到完整、与计划绑定的真实批次回执才生成回退 SQL。收据格式为 `{batchIndex,planSha256,batchSha256,rows:[{id,sub}]}`。按实际内部 ID、sub、project 及原映射字段保护，不删除外来相同行；字段已变化则保留并人工处理。此模板不等于完整的平台 Auth/Token 回退。
- 当前未提供全量执行命令。批量导入还需确认用户配额、授权及未公开格式的支持风险。不得通过直接 SQL 新增身份绕过套餐限制，不得复制 Supabase 会话/JWT 密钥或强制重置密码。

项目现有两个 Supabase 测试账号已实际验证原哈希转换后保留原密码、UUID、RLS 隔离和封禁行为；验证后 CloudBase 两个冒烟账号已恢复。详见 `docs/reference/2026-11-01-认证密码迁移独立复核.md`。该结果不构成腾讯官方长期支持承诺。
