# 架构基线报告（2026-10-28）

生成时间：2026-10-28T11:32:10.306Z

## 总览

- 扫描文件：1225
- 总行数：183056
- 导出数：3057
- 函数数：3905
- API route：86
- 测试文件：434

## 结构风险

| 文件 | 行数 | 导出 | 函数 |
|---|---:|---:|---:|
| src/app/(app)/dashboard/video-submit-form-v2.tsx | 1364 | 1 | 11 |
| src/components/unified-command-hub.tsx | 1236 | 1 | 16 |
| src/app/api/admin/ai-config/ai-config.behavior.test.ts | 1131 | 0 | 22 |
| src/app/api/admin/ai-config/route.ts | 1104 | 6 | 31 |
| src/app/(app)/admin/modules/modules-content-v3.tsx | 1002 | 2 | 19 |
| src/components/topics-v2/TopicCreateModal.tsx | 996 | 1 | 8 |
| src/lib/topics/service.test.ts | 992 | 0 | 11 |
| src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx | 989 | 1 | 15 |
| src/app/api/admin/collaboration/_shared.test.ts | 971 | 0 | 2 |
| src/app/(app)/admin/collaboration/work-group-manage-drawer.tsx | 966 | 1 | 17 |

## API 与耦合

- route 错误处理覆盖率（静态 try/catch）：32.6%
- 空 catch route：0
- visibleUserIds 文本出现次数：187
- daily_reports 文本出现次数：94
- 缓存候选：276

## 页面预算（来源：docs/系统架构与设计/工程运行事实.md）

| 页面 | 首屏 | 完整加载 | 首屏业务请求 |
|---|---:|---:|---:|
| /dashboard | 2000ms | 3000ms | 15 |
| /admin/content | 2500ms | 5000ms | 20 |
| other-authenticated-pages | 2500ms | 4000ms | 20 |

运行时指标待通过真实请求采集，空数组表示没有伪造线上数据。
