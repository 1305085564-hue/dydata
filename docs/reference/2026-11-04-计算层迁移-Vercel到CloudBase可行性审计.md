# 计算层迁移审计：Vercel → CloudBase

> 审计对象：DYData Next.js 16.3.3（本地 commit `9eee2b74`）
> 对照文档：CloudBase《从 Vercel 迁移》《Next.js 部署到 CloudBase》《云托管使用限制》
> 审计时间：2026-11-04
> 证据性质：代码静态审计 + 官方文档对照 + 构建产物读数。**未在 CloudBase 云托管实跑**，文中标【推算】的数值不是实测。

---

## 一、结论

1. **能迁，但不是“原样迁”。** 官方给 Next.js SSR 的路径是「云托管 + Dockerfile」，不是静态托管，也不是 HTTP 云函数。业务代码（页面、接口、Server Actions、中间件、认证、数据库适配）基本不用改；要改的是**打包、环境变量注入、定时任务、发布回退**这四件部署层的事。
2. **技术没有硬阻塞，真正的阻塞在备案。** dydata.cc 注册在阿里云、解析走 Cloudflare 代理、源站在 Vercel；CloudBase 生产环境绑自定义域名要求 ICP 备案，默认域名官方明确“仅测试用、不承诺 SLA”。备案没办的话是 2–4 周外部周期，代码再快也绕不过。
3. **Cloudflare 不摘，等于白搬一半。** 现在国内用户先到 Cloudflare 海外节点、再到 Vercel 新加坡。只把源站换成上海，前面仍绕一圈；要拿到国内速度，DNS 必须直连 CloudBase（或至少关掉 Cloudflare 代理）。
4. **60 秒是硬上限，而且比现在更紧。** 云托管单请求 60 秒，超过直接断。Vercel Functions 当前默认执行上限是 300 秒；抖音同步（20 个绑定串行）、1 万行导出、OCR（预算正好 60 秒）迁过去都会贴边或超界，需要分批或改由定时函数跑。
5. **建议先隔离环境试点，不要直接换 DNS。** 数据库和认证已经在 CloudBase 上海跑通，剩下的是计算层；用同一套代码起一个云托管服务，跑完只读+写路径回归，再灰度切流。技术上 5–7 人日可到“可切换”状态，备案另算。

### 判定汇总

| 维度 | 判定 |
|---|---|
| 代码可移植性 | 高：92 个 API 路由、21 个页面、10 个 Server Actions 文件均无需改 |
| 平台能力覆盖 | 核心能力全覆盖；边缘/CDN、预览环境、冷启动有差距 |
| 迁移工作量 | 中：部署层重写，业务层几乎不动 |
| 最大风险 | 备案、60 秒上限、构建期 `NEXT_PUBLIC_*`、COS 地域 |
| 建议 | 迁；走云托管；分“试点 / 灰度”两步 |

### 图例

- **绿**：原样可迁，不改代码
- **黄**：要改配置或外围，业务逻辑不动
- **红**：有阻塞或需重新设计
- **灰**：本项目不适用

---

## 二、审计基线（现在是什么样）

