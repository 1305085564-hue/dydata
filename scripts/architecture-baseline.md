# 架构基线报告（2026-10-02）

生成时间：2026-10-02T08:05:56.925Z

## 总览

- 扫描文件：893
- 总行数：143487
- 导出数：2299
- 函数数：2954
- API route：71
- 测试文件：351

## 结构风险

| 文件 | 行数 | 导出 | 函数 |
|---|---:|---:|---:|
| src/app/(app)/dashboard/video-submit-form-v2.tsx | 3259 | 1 | 31 |
| src/app/(app)/admin/modules/modules-content-v3.tsx | 2399 | 5 | 28 |
| src/lib/topics/service.ts | 1996 | 66 | 62 |
| src/components/unified-command-hub.tsx | 1934 | 3 | 17 |
| src/app/api/admin/collaboration/_shared.ts | 1637 | 53 | 63 |
| src/app/(app)/admin/content/content-list.tsx | 1530 | 1 | 13 |
| src/app/(app)/admin/content/content-detail-dialog.tsx | 1396 | 1 | 18 |
| src/app/(app)/admin/ai-config/components/bindings-client.tsx | 1347 | 0 | 9 |
| src/app/(app)/admin/collaboration/personal-card.tsx | 1104 | 1 | 6 |
| src/app/(app)/dashboard/video-submit-panel-v2.tsx | 1079 | 3 | 7 |

## API 与耦合

- route 错误处理覆盖率（静态 try/catch）：23.9%
- 空 catch route：0
- visibleUserIds 文本出现次数：166
- daily_reports 文本出现次数：89
- 缓存候选：197

## 页面预算（来源：docs/工程运行事实.md）

| 页面 | 首屏 | 完整加载 | 首屏业务请求 |
|---|---:|---:|---:|
| /dashboard | 2000ms | 3000ms | 15 |
| /admin/content | 2500ms | 5000ms | 20 |
| other-authenticated-pages | 2500ms | 4000ms | 20 |

运行时指标待通过真实请求采集，空数组表示没有伪造线上数据。
