# Batch 7 核查卡：permission

## 当前事实

- `src/lib/permission-contract.ts:41-113` 是角色权限和数据范围契约。
- `src/lib/company-permissions.ts:96-119` 是固定权限实现；`permission-utils.ts:4-20` 只是兼容转发。
- `src/lib/route-permissions.ts:31-43` 是路由权限唯一表；`analytics-access.ts:54-59` 已是薄包装。
- `src/lib/analytics-access.ts:78-84` 的 `restrictPersonRows` 仍按角色解析后直接放行，需要改为固定权限键。
- `src/lib/data-access-scope.ts:54-75` 的 `inferDataScope` 已忽略 `data_scope`，范围仍以角色、company_role、groupMode 为准。
- `requireAdminActor` 已集中管理端鉴权；其他 helper 分布在 `app/api/production/_shared.ts`、Topics `_shared.ts` 和 admin `_shared.ts`。

## 结论

- D-PERM-1：现状主体已收口，保留 `permission-utils` 兼容门面；补架构断言，不重造入口。
- D-PERM-2：可施工，仅改 `restrictPersonRows` 的授权判定并补回归测试。
- D-PERM-3：分两步试点，不一次性迁移全部 helper。
- D-PERM-4：`dashboard-data-scope`、Topics team scope、operator-members 有特殊语义；本批只登记和替换可等价路径。

## 停止条件

不改 migration、RLS、观察期 claim 路径或外部触发入口；若鉴权快照不足以证明语义，停止对应子项。
