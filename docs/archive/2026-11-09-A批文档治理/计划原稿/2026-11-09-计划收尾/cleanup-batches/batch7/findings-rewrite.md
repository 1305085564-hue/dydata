# Batch 7 核查卡：rewrite

- `useRewriteV3Logic.ts` 大部分请求使用 `/api/rewrite/*`，消息与 bootstrap 仍有 `/api/content-tools/rewrite/*`。
- `/api/rewrite/*` 有限流、契约和权限测试，适合作为主前缀。
- 两套路由均为活路径，不能删除。

## 结论

D-RW-1 采用 `/api/rewrite/*` 主路径，另一前缀保留薄转发/兼容；D-RW-2 只出目录正名方案，不改目录。