| 事实 | 读数 | 来源 |
|---|---|---|
| 框架 | Next.js 16.3.3 / React 19.2.7 / App Router | `package.json` |
| 代码规模 | 1,216 个 `.ts/.tsx`；92 个 `route.ts`；21 个 `page.tsx` | `find` 统计 |
| 服务端动作 | 10 个文件带 `"use server"` | `grep` |
| 中间件 | `src/middleware.ts` 304 行；Next 16 已把该约定改名 `proxy.ts`（仍兼容） | 代码 + Next 16 内置文档 |
| 构建产物 | `.next/server` 146MB；`.next/static` 4.2MB；`.next/cache` 859MB（不随部署） | `du` |
| 预渲染路由 | 5 个：`/`、`_global-error`、`_not-found`、`favicon.ico`、`opengraph-image` | `prerender-manifest.json` |
| 图片优化 | 零 `next/image` 引用 | `grep` |
| ISR | 无页面级 `revalidate`；只有 Server Actions 里的 `revalidatePath` | `grep` |
| 实时能力 | 零 Realtime / GraphQL / WebSocket / SSE | `grep` |
| 原生依赖 | `sharp` 在截图压缩、OCR 预处理两处运行时使用；`jimp` 为纯 JS 兜底 | `route.ts` |
| 长任务声明 | 仅 2 个路由写了 `maxDuration = 60`（OCR、补交审批） | `grep` |
| 定时任务 | 3 条，写在 `vercel.json`，UTC 时区 | `vercel.json` |
| 环境变量 | 113 个唯一变量名；`NEXT_PUBLIC_*` 参与浏览器构建 | `grep` |
| 数据层 | 已切 CloudBase PG 上海（2026-11-04 03:31 完成，99 表 63,190 行） | `日志/2026-11-04.md` |
| 认证 | 已自建 CloudBase 代理登录 + HttpOnly 会话 Cookie | `src/app/api/cloudbase/auth/*` |
| 截图存储 | 腾讯云 COS，**地域 ap-singapore**，桶 `dydata-screenshot-sg-*` | `.env.local`（只读变量名与地域） |
| 域名链路 | `dydata.cc` → Cloudflare 代理 → Vercel；动态请求落 `sin1` | `curl -I`：`server: cloudflare`、`cf-ray`、`x-vercel-id: fra1::sin1` |
| 生产日志 | Vercel 日志，项目实测只能回溯约 1 小时 | 《工程运行事实》 |

---

## 三、逐项对照官方指南

| # | 官方指南项 | 官方说法 | DYData 现状 | 判定 | 要做的事 |
|---|---|---|---|---|---|
| 1 | 静态网站托管 | `tcb app deploy`，适合纯静态/静态导出 | 全站 SSR，仅 5 个预渲染路由 | 灰 | 不用静态托管 |
| 2 | Next.js SSR | **云托管 + Dockerfile**；API Routes 原样运行 | 未容器化，Vercel 托管 | 黄 | Dockerfile + standalone，见 §5.1 |
| 3 | API Routes | 原样运行，无需改代码 | 92 个 `route.ts` | 绿 | 无 |
| 4 | Middleware / Edge | 云托管中间件 / API 网关 | `src/middleware.ts` 跑在 Node 运行时 | 绿 | 无；可选改名 `proxy.ts` |
| 5 | 环境变量 | 控制台配置，`process.env` 代码不变 | 113 个变量；4 个 `NEXT_PUBLIC_*` 参与构建期内联 | 黄 | 构建期注入，见 §5.2（官方漏提示） |
| 6 | 定时任务 | 云函数定时触发器；5 位 cron → 7 位 | 3 条 Vercel cron，UTC 时区 | 红 | 时区换算 + 长任务拆分，见 §5.3 |
| 7 | 数据库 | PG / MySQL | 已迁 CloudBase PG 上海 | 绿（已完成） | 无 |
| 8 | 文件存储 | 云存储（内置 CDN + 图片处理） | COS 新加坡 | 黄 | 建议迁上海，见 §5.7 |
| 9 | 身份认证 | CloudBase 内置认证 | 已自建代理登录 + CloudBase Auth | 绿（已完成） | 无 |
| 10 | 自定义域名 | 控制台绑定 + 自行上传 SSL 证书 | Cloudflare 代理 → Vercel | 红 | 备案 + DNS 切换，见 §5.1 |
| 11 | 预览部署 | 用多个环境（dev/staging/prod）代替 | Vercel 每 PR 预览 | 黄 | 同环境多服务 / staging，流程降级 |
| 12 | 回滚 | 云托管版本 + 流量百分比 | Vercel Promote / Instant Rollback | 绿（等价） | 流程与脚本重写 |
| 13 | 日志 | 云托管日志，保留期可配 1–3600 天 | Vercel 约 1 小时 | 绿（改善） | 接日志服务，按 `requestId` 查 |
| 14 | 图片优化 | 云存储图片处理 | 未使用 `next/image` | 灰 | 无影响 |
| 15 | ISR / 缓存 | 整机部署，官方未给操作细节 | 无 ISR 页面 | 灰 | 无影响 |

