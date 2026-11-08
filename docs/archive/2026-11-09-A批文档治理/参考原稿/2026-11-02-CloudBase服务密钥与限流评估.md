# CloudBase 服务密钥与限流评估

日期：2026-11-02。范围：CloudBase 服务端 API Key 的官方创建/有效期/轮换依据，DYData 当前 API 与页面限流覆盖，以及 84 人场景的本地证据。**本次平台操作只读，另有本地限流实验；没有创建、轮换或吊销密钥，没有创建实际提醒，没有调用密钥创建/删除及CloudBase管理SQL写API，没有改生产、部署或 push。**

## 结论与建议

1. 腾讯近期 `CreateApiKey` 文档确认服务端 `api_key` 可以设置到期时间；省略 `ExpireIn` 或设 0 表示永不过期，最短 7200 秒，每个环境最多 5 把。创建所得完整 Token 只返回一次；列表里的 `api_key` 会脱敏。[创建](https://cloud.tencent.com/document/product/876/129835)；[查询列表](https://cloud.tencent.com/document/api/876/129833)
2. 官方通用身份认证页仍称 API Key 长期有效，旧版 CLI 指南仍称服务端 `api_key` 未开放；与近期 Cloud API 文档不一致。新密钥期限以最新 `CreateApiKey` / `DescribeApiKeyList` 的字段为准；控制台是否展示期限输入框、输入框名称和轮换按钮位置**未实点，待核**。[通用认证页](https://docs.cloudbase.net/service/authentication)；[旧版 CLI 指南](https://docs.cloudbase.net/cli-v1/envs/apikey)
3. 建议把当前服务端 Key 作为高敏感环境管理员凭据管理：首选 90 天有效期并设置 30/14/7 天提醒；只有暂时无法保证轮换时，才用永久 Key 作为可用性备选，并安排人工复核。采用“新建备用 Key → 安全更新部署变量 → 所有实例加载后做只读请求 → 删除旧 Key”的滚动轮换。官方文档说删除会立即吊销旧 Key；每环境最多 5 把，轮换前先核对可用名额。[创建与权限说明](https://cloud.tencent.com/document/product/876/129835)；[删除](https://cloud.tencent.com/document/api/876/129834)
4. 对当前本地候选 Key，主控记录的 JWT 载荷 `exp` 为 `2026-11-06T18:40:34Z`（北京时间 `2026-11-07 02:40:34`），离线脚本分类为 `DUE_7_DAYS`。**这只是未验签的 JWT 载荷，不等同腾讯 `DescribeApiKeyList.ExpireAt` 的官方元数据**；一次真实只读请求返回 200 只证明该凭据当时可用，不证明到期声明准确。应以控制台/API 列表中的 `ExpireAt` 核对。没有创建或轮换 Key。
5. API 限流建议保留按用户/IP的规则并接受单实例内存降级，但要监控 Upstash 缺失、失败或超时，因为降级后不同实例不共享计数。页面级同 IP 20 次/10 秒已在 84 人共享出口实测误拦；主控新增实测确认 `RATE_LIMIT_DISABLED=true` 后 84 个同 IP 页面请求均返回 307、0 个 429，同 IP 连续请求 `/api/cloudbase/auth/user` 仍是 120 个 401 加 1 个 429。建议把该开关作为切换候选配置，降低办公室同出口页面误拦；这只关闭页面 IP 阈值，不关闭 API 限流。没有线上修改。

## 官方密钥约束与控制台操作

### 类型、期限和提醒

| 做法 | 官方机制 | 主要取舍 |
|---|---|---|
| 不设期限 | `ExpireIn` 不传或为 0，即永不过期 | 不会因忘记轮换自动到期；泄露后持续有效，须靠人工轮换与检查。仅在暂时没有轮换能力时作为可用性备选 |
| 创建时设期限 | `ExpireIn` 秒数，最短 7200 秒；到期后自动失效 | 建议 90 天，能限制泄露窗口；若未提前替换，服务会因 Key 到期中断 |
| 到期提醒 | 创建/查询响应提供 `ExpireAt`；本轮所查官方接口没有说明自动通知机制 | 建议提前 30/14/7 天自行提醒或离线核对；本次没有创建实际提醒。不能把离线 JWT 解析当平台验证 |
| 轮换 | 创建新 Key，部署切换后以 `KeyId` 删除旧 Key；删后旧 Token 请求失败 | 保留新旧短暂重叠能降低停机风险；环境上限 5 把，需保留可轮换名额 |

**当前 Key 状态边界：** [`scripts/cloudbase/service-key-check.mjs`](../../../../scripts/cloudbase/service-key-check.mjs) 只在本地解析三段 JWT、检查 `role` 与 `exp` 声明，不验签、不访问腾讯、不发提醒。当前候选值的 `exp` 与 `DUE_7_DAYS` 状态来自主控本轮脱敏检查；平台到期字段仍待查询确认。应用通过 [`CLOUDBASE_SERVICE_API_KEY`](../../../../.env.example) 注入服务端凭据；源码在 admin 数据访问时把它放进 `Authorization: Bearer`，没有 `NEXT_PUBLIC_` 暴露。[data-client.ts](../../../../src/lib/cloudbase/data-client.ts)

该 Key 与腾讯云管理 API 用的 `CLOUDBASE_SECRET_ID` / `CLOUDBASE_SECRET_KEY` 是两类凭据；环境服务 Key 权限是环境级管理员访问，官方说明不支持按子资源粒度收窄。创建、查询和删除有官方 API 文档；本轮未找到修改现有 Key 到期时间或原 Token 的公开步骤，因此轮换方案按新建并切换处理。

### 控制台逐步操作

官方快速体验文档给出的入口为：进入目标环境 → **环境管理 → 环境配置 → API Key 配置 → 服务端 API Key 区域 → 创建 API Key**。[CloudBase 快速体验](https://docs.cloudbase.net/solutions/cloudbase-platform-edition/quick-start)

1. 登录腾讯云开发控制台，先核对目标环境 ID，再打开上述“服务端 API Key”区域。
2. 创建一把用途清楚的新 Key，建议名称包含服务、环境和年月；类型应为服务端 `api_key`。期限选择有限期并记录到期日。**控制台按钮、字段标签以及期限输入项是否可见未实点，待核。**
3. 若创建页没有期限字段，可在腾讯 API Explorer 选择 `CreateApiKey`，填写 `EnvId`、`KeyType=api_key`、`KeyName`、`ExpireIn`（秒；最短 7200）；这组参数由近期腾讯 API 文档确认。本轮没有调用该写接口。
4. 创建后只在安全密钥管理处保存一次性明文，并更新部署环境变量 `CLOUDBASE_SERVICE_API_KEY`；不要放进仓库、浏览器变量、日志或报告正文。
5. 先用只配置新 Key 的隔离 canary 实例做只读请求；只有该实例不能取得旧 Key 时，成功响应才能确认新 Key 可用。再将新值滚动到所有应用实例，并核对部署版本/secret version 已全部更新。旧 Key 暂时保留供回退，确认全量切换后才按旧 `KeyId` 删除。删除按钮和确认对话框的精确名称未实点，待核；删除是即时吊销，不能提前执行。
6. 记录新 Key 的 `KeyId`、名称、平台 `ExpireAt`、保管位置（不记 Token 明文）和轮换负责人；按 30/14/7 天提前量设置团队提醒。提醒节奏是本评估建议，不是腾讯内置功能。

## 限流规则与 92 条 API 路由清单

源码按请求路径、用户 ID 或 IP 计数；同一条路由的不同 HTTP 方法不拆桶。`Server Action` 不是独立 API 路径或限流桶，下面只列 `src/app/api/**/route.ts` 的 92 条路由。Middleware 对 `/api` 前缀应用此判断；具体规则由 [`api-rate-limit.ts`](../../../../src/lib/api-rate-limit.ts) 决定。

- **OCR 20/分钟：** `/api/ocr-screenshot` 及其子路径，共用 `ocr-screenshot` 桶。
- **投稿 20/分钟：** `/api/video-submit` 及其子路径，共用 `video-submit` 桶。
- **默认 120/分钟：** 其余非豁免 API 共用 `default` 桶。额度按用户/IP 分开，但同一用户/IP 访问两条 default 路由会消耗同一份额度。
- **豁免：** 以下 5 条不进入 API 限流；豁免仅指限流，不代表没有各自的鉴权或其他中间件检查。
- 任何未登录 API 请求按 IP 计；登录用户在会话校验后按用户 ID 计。开发模式绕过 API 限流。Upstash 未配置、请求失败、返回错误或超过 3 秒，会退回本实例内存计数；Map 最多 10,000 个键，不跨实例共享。
- 92 条中，84 条进入共享 default 桶、3 条进入两类专限桶、5 条豁免。路由内的 HTTP method 和 Server Action 不另开 API 桶。

| API 路由 | 桶/额度 |
|---|---|
| `/api/action-center/summary` | 默认 120/分钟，共享桶 |
| `/api/admin/ai-config/check-dependencies` | 默认 120/分钟，共享桶 |
| `/api/admin/ai-config` | 默认 120/分钟，共享桶 |
| `/api/admin/ai-config/sync-models` | 默认 120/分钟，共享桶 |
| `/api/admin/collaboration/attribution` | 默认 120/分钟，共享桶 |
| `/api/admin/collaboration/person` | 默认 120/分钟，共享桶 |
| `/api/admin/collaboration/unattributed` | 默认 120/分钟，共享桶 |
| `/api/admin/collaboration/work-video` | 默认 120/分钟，共享桶 |
| `/api/admin/collaboration/writer-certification` | 默认 120/分钟，共享桶 |
| `/api/admin/content-analysis` | 默认 120/分钟，共享桶 |
| `/api/admin/content-attribution/[videoId]` | 默认 120/分钟，共享桶 |
| `/api/admin/content/[videoId]/review-status` | 默认 120/分钟，共享桶 |
| `/api/admin/content/[videoId]` | 默认 120/分钟，共享桶 |
| `/api/admin/content/author` | 默认 120/分钟，共享桶 |
| `/api/admin/content/comparison-members` | 默认 120/分钟，共享桶 |
| `/api/admin/content/list` | 默认 120/分钟，共享桶 |
| `/api/admin/content/topic-library-status` | 默认 120/分钟，共享桶 |
| `/api/admin/evaluation-standards` | 默认 120/分钟，共享桶 |
| `/api/admin/execute-tool` | 默认 120/分钟，共享桶 |
| `/api/admin/first-screen-monitor` | 豁免 |
| `/api/admin/fulfillment/appeal/handle` | 默认 120/分钟，共享桶 |
| `/api/admin/fulfillment/appeal/reopen` | 默认 120/分钟，共享桶 |
| `/api/admin/fulfillment/appeals/resume` | 默认 120/分钟，共享桶 |
| `/api/admin/fulfillment/appeals` | 默认 120/分钟，共享桶 |
| `/api/admin/fulfillment/bulk-mark` | 默认 120/分钟，共享桶 |
| `/api/admin/fulfillment/calendar` | 默认 120/分钟，共享桶 |
| `/api/admin/fulfillment/mark` | 默认 120/分钟，共享桶 |
| `/api/admin/fulfillment/remove` | 默认 120/分钟，共享桶 |
| `/api/admin/member-ai-suggestion` | 默认 120/分钟，共享桶 |
| `/api/admin/modules/member-emails` | 默认 120/分钟，共享桶 |
| `/api/admin/system/settings` | 默认 120/分钟，共享桶 |
| `/api/admin/topics-library/evaluate` | 默认 120/分钟，共享桶 |
| `/api/admin/topics-library/feishu-url` | 默认 120/分钟，共享桶 |
| `/api/admin/topics-library/import/confirm` | 默认 120/分钟，共享桶 |
| `/api/admin/topics-library/import/parse` | 默认 120/分钟，共享桶 |
| `/api/admin/topics-library/toggle` | 默认 120/分钟，共享桶 |
| `/api/admin/video-assets/[videoId]` | 默认 120/分钟，共享桶 |
| `/api/admin/videos/[videoId]/lifecycle` | 默认 120/分钟，共享桶 |
| `/api/admin/videos/list` | 默认 120/分钟，共享桶 |
| `/api/cloudbase/auth/refresh` | 默认 120/分钟，共享桶 |
| `/api/cloudbase/auth/signin` | 默认 120/分钟，共享桶 |
| `/api/cloudbase/auth/signout` | 默认 120/分钟，共享桶 |
| `/api/cloudbase/auth/user` | 默认 120/分钟，共享桶 |
| `/api/cloudbase/rdb/rest/[...segments]` | 默认 120/分钟，共享桶 |
| `/api/cron/douyin-sync` | 默认 120/分钟，共享桶 |
| `/api/dashboard/activity` | 默认 120/分钟，共享桶 |
| `/api/dashboard/leaderboard` | 默认 120/分钟，共享桶 |
| `/api/dashboard/operator-members` | 默认 120/分钟，共享桶 |
| `/api/dashboard/sample-quality-check` | 默认 120/分钟，共享桶 |
| `/api/douyin/accounts/[bindingId]/metrics` | 默认 120/分钟，共享桶 |
| `/api/douyin/accounts/[bindingId]` | 默认 120/分钟，共享桶 |
| `/api/douyin/accounts/[bindingId]/sync` | 默认 120/分钟，共享桶 |
| `/api/douyin/accounts` | 默认 120/分钟，共享桶 |
| `/api/douyin/authorizations` | 默认 120/分钟，共享桶 |
| `/api/douyin/oauth/callback` | 默认 120/分钟，共享桶 |
| `/api/douyin/sync-runs/[runId]` | 默认 120/分钟，共享桶 |
| `/api/douyin/unmatched/[externalVideoId]/link` | 默认 120/分钟，共享桶 |
| `/api/douyin/unmatched` | 默认 120/分钟，共享桶 |
| `/api/exemptions/apply` | 默认 120/分钟，共享桶 |
| `/api/exemptions/history` | 默认 120/分钟，共享桶 |
| `/api/exemptions/pending` | 默认 120/分钟，共享桶 |
| `/api/exemptions/permanent` | 默认 120/分钟，共享桶 |
| `/api/exemptions/reopen` | 默认 120/分钟，共享桶 |
| `/api/exemptions/review` | 默认 120/分钟，共享桶 |
| `/api/export` | 默认 120/分钟，共享桶 |
| `/api/feishu/event` | 豁免 |
| `/api/health` | 豁免 |
| `/api/notifications/[id]/done` | 默认 120/分钟，共享桶 |
| `/api/notifications/[id]/read` | 默认 120/分钟，共享桶 |
| `/api/notifications/cleanup` | 豁免 |
| `/api/ocr-screenshot` | OCR 20/分钟，共享桶 |
| `/api/permission-requests/apply` | 默认 120/分钟，共享桶 |
| `/api/register-teams` | 默认 120/分钟，共享桶 |
| `/api/remind/count` | 默认 120/分钟，共享桶 |
| `/api/submission-screenshots/file` | 默认 120/分钟，共享桶 |
| `/api/submission-screenshots/grant` | 默认 120/分钟，共享桶 |
| `/api/submission-screenshots` | 默认 120/分钟，共享桶 |
| `/api/supabase-keepalive` | 豁免 |
| `/api/topics/active` | 默认 120/分钟，共享桶 |
| `/api/topics/bootstrap` | 默认 120/分钟，共享桶 |
| `/api/topics/pool` | 默认 120/分钟，共享桶 |
| `/api/topics/sub-topics/[id]/claim` | 默认 120/分钟，共享桶 |
| `/api/topics/sub-topics/[id]/claims` | 默认 120/分钟，共享桶 |
| `/api/topics/sub-topics/[id]/return` | 默认 120/分钟，共享桶 |
| `/api/topics/sub-topics/[id]` | 默认 120/分钟，共享桶 |
| `/api/topics/sub-topics/[id]/start-scripting` | 默认 120/分钟，共享桶 |
| `/api/topics/sub-topics/[id]/works` | 默认 120/分钟，共享桶 |
| `/api/topics/sub-topics` | 默认 120/分钟，共享桶 |
| `/api/topics/sub-topics/suggest` | 默认 120/分钟，共享桶 |
| `/api/usage-events` | 默认 120/分钟，共享桶 |
| `/api/video-submit/edit-detail` | 投稿 20/分钟，共享桶 |
| `/api/video-submit` | 投稿 20/分钟，共享桶 |

## 84 人峰值：已有证据与建议实验

### 已有证据

| 证据 | 结果 | 能说明什么 |
|---|---|---|
| 主控使用 Node 24、本地正式 build/start，84 个同 IP `GET /dashboard` | 20 个请求返回 307 登录跳转，64 个请求返回 429 | 单实例页面 IP 限流会误拦同出口峰值；未登录，没有触发登录或 CloudBase 查询 |
| 同轮 84 个不同 IP `GET /dashboard` | 84 个均返回 307 | 单 IP 阈值是差异来源之一；仍未登录、未触发 CloudBase 查询 |
| 主控使用 Node 24、本地正式服务并设置 `RATE_LIMIT_DISABLED=true`，84 个同 IP 页面请求 | 84 个均返回 307，0 个 429 | 该开关消除了页面 IP 阈值误拦；未登录，不能据此推断后端并发能力 |
| 同一开关下，同 IP 连续 121 次请求 `/api/cloudbase/auth/user` | 120 个 401，随后 1 个 429 | API 限流仍有效；该开关只关闭页面 IP 阈值，不会放开 API 桶 |
| 源码离线模拟 [`rate-limit-capacity.mjs`](../../../../scripts/cloudbase/rate-limit-capacity.mjs) | 84 个用户各对 OCR 发 21 次：1764 次中 1680 放行、84 拒绝；default 路由 120 次后换另一 default 路由再发 1 次，后者拒绝；同一用户在两个独立进程各发 120 次，总放行 240 次 | 证明源码计数与实例隔离模型；不测真实 Upstash、Vercel 调度或 CloudBase 吞吐 |

HTTP 请求证据保存在主控私有目录：`/Users/mac/.local/share/dydata/review/2026-11-02-切换就绪/rate-http-office.json`、`rate-http-separate.json`、`rate-page-flag-http.json`。这些均为本地未登录请求，不是 84 个员工会话的后端压测；没有证明真实 CloudBase、Vercel 或员工业务峰值容量。API 内存计数仍按进程隔离，Server Actions 不属于这些 `/api` 路由桶。

### 下一步建议

1. 将 `RATE_LIMIT_DISABLED=true` 列入本地切换候选配置，缓解办公室同公网 IP 的页面误拦；实测为 84 个同 IP 页面请求均 307、0 个 429，而 API 用户接口仍有 120 个 401 和 1 个 429。源码中该变量只短路页面 `checkRateLimit`；API 的 `checkApiRateLimit` 只在开发模式放行，所以该变量不会关闭 API 限流。此配置没有应用到线上，也没有部署。
2. 保持 API 规则；Upstash 不可用时可让请求退回单实例限制，但应监控降级日志与 Redis 请求失败/超时。独立进程模型显示同一用户跨两实例分别可用满额，故内存降级不等价于全局限制。
3. 若需测应用和 CloudBase 的真实读负载，应在获准的隔离环境、使用测试身份和只读 GET 路由，记录并发数、请求速率、P50/P95/P99、429/5xx、应用耗时和上游耗时；先本地 stub 校验限流，再单独评估是否需要真实隔离环境读测。不得将本地 stub 数字解释为腾讯端容量，也不得用写路由做峰值探测。

## 核验范围

- 92 条路由由 `rg --files src/app/api | rg '/route\\.ts$'` 清点；规则按 `src/lib/api-rate-limit.ts`、`src/lib/rate-limit.ts`、`src/middleware.ts` 与 `src/lib/cutover-maintenance.ts` 当前源码分类。
- 官方密钥机制依据腾讯 CloudBase 创建、查询、删除接口及控制台快速体验文档；控制台当前交互字段未实点。
- 当前密钥 `exp` 只作待核线索；需要平台 `ExpireAt` 才可确认到期口径。HTTP 200 只说明被测请求当时成功。
- 未创建/删除密钥，未调用 CloudBase 写 API，未改任何生产环境配置，未执行部署或 push。
