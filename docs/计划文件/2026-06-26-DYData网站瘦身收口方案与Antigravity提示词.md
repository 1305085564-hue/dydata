# DYData 网站瘦身收口方案与 Antigravity 执行提示词

本次目标不是重新设计网站，而是把 DYData 收回到少数高频主线：员工填报、团队管理、内容批改、素材/发布履约、导粉/违规复盘。凡是不能明显服务这几条主线的入口，优先下线或隐藏。

当前最大问题不是页面多，而是产品线已经开始分叉。`/demo` 是销售演示线，`/yike` 是个人行动台线，`/admin/ai-*` 是 AI 运维线，`/admin/advice`、`/admin/guidance`、`/admin/market` 是历史分析/建议线。这些线都可能有价值，但它们会让主站从“抖音数据日报平台”变成一个混合工具箱。

根据最新口径，本次收口先按四类处理：

1. 演示站直接删除。它只是公开模拟站，不再承担当前网站目标。
2. 此刻从 DYData 主项目切割出去。当前网站不再做此刻，但代码要保留到独立备份位置，方便以后单独做。
3. 已拍板的低频页直接删除：AI 管理助手、市场环境管理、旧转化中心、旧违规后台入口、旧 AI 改写入口。
4. 其他低频页面继续观察。先分清“有入口但低频”“无入口但线上可访问”“本地有代码但只做兼容跳转”，再决定下一刀。

## 扫描依据

本轮只做方案，不删代码。扫描范围包括：

- 公共首页：`src/app/page.tsx`
- 业务路由：`src/app/(app)/**/page.tsx`
- 演示站路由：`src/app/demo/**`
- 主导航：`src/components/nav-bar-items.ts`、`src/components/nav-bar-client.tsx`
- 管理后台导航：`src/components/admin-layout/admin-top-nav.tsx`、`src/components/admin-secondary-nav.tsx`
- 权限与中间件：`src/lib/analytics-access.ts`、`src/middleware.ts`
- 此刻模块：`src/app/(app)/yike`、`src/app/api/yike`、`src/lib/yike`、`src/components/yike`、`src/styles/components/yike.css`
- 数据库迁移：`supabase/migrations/*yike*`、`*demo*`、`*market*`、`*advice*`、`*conversion*`

线上轻探测显示：`/demo/dashboard`、`/demo/admin` 可公开访问；`/yike`、`/dashboard`、`/admin/*` 受中间件拦截或清缓存跳转影响；`/growth`、`/violations`、`/video-review` 虽然页面自身会做登录判断，但不在 middleware 保护列表内，收口时应统一补齐保护边界。

## 页面资产盘点