**统计**：绿 6 项、黄 4 项、红 2 项、灰 3 项。

---

## 四、能原样搬的（不改业务代码）

| 能力 | 为什么能原样 |
|---|---|
| 21 个页面 / 92 个 API 路由 | 云托管跑的是完整 `next start`，路由语义与本地一致 |
| 10 个 Server Actions 文件 | 同源校验、加密 action id 都由 Next 自己处理；容器内不需要额外网关 |
| `src/middleware.ts` | Next 16 的 Proxy 默认 Node 运行时；登录校验、限流、清缓存逻辑不变 |
| CloudBase 认证 | 已有 `api/cloudbase/auth/*` 代理 + HttpOnly Cookie；换域名不影响，换主域才需要重新登录 |
| 数据适配层 | `@supabase/supabase-js` 仅作为查询构造器，fetch 已指向 CloudBase 网关；计算层放哪都一样 |
| COS 读写 | 走标准 HTTP API；只有地域带来的延迟差异，没有兼容性问题 |
| Excel 导出 / OCR / AI 调用 / 飞书 | 纯 Node 库或外部 HTTP，不依赖 Vercel 专有能力 |
| `after()` 后台任务 | 容器常驻，比 Serverless 更适合 `after()`；飞书事件回执后的处理不会因实例冻结被腰斩 |

**结论**：这次迁移的风险不在“代码能不能跑”，在“怎么部署、怎么配、怎么运维”。

---

## 五、必须改的（按优先级）

### P0-1 备案与域名（唯一的外部阻塞）

**事实**

- 域名注册商是阿里云（HiChina），A 记录是 Cloudflare 段，响应头 `server: cloudflare` + `cf-ray`。
- 动态请求的 `x-vercel-id` 是 `fra1::sin1`：边缘在法兰克福、函数在新加坡。
- CloudBase 自定义域名要求 ICP 备案；云托管默认域名官方写明“仅测试使用，不承诺 SLA，请勿用于线上生产”。

**判断**：备案状态我无法从代码或 DNS 判断，需要查备案系统。如果没办，这是关键路径，不是技术问题。

**做法**

1. 查 `dydata.cc` 备案状态；未办则走腾讯云备案（主体资料、域名实名、服务器备案资格）。
2. 备案期间用云托管默认域名做内测，不对外。
3. 备案通过后绑定 `dydata.cc` + `www.dydata.cc`，上传证书。
4. DNS 从 Cloudflare 切到 CloudBase / 腾讯 DNSPod；**关掉 Cloudflare 代理**（灰云），否则国内仍绕海外。
5. 切换前把 TTL 降到 300 秒，保留 24 小时回切窗口。

**验收**：`dig` 直指 CloudBase；`curl -I https://dydata.cc` 不再出现 `cf-ray`；证书链完整；两个域名都 200。

**不建议**：保留 Cloudflare 代理、只换源站。技术上能通，但国内速度不会改善，Host/证书链路更复杂，排查成本更高。

### P0-2 构建期 `NEXT_PUBLIC_*`（最危险的静默失败）

**事实**

- 浏览器端用 `NEXT_PUBLIC_DYDATA_BACKEND` 判断走 CloudBase 还是 Supabase。
- 浏览器端用 `NEXT_PUBLIC_CLOUDBASE_ENV_ID` 拼数据网关地址。
- Next 在 `build` 时把 `NEXT_PUBLIC_*` 内联进 `.next/static`；CloudBase 控制台的环境变量只在**运行时**注入。

**后果**：如果构建时没有这几个变量，浏览器端会回落到 Supabase 客户端；服务端 `/api/health` 仍然是 200，登录页可能能打开，但登录/数据全挂。这是最难第一时间发现的一类故障。

**做法**

- Docker build 阶段注入 4 个公开变量：`NEXT_PUBLIC_DYDATA_BACKEND`、`NEXT_PUBLIC_CLOUDBASE_ENV_ID`、`NEXT_PUBLIC_SENTRY_DSN`、`NEXT_PUBLIC_SENTRY_ENVIRONMENT`。
- 这些值本身是公开的，可以写进 Dockerfile 的 `ENV`，或用 `ARG` 按环境传入；不要塞进运行时 Secret。
- 构建后抽查：`grep -r "<envId>" .next/static` 必须命中。

