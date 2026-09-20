# Batch 7 核查卡：video-content

- `src/lib/loaders/admin-content-page.ts` 已提供 `loadAdminContentVideoDetail`，collaboration work-video 已复用该服务。
- admin/content 与 admin/videos 仍有各自 list route、页面 DTO 和权限入口。
- `content-diagnosis-workbench.tsx` 仍存在跨 API lifecycle 请求，需要先确认服务端调用等价性。

## 结论

先做服务层 DTO/权限对账和测试；若 BLK-1/RLS 证据不足，停止 list 端点整合，只交方案。