| 分组 | 页面/模块 | 当前状态 | 处理建议 |
|---|---|---|---|
| 核心保留 | `/dashboard` | 员工日报填报主入口 | 保留 |
| 核心保留 | `/admin/content` | 管理端批改台 | 保留 |
| 核心保留 | `/admin/videos` | 素材库和视频资产管理 | 保留 |
| 核心保留 | `/admin/analytics` | 经营分析 | 保留 |
| 核心保留 | `/admin/fulfillment` | 发布履约 | 保留 |
| 核心保留 | `/violations`、`/violations/submit`、`/violations/[id]` | 导粉/违规/转化复盘主线 | 保留，但补 middleware 登录保护 |
| 核心保留 | `/video-review`、`/video-review/submit`、`/video-review/manage` | 视频审核与已发案例 | 暂保留，但补 middleware 登录保护 |
| 暂保留观察 | `/growth` | 员工个人成长页 | 暂保留；若后续继续瘦身，可并入 `/dashboard` |
| 直接删除 | `/demo`、`/demo/dashboard`、`/demo/growth`、`/demo/admin/**` | 线上公开演示站 | 删除页面、组件、演示数据和入口 |
| 直接删除 | `src/components/demo/**`、`src/lib/demo-data.ts` | 演示站专用组件和模拟数据 | 随演示站一起删除 |
| 直接删除 | `/admin/ai-assistant` | AI 管理助手，管理者低频工具 | 删除页面和专用入口；若有底层日志/接口依赖，先确认无其他页面调用 |
| 直接删除 | `/admin/market` | 市场环境管理 | 删除页面和入口；如果增长页仍依赖市场数据，先断开依赖再删 |
| 直接删除 | `/admin/conversion-hub`、`/admin/conversion-hub/analytics`、`/admin/conversion-hub/weekly` | 旧转化中心 | 删除旧页面和旧跳转；当前导粉/转化主线保留在 `/violations` |
| 直接删除 | `/admin/violations` | 旧违规后台入口 | 删除旧入口；保留正式 `/violations` 导粉中心 |
| 直接删除 | `/admin/ai-rewrite` | 旧 AI 改写入口 | 删除旧入口；不要误删 AI 渠道配置页 |
| 切割保留 | `/yike`、`/api/yike/**`、`src/lib/yike/**`、`src/components/yike/**`、`src/styles/components/yike.css` | 此刻个人行动台，已是独立产品线 | 从主项目移除，但先保存到独立归档位置 |
| 低频候选 | `/content-tools`、`/content-tools/rewrite` | AI 文案助手 | 先确认是否有人用；不用则下线 |
| 低频候选 | `/admin/ai-channels` | AI 渠道配置 | 配置能力可能影响线上 AI 调用，暂不随旧 AI 改写入口删除 |
| 低频候选 | `/admin/advice` | 转化建议队列 | 不在主导航，疑似历史分支；候选删除 |
| 低频候选 | `/admin/guidance` | 转化指导 | 和增长/分析重叠；候选删除 |
| 兼容跳转 | `/admin` | 自动跳 `/admin/content` | 保留 |
| 系统保留 | `/login`、`/register`、`/forgot-password`、`/reset-password` | 登录注册密码流程 | 保留，但删除里面的演示站链接 |
| 系统保留 | `/admin/settings`、`/admin/modules` | 系统设置、成员团队管理 | 保留，仅管理者可见 |

当前没有发现“只有本地有页面文件、线上完全 404”的静态页面；更准确的问题是“代码已上线，但很多页面没有主导航入口，属于低频直达页或历史兼容页”。这些页面如果继续留着，用户不一定看得到，但维护成本和权限边界仍然存在。

## 收口原则

第一，首页只保留一个明确动作：登录工作台。演示站、此刻、一刻这类分支入口都不再放在首页。

第二，登录后主导航只保留真实高频工作流。对员工来说是“今日工作台、个人成长、导粉中心、视频审核”。对管理者来说，管理入口统一归到内容中心，不再把多个历史分支散在一级导航。

第三，后台只保留管理者每天会用的页。当前后台中心导航已经收敛到“批改台、素材库、经营分析、发布履约”，这是比较合理的骨架。优先保这四个。

第四，低频但有数据风险的模块先隐藏入口，再清代码，最后考虑数据库。不要第一刀就 drop 表。旧 migration 不能改，真要清库只能新增 migration。

第五，所有删减必须带回归检查：登录、日报提交、管理后台、批改台、导粉中心、视频审核、权限跳转不能受影响。

## 页面处置建议