**验收**：浏览器 Network 里没有任何 `supabase.co` 请求；登录成功；切换账号正常。

### P0-3 定时任务（3 条全要重做）

**事实**

| 任务 | Vercel（UTC） | 北京时间 | CloudBase 7 位（UTC+8） | 处理 |
|---|---|---|---|---|
| `/api/supabase-keepalive` | `30 6 * * *` | 14:30 | `0 30 14 * * * *` | **建议直接删除**：库已迁 CloudBase，不再需要给 Supabase 保活 |
| `/api/notifications/cleanup` | `0 18 * * *` | 次日 02:00 | `0 0 2 * * * *` | 直接迁 |
| `/api/cron/douyin-sync` | `0 2 * * *` | 10:00 | `0 0 10 * * * *` | **必须改分批**：20 个绑定串行，单绑定 HTTP 超时 10 秒，最坏 200 秒 |

**关键坑**：Vercel cron 用 UTC，腾讯云定时触发器按 UTC+8；把 5 位表达式照抄成 7 位会偏 8 小时。官方迁移指南只给了位数换算，没提时区。

**做法**

- 建 1 个定时云函数（或 3 个），用 timer 触发器，带 `Authorization: Bearer <CRON_SECRET>` 调应用 HTTP 接口。
- 抖音同步改成每批 5 个绑定，函数里循环调用直到做完；或把循环搬进函数内直接跑（云函数最长 900 秒）。
- 健康检查类任务不要走 HTTP，直接在函数里查库。

**验收**：手动触发一次，日志里能看到 `attempted/succeeded/failed`；执行时间在 60 秒内；时间点对得上北京时间。

### P0-4 发布与回退链路（现有脚本全部失效）

**事实**

- `scripts/rollback-rehearsal.mjs` 调 `vercel rollback`。
- 发布核对依赖 `vercel ls` / `vercel logs`（《工程运行事实》明确写了这两条命令）。
- 线上版本号来自结构化日志里的 `detail.release`（Vercel 注入的提交 SHA）。

**做法**

- 部署：云托管支持 GitHub 私有仓库 + push 自动部署；也可以在 CI 里 `tcb cloudrun deploy`。
- 回退：云托管保留最多 10 个版本，旧版本流量拉回 100% 即可；比 Vercel Promote 更细（可按百分比灰度）。
- 发布核对：`curl /api/health` + 云托管版本号 / 镜像 tag；日志按 `requestId` 在云开发日志服务里查。
- 回滚演练脚本改成“版本流量 0% → 100%”，把 `vercel` 命令全部替换。

**验收**：完整演练一次：发新版 → 10% 流量 → 观察 → 回退旧版 → 100% 旧版，全程 10 分钟内。

### P1-5 60 秒硬上限

**事实**

- 云托管请求超时 60 秒，硬上限。
- OCR：`totalTimeoutMs = 60_000`，`maxDuration = 60`，正好贴边，没有给响应序列化留时间。
- 补交审批：`maxDuration = 60`。
- 导出：上限 10,000 行，`exceljs` 在内存里生成。
- 抖音同步：见上，最坏 200 秒。

**做法**

- OCR 总预算降到 45 秒（单渠道 35 秒），确保 60 秒内能返回错误或结果。
- 补交审批拆分同步/异步；耗时步骤改成后台任务 + 轮询。
- 导出超过 5,000 行时改为异步生成 + 下载链接，或限制单次范围。
- 抖音同步分批（P0-3）。

**验收**：三个入口在云托管实测 P95 < 55 秒；超时返回明确 JSON 错误，不是 504 白屏。

### P1-6 实例规格与冷启动

**事实**

- 云托管最小规格 0.25 核 / 0.5GB；缩到 0 后再冷启动约 30 秒（官方文档）。
- Sharp、Excel、Next 构建产物都不轻；0.5GB 跑导出容易 OOM。

**做法**

