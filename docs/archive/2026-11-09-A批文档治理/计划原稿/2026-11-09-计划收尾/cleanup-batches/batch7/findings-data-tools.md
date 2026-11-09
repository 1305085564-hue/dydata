# Batch 7 核查卡：data-tools

- D-DB-1：生产状态机在 `src/components/submission/提交状态机.ts`；旧 hook 仍被 `video-submit-form-v2.tsx` 用于 `parseMetricFieldOrNull`，不能删除整文件。两套状态模型不兼容，先拆解析入口。
- D-DB-3：`review-queue.ts:101` 与 `content-comparison-reference.ts:120` 都有 `buildSnapshotMap`，输入类型不同，适合公共泛型加适配器。
- D-DB-4：review-queue 提供 `formatNumber/formatRate/formatDateTime`；video detail、video list、admin-ai/presentation 仍有本地版本，需逐字符对账后迁移。
- D-DB-5：错误信封三种形式并存；Topics 有 `jsonResult` 和现有契约测试，作为单域试点。观察期 claim 路径不动。

## 停止条件

状态机字段不一致处不做强制 re-export；格式输出不一致处保留本地实现并记录差异。