| 模块 | 路径/文件 | 判断 | 建议动作 |
|---|---|---|---|
| 公共首页演示入口 | `src/app/page.tsx` 的 `/demo` 按钮 | 低频，且会分散正式登录 | 删除按钮 |
| 公共首页此刻入口 | `src/app/page.tsx` 的 `/yike` 按钮 | 已偏离 DYData 主线 | 删除按钮 |
| 演示站 | `src/app/demo/**`、`src/components/demo/**`、`src/lib/demo-data.ts` | 维护成本高，且公开可访问 | 直接删除；如担心外部旧链接，可只保留 `/demo` 到首页的极简 redirect |
| 此刻/一刻 | `/yike`、`/api/yike/**`、`src/lib/yike/**`、`src/components/yike/**`、`src/styles/components/yike.css` | 独立产品线，不再适合主站 | 先归档到主项目外，再从 DYData 主项目移除活跃代码 |
| AI 文案助手 | `/content-tools/rewrite`、`src/components/content-tools/**` | 可能有用，但不是数据日报核心 | 先从主导航移除；如团队不用，再第二阶段删除 |
| AI 管理助手 | `/admin/ai-assistant` | owner/管理者低频运维工具 | 直接删除 |
| AI 渠道配置 | `/admin/ai-channels` | owner 低频配置页 | 暂保留，避免影响线上 AI 调用 |
| 旧 AI 改写入口 | `/admin/ai-rewrite` | 旧跳转入口 | 直接删除 |
| 转化建议 | `/admin/advice` | 不在主导航，历史功能感强 | 若无真实使用，重定向到 `/admin/content` 或删除页面 |
| 转化指导 | `/admin/guidance` | 不在主导航，和个人成长/经营分析重叠 | 若无真实使用，重定向到 `/admin/analytics` 或删除页面 |
| 市场环境管理 | `/admin/market`、`market_context_daily` | 对日报主流程不是必需 | 直接删除页面；数据库等确认依赖后再处理 |
| 旧转化中心后台 | `/admin/conversion-hub`、`/admin/conversion-hub/analytics`、`/admin/conversion-hub/weekly` | 已迁到 `/violations` 导粉中心 | 直接删除旧页面 |
| 旧违规后台入口 | `/admin/violations` | 旧跳转入口 | 直接删除，正式入口是 `/violations` |
| 素材库 | `/admin/videos` | 批改与内容复盘基础设施 | 保留 |
| 发布履约 | `/admin/fulfillment` | 管理者高频检查 | 保留 |
| 批改台 | `/admin/content` | 当前核心后台页 | 保留 |
| 经营分析 | `/admin/analytics` | 管理决策主线 | 保留 |
| 导粉中心/违规 | `/violations/**` | 内容团队核心复盘与转化线 | 保留 |
| 视频审核 | `/video-review/**` | 与素材和发布链路有关 | 保留，除非你明确不用 |
| 个人成长 | `/growth` | 员工反馈闭环 | 暂保留；若团队不用，再并入今日工作台 |

## 推荐分阶段

第一阶段：先完成页面资产账。按上表确认哪些删、哪些切割、哪些保留。不直接动数据库。确认后，演示站进入直接删除清单；此刻进入切割归档清单。

第二阶段：入口收口和路由保护。删除首页、登录页、注册页里的演示站入口；删除首页和导航里的此刻入口；middleware 保护范围补齐 `/growth`、`/violations`、`/video-review`、`/content-tools`。

第三阶段：演示站删除 + 此刻切割。演示站直接从主项目删除；此刻先保存到独立归档位置，再从 DYData 主项目删除活跃入口、页面、API、组件、样式和测试。推荐归档方式是单独 Git 分支或独立目录，不建议在主项目里长期留一个 `archive/yike`，否则主项目仍然臃肿。

第四阶段：删除已拍板低频页。删除 `/admin/ai-assistant`、`/admin/market`、`/admin/conversion-hub/**`、`/admin/violations`、`/admin/ai-rewrite`。`/admin/ai-channels` 暂保留，因为它可能是 AI 调用配置，不等于旧 AI 改写入口。

第五阶段：继续观察剩余低频模块。处理 `/admin/advice`、`/admin/guidance`、`/content-tools/rewrite`。先确认真实使用，再决定隐藏、重定向或删除。

第六阶段：数据库与 API 减负。只有在确认功能不用后才新增 migration 清理表或停用 API。不要改旧 migration。优先删除无入口 API，再考虑数据库表归档或 drop。`yike_` 表建议至少保留一个版本周期，避免误删个人数据。

## 保留后的目标信息架构

公共区：

- `/`：极简首页，只说明 DYData 是抖音团队数据日报平台，只放“登录工作台”。
- `/login`、`/register`、`/forgot-password`、`/reset-password`：保留。

员工区：

- `/dashboard`：今日填报和个人当日数据。
- `/growth`：个人成长，若后续继续瘦身，可并入 `/dashboard`。
- `/violations`：导粉中心，承接违规/转化复盘。
- `/video-review`：视频审核与已发案例。

管理区：