- 1 核 2GB，最小实例 1，最大实例 3；先按这个跑，按监控调。
- 健康检查路径 `/api/health`（无需登录，恒 200）。
- 监控 CPU / 内存 / 实例数；导出和 OCR 时段重点看。

**验收**：连续 10 次冷启动 + 10 并发请求，P95 可接受；无 OOM；扩容能跟上。

### P1-7 COS 地域（容易被忽略的跨地域回退）

**事实**

- 桶在 `ap-singapore`。现在是 Vercel `sin1` → COS 新加坡，同区，延迟低。
- 计算搬到上海后，每次上传/读图/OCR 下载都变成上海 ↔ 新加坡跨境。
- 现有 COS 读超时 3 秒；跨境抖动会直接触发降级或失败。

**做法**

- 把桶迁到 `ap-shanghai`（02 号报告记录：3,661 个对象 / 911MB），或新桶双写过渡。
- 更新 `COS_REGION` / `COS_BUCKET`；历史对象 URL 做兼容。
- 确认生产 `SCREENSHOT_STORAGE` 到底是 `cos` 还是 `supabase`，别让降级路径掩盖问题。

**验收**：上海读图 P95 明显低于跨境；8MB 上传成功；OCR 不因下载超时失败。

### P1-8 静态资源与 CDN

**事实**：`.next/static` 只有 4.2MB，但要由容器提供；Vercel 原来走边缘 CDN。

**做法**：一期接受容器直出；二期把 `_next/static` 放静态托管/CDN，配 `assetPrefix`。不要一期就做，先把主链路跑通。

**验收**：首屏静态资源 TTFB 与 Vercel 对比不退化；缓存头正确（hashed 文件长缓存）。

### P1-9 可观测性

**事实**

- Sentry 的 environment/release 取 `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA`；换平台后这两个值为空。
- Vercel 日志只留约 1 小时，CloudBase 日志可配更长，查询方式不同。

**做法**

- 构建时设 `SENTRY_RELEASE=<git sha>`；运行时设一个平台中立的 `APP_ENV`。
- 接云开发日志服务；保留 `/api/health` 和 `x-dydata-request-id`。
- 告警从 Vercel 迁移到云监控 + Sentry。

**验收**：Sentry 事件带 environment/release；能按 `requestId` 查到一次请求的完整日志。

### P2-10 ~ P2-12（可后置）

- `middleware.ts` → `proxy.ts`：Next 16 只是弃用警告，不影响运行；有空再做 codemod。
- 清理 Supabase：`supabase-keepalive` 定时任务、Supabase 依赖和残留环境变量，等回退窗口过了再删。
- CDN / 静态托管：见 P1-8 二期。

---

## 六、能力差异（只列有实际影响的）

| 能力 | Vercel | CloudBase 云托管 | 对 DYData 的影响 |
|---|---|---|---|
| 边缘 / CDN | 全球边缘，静态资源就近 | 单地域上海容器；只有静态托管才有 CDN | 国内更好，海外更差；静态资源需二期 CDN |
| 冷启动 | 低 | 缩到 0 后约 30 秒 | **必须 min ≥ 1**，否则第一个人等半分钟 |
| 请求超时 | 默认 300 秒（官方限制文档） | **60 秒硬上限** | 抖音同步、导出、OCR 全部贴边 |
| 请求体 | 4.5MB（Vercel Functions） | 20MB | 8MB 截图迁过去更安全；见 §八“顺带发现” |
| 实例上限 | 自动扩缩 | 单环境 28 实例 / 15 服务 | 内部系统足够 |
| 定时任务 | 原生 cron，UTC | 云函数定时触发器，UTC+8，7 位 | 需重写 + 时区换算 |
| 预览环境 | 每 PR 预览 | 多环境 / 多服务，手动 | 流程降级，建议固定 staging |
| 回滚 | Promote / Instant Rollback | 版本 + 流量百分比 | 等价，灰度更细 |
| 日志 | 约 1 小时（本项目实测） | 可配 1–3600 天 | 改善 |
| 图片优化 | 内置 | 无 | 未用 `next/image`，无影响 |
| ISR 共享缓存 | 有 | 单实例本地缓存 | 无 ISR 页面，无影响 |
| 域名 / 证书 | 自动 | 手动上传证书 + 备案 | 最大外部成本 |
| 构建 | 托管构建 | Docker 构建（或本地镜像） | 需 Dockerfile；构建资源待试 |
| 计费 | 席位 + 用量 | 资源点（CPU/内存/流量/构建） | 见 §七 |

