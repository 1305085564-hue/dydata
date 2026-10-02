# 技术债台账

本表只记录当前代码能直接证明、但本轮未伪装成已完成的项目。关闭前必须补对应测试或真实运行证据。

| 项目 | 证据 | 状态 | 下一步 | 阻断级别 |
|---|---|---|---|---|
| 方案 §2.2 五条旧数字 | [Phase 0 取证清单](reference/2026-10-02-架构方案Phase0取证清单.md)；当前基线、静态代码与浏览器门禁输出 | 部分收口：3 条已撤销，2 条待核实 | 按清单补真实调用点、双账号缓存切换和 route 错误处理逐项证据 | P1 |
| `gate:maintainability` 漏检未跟踪文件与已暂存文件 | `scripts/maintainability-gate.mjs` + `scripts/maintainability-gate.test.mjs` | 已完成 | 已覆盖干净、老/新文件未暂存与已暂存五态 | P1 |
| `src/lib/topics/service.ts` 超过阻断线 | 架构基线 `structure.filesOver1000Lines` | 待施工 | 按领域拆分并保留兼容出口 | P1 |
| `src/lib/work-groups.ts`、`unified-command-hub.tsx` 超大/跨层 | 架构基线与可维护性方案 | 待施工 | 先补行为测试，再拆用例与呈现层 | P1 |
| `person-data.ts` 进程内缓存缺统一 TTL/容量指标 | `BoundedTtlCache`、按前缀失效与定向测试 | 已完成 | 后续观察真实页面命中率和淘汰率 | P1 |
| 生产 RLS、真实角色、部署 SHA/Ready、恢复演练 | 本地无法证明 | BLOCKED | 取得生产只读与真实账号验收条件后复核 | P0 |
| 全站查询数/P95/连接池真实数据 | 当前基线仅静态扫描 | 待核 | 通过 observeOperation 接入真实请求采样 | P1 |
| 选题批量导入：批次台账计数失败观测仍使用 api-logger | `src/lib/topics/import.ts` 已记录 batchId/操作/错误/requestId，待统一结果契约底座收口 | 待迁移 | 统一观测底座完成后迁移到统一结果契约 | P2 |
| 成员小队批量分配：Server Action 观测入口未收口 | 当前通过 `api-logger` 在 Server Action/领域函数记录批量结果，尚未接入统一 mutation 观测 | 待迁移 | 统一 Server Action 观测入口落地后迁移并保留结果码 | P2 |