- `/admin/content`：批改台。
- `/admin/videos`：素材库。
- `/admin/analytics`：经营分析。
- `/admin/fulfillment`：发布履约。
- `/admin/settings`、`/admin/modules`：系统和成员管理，仅管理者可见。

## Antigravity 执行提示词

你在 `/Users/mac/Projects/dydata` 仓库工作。目标是做 DYData 网站瘦身收口，不做视觉重构，不改产品文案风格，不碰线上 `.env`，不改旧 migration。请先读 `AGENTS.md` 和本方案文档：`docs/plans/2026-06-26-DYData网站瘦身收口方案与Antigravity提示词.md`。

这段提示词等确认后再执行。执行范围是：删除演示站、切割此刻、删除已拍板低频页、收口入口和路由保护；不删除数据库表，不 drop 表，不重构核心业务。

具体任务：

1. 公共首页 `src/app/page.tsx` 删除“先看演示站”和“此刻”两个入口，只保留“登录工作台”。如果有与演示站/此刻直接相关的首页展示文案，也一起删掉，但不要重做整页设计。
2. 主导航 `src/components/nav-bar-items.ts`、`src/components/nav-bar.tsx`、`src/components/nav-bar-client.tsx` 移除此刻入口和 `showYike` 相关传参。保留今日工作台、个人成长、导粉中心、视频审核、内容中心。文案助手是否保留先按现状保留，除非发现它只靠主导航露出且用户明确不用。
3. 直接删除演示站：删除 `src/app/demo/**`、`src/components/demo/**`、`src/lib/demo-data.ts` 和登录/注册/首页里的演示站链接。若删除后存在必要的旧链接兼容，只保留 `/demo` 到 `/` 的极简 redirect，不保留任何演示页面。
4. 切割此刻：先把 `/yike`、`/api/yike/**`、`src/lib/yike/**`、`src/components/yike/**`、`src/styles/components/yike.css`、相关测试和迁移清单整理到独立归档位置或独立 Git 分支；确认归档后，从 DYData 主项目移除活跃入口、页面、API、组件、样式和测试。数据库表先不删。
5. 删除已拍板低频页：删除 `/admin/ai-assistant`、`/admin/market`、`/admin/conversion-hub/**`、`/admin/violations`、`/admin/ai-rewrite` 对应页面、专用组件、专用 API 调用和导航/设置入口。不要误删 `/admin/ai-channels`。
6. `src/middleware.ts` 的 protected route 范围补齐 `/growth`、`/violations`、`/video-review`、`/content-tools`，确保未登录访问这些业务页会跳转 `/login?next=...`。不要影响 `/demo` 的下线重定向。
7. 登录后回跳逻辑里如果有 `/yike` 特例，改为 `/dashboard`。相关测试同步更新。
8. 清理因移除入口产生的 TypeScript 未使用 import、未使用函数、测试断言。
9. 不处理数据库，不删除 `yike_` 表，不删除旧 migration，不改 Supabase 环境变量。

验收标准：

- 未登录访问 `/dashboard`、`/growth`、`/violations`、`/video-review`、`/content-tools/rewrite` 都跳转登录，并保留 next。
- 访问 `/demo`、`/demo/dashboard`、`/demo/admin` 不再显示演示站；除兼容 redirect 外，不再存在演示页面。
- 首页只剩“登录工作台”一个主动作。
- 登录后主导航不再出现“此刻”。
- `/yike` 不再进入此刻页面；此刻代码已在主项目外有可恢复归档。
- `/admin/ai-assistant`、`/admin/market`、`/admin/conversion-hub/**`、`/admin/violations`、`/admin/ai-rewrite` 不再作为可访问业务页面存在。
- `/admin/ai-channels` 不被误删。
- `npm run lint`、`npm run typecheck` 或项目现有等价检查通过；如果命令不存在，说明实际替代命令和结果。

禁止事项：

- 不做 UI 重构。
- 不删除数据库表。
- 不改旧 migration。
- 不改线上 `.env`。
- 不把 remote 改成 HTTPS。
- 不顺手清理无关历史文件。

如果还要继续清后台低频模块，单独开下一轮，不要混在同一个提交里。