---

## 七、官方指南的 5 个盲区 / 矛盾

1. **两个官方页面给了两条不同的 Next.js 路径。** 迁移指南说“Next.js → 云托管 + Dockerfile”；Next.js 专页说“HTTP 云函数 + `scf_bootstrap` + 9000 端口”。本项目只能选云托管：
   - 8MB 截图上传 > 云函数 6MB 请求体上限；
   - Next standalone 产物是数百 MB 量级【推算，按现有 `.next/server` 146MB + 运行依赖估】，远超云函数 50MB 代码包上限；
   - `sharp` 是原生依赖，macOS 上传的函数包在 Linux 跑不起来。

2. **“环境变量代码无需改动”只对服务端成立。** `NEXT_PUBLIC_*` 是构建期内联，控制台配运行时变量救不了；官方指南没提醒这一点。

3. **cron 的 5 位 → 7 位换算没提时区。** Vercel 是 UTC，腾讯云定时触发器是 UTC+8；照抄表达式会偏 8 小时。

4. **默认域名不能用于生产。** 指南只说“控制台绑定域名”，云托管配置文档才写明默认域名“仅测试、无 SLA”。

5. **Next.js SSR 的静态资源 / CDN 方案缺失。** 官方 Dockerfile 模板用 `next.config.js` + `next start`；本项目是 `next.config.ts`，且 standalone 更合适，模板不能照抄。

---

## 八、推荐方案（如果决定迁）

### 目标形态

```text
用户 → DNS 直连 → CloudBase 云托管（上海，1 服务，1核2G，min 1 / max 3）
                      ├─ Next.js 16 standalone（页面 / API / Server Actions / Proxy）
                      ├─ CloudBase PG 上海（已有）
                      ├─ COS 上海（建议迁）
                      └─ 外部：AI 网关 / 百度 OCR / 飞书 / 抖音

定时：云函数 timer → HTTP(Bearer) → /api/cron/*
发布：GitHub main → 云托管自动构建 → 新版本 → 10% / 100% 流量
回退：旧版本流量 100%；DNS 可切回 Vercel 作外部兜底
```

### 构建要点

- `next.config.ts` 增加 `output: "standalone"`（不需要 `images.unoptimized`，因为零 `next/image`；加上也无害）。
- Dockerfile 多阶段：`node:20-bookworm-slim`（不要 alpine，`sharp` 的 musl 分支少踩坑）。
- 构建阶段注入 4 个 `NEXT_PUBLIC_*`；Sentry sourcemap 上传可选，没有 token 就关掉。
- 运行阶段复制 `.next/standalone`、`.next/static`、`public`；`PORT=3000`、`HOSTNAME=0.0.0.0`。
- 端口在云托管控制台配 3000；健康检查 `/api/health`。
- 如果云托管托管构建资源不够（Next 16 + Sentry 构建较重），退回“本地/CI 构建镜像 → 推 TCR → 云托管镜像部署”。

### 环境变量分层

