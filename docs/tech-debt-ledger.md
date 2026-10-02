# 技术债台账

本表只记录当前代码能直接证明、但本轮未伪装成已完成的项目。关闭前必须补对应测试或真实运行证据。

| 项目 | 证据 | 状态 | 下一步 | 阻断级别 |
|---|---|---|---|---|
| `src/lib/topics/service.ts` 超过阻断线 | 架构基线 `structure.filesOver1000Lines` | 待施工 | 按领域拆分并保留兼容出口 | P1 |
| `src/lib/work-groups.ts`、`unified-command-hub.tsx` 超大/跨层 | 架构基线与可维护性方案 | 待施工 | 先补行为测试，再拆用例与呈现层 | P1 |
| `person-data.ts` 进程内缓存缺统一 TTL/容量指标 | 代码盘点 | 待施工 | 迁移到 `BoundedTtlCache` 并补浏览器回归 | P1 |
| 生产 RLS、真实角色、部署 SHA/Ready、恢复演练 | 本地无法证明 | BLOCKED | 取得生产只读与真实账号验收条件后复核 | P0 |
| 全站查询数/P95/连接池真实数据 | 当前基线仅静态扫描 | 待核 | 通过 observeOperation 接入真实请求采样 | P1 |
| 选题批量导入：批次台账计数失败观测仍使用 api-logger | `src/lib/topics/import.ts` 已记录 batchId/操作/错误/requestId，待统一结果契约底座收口 | 待迁移 | 统一观测底座完成后迁移到统一结果契约 | P2 |
