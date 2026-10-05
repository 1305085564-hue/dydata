# 架构基线报告（2026-10-05）

生成时间：2026-10-05T05:24:03.549Z

## 总览

- 扫描文件：1093
- 总行数：160051
- 导出数：2730
- 函数数：3398
- API route：76
- 测试文件：383

## 结构风险

| 文件 | 行数 | 导出 | 函数 |
|---|---:|---:|---:|
| src/app/(app)/dashboard/video-submit-form-v2.tsx | 2147 | 1 | 18 |
| src/app/(app)/admin/modules/modules-content-v3.tsx | 1290 | 2 | 23 |
| src/components/unified-command-hub.tsx | 1052 | 1 | 14 |
| src/components/topics-v2/TopicCreateModal.tsx | 996 | 1 | 8 |
| src/app/(app)/dashboard/history-report-edit-form.tsx | 979 | 15 | 28 |
| src/app/(app)/admin/actions.ts | 971 | 11 | 21 |
| src/app/(app)/admin/collaboration/work-group-manage-drawer.tsx | 966 | 1 | 16 |
| src/app/api/video-submit/route-core.ts | 952 | 7 | 15 |
| src/lib/topics/service.test.ts | 940 | 0 | 9 |
| src/app/(app)/admin/fulfillment/components/fulfillment-matrix-roster.tsx | 925 | 5 | 12 |

## API 与耦合

- route 错误处理覆盖率（静态 try/catch）：27.6%
- 空 catch route：0
- visibleUserIds 文本出现次数：179
- daily_reports 文本出现次数：89
- 缓存候选：220

## 页面预算（来源：docs/工程运行事实.md）

| 页面 | 首屏 | 完整加载 | 首屏业务请求 |
|---|---:|---:|---:|
| /dashboard | 2000ms | 3000ms | 15 |
| /admin/content | 2500ms | 5000ms | 20 |
| other-authenticated-pages | 2500ms | 4000ms | 20 |

运行时指标待通过真实请求采集，空数组表示没有伪造线上数据。