| 层 | 变量 | 放哪 |
|---|---|---|
| 构建期（公开） | `NEXT_PUBLIC_DYDATA_BACKEND=cloudbase`、`NEXT_PUBLIC_CLOUDBASE_ENV_ID`、`NEXT_PUBLIC_SENTRY_DSN`、`NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Dockerfile `ENV` / build args |
| 运行期（服务端） | `DYDATA_BACKEND=cloudbase`、`CLOUDBASE_ENV_ID`、`CLOUDBASE_SERVICE_API_KEY`、`COS_*`、`FEISHU_*`、`CRON_SECRET`、`AI_*`、`BAIDU_OCR_*`、`UPSTASH_*`、`SENTRY_RELEASE` | 云托管控制台 |
| 过渡期保留 | `NEXT_PUBLIC_SUPABASE_*`、`SUPABASE_SERVICE_ROLE_KEY` | 只在回退窗口内保留，切稳后删 |

### 切换步骤

| 阶段 | 做什么 | 通过标准 |
|---|---|---|
| 0 试点 | 云托管起一个服务，用默认域名；只连生产库只读 | 登录、5 个核心页面、只读接口正常 |
| 1 写路径 | 测试账号走提交/审批/导出/上传/OCR | 写入只落 CloudBase；测试数据清理干净 |
| 2 定时任务 | 手动触发 3 个 cron；核对时区与耗时 | 日志、结果、时间点都对 |
| 3 灰度 | DNS 切 10% → 观察 → 50% → 100% | 错误率、P95、登录成功率不退化 |
| 4 回退演练 | 旧版本流量 100%；必要时 DNS 切回 Vercel | 10 分钟内恢复 |
| 5 收尾 | 删除 Supabase 保活、清理变量、留档 | 无 Supabase 请求；文档更新 |

---

## 九、成本与工期【推算，以账单为准】

| 项 | 估算 |
|---|---|
| 云托管 1核2G 常驻 | `(0.055 + 0.032×2) × 730 ≈ 87 元/月` 等值资源点 |
| 公网流量 | 0.8 元/GB；内部系统按 50–100GB/月 ≈ 40–80 元 |
| 构建 | 0.05 元/分钟；10 分钟/次 × 20 次 ≈ 10 元/月 |
| 套餐 | 标准版 199 元/月含 330,000 点（≈330 元等值），理论上覆盖上述 |
| Vercel 对照 | Pro $20/席位/月 + 带宽；具体取决于现有席位 |

**成本不是迁移理由**。理由是：国内访问路径、计算与数据库同地域、日志与回滚能力。省不省钱要看现有 Vercel 席位和流量，不能先下结论。

**工期**

- 隔离环境跑通：1–2 天
- 回归（角色 / 写路径 / 上传 / 导出 / OCR / cron）：2–3 天
- 灰度 + 切流 + 回退演练：1 天
- 备案：2–4 周（外部，未办的话是关键路径）

技术侧 5–7 人日可到“可切换”；备案决定什么时候真正切。

---

## 十、顺带发现（预存问题，未实测，不属本次迁移）

1. **截图上传上限 8MB，但 Vercel Functions 请求体上限是 4.5MB。** 超过 4.5MB 的上传在现网可能已经 413；迁到云托管（20MB）反而顺带解决。建议单独核一次生产日志。
2. **`SCREENSHOT_STORAGE` 本地是 `supabase`，生产按文档是 COS。** 迁移前必须确认生产值，否则跨地域读图失败会被降级路径掩盖。
3. **`fault-injection` 用 `VERCEL_ENV` 判断环境。** 迁走后 `VERCEL_ENV` 为空，生产 `NODE_ENV=production` 下不会误开，但 preview 注入能力会失效；建议改成平台中立的 `APP_ENV`。

---

## 附：证据

```text
# 构建产物
du -sh .next/server .next/static .next/cache
→ 146M .next/server / 4.2M .next/static / 859M .next/cache

# 规模
find src/app/api -name route.ts | wc -l        → 92
find src/app -name page.tsx | wc -l            → 21
grep -rl '"use server"' src | wc -l            → 10
grep -rho "process\.env\.[A-Z0-9_]*" ... | sort -u | wc -l → 113

# 线上链路
curl -sI https://dydata.cc
→ server: cloudflare / cf-ray / x-vercel-id: fra1::sin1

# 官方口径
CloudBase《从 Vercel 迁移》             https://docs.cloudbase.net/quick-start/migration/vercel
CloudBase《Next.js 部署到 CloudBase》   https://docs.cloudbase.net/cloud-function/frameworks-examples/next
CloudBase《云托管使用限制》             https://docs.cloudbase.net/run/limitation
CloudBase《云函数基础配置》             https://docs.cloudbase.net/cloud-function/function-configuration/config
腾讯云《定时触发器》                    https://cloud.tencent.com/document/product/583/9708
Vercel《Functions Limits》              https://vercel.com/docs/functions/limitations
```
