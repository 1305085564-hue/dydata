# Batch 7 核查卡：topics

- 员工端在 `src/app/api/topics/*`，管理端在 `src/app/api/admin/topics-library/*`；管理端已有 `guard.test.ts`，员工端已有 membership guard 测试。
- `src/lib/topics/service.ts` 与 `src/lib/topics/v2-client-contract.ts` 已将 `candidateCount/scriptingCount` 映射为 `writing` 的兼容键。
- `claim` 路径处于观察期，禁止改调用路径。

## 结论

- D-TPC-1：补边界契约和越权测试，不重排路由。
- D-TPC-2：前端内部向 `inProgressCount/writing` 收口，外部旧键继续保留。
- D-TPC-4：只出目录正名方案。
- D-DB-5：Topics 作为错误信封试点，仅迁移非观察期接口。
