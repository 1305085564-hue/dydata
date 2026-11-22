# 算力池统一纳管 Cloudflare Clairic 与下线百度 OCR 实施方案

> **状态**：实施中（2026-11-22 阿禅拍板）
> **工作分支**：`feat/clairic-pool-retire-baidu`（隔离区 `/Users/mac/Projects/dydata/.claude/worktrees/clairic-pool`）
> **合并前端交互稿**：产品经理交互规范 + 架构师三项审定收口（不加脆弱纯文本正则、编辑地址保持原协议支持自定义代理、历史普通记录不加噪音文案）

---

## 一、核心诉求与架构原则

1. **下线百度 OCR**：彻底移除 `baidu-ocr.ts`、`baidu-channel.ts`、`ocr-channel.ts`、`channel-config.ts`、`ocr_screenshot_structure` 隐藏绑定项以及后台旧的三选一模式卡片。
2. **协议级统一纳管**：在 `ai_providers` 接入点层新增显式协议字段 `protocol`（`'openai_compatible'` | `'cloudflare_clairic'`，默认 `'openai_compatible'`），让 Cloudflare Clairic 与普通对话模型共用同一套「接入新渠道 → 探测连通 → 挂载模型 → 改地址/换 Token → 多账号顺位排序 → 5 态健康治理与 429 自动冷却」体系；未来新增其他厂家非标专项协议只需扩展协议枚举与传输适配，不动算力池主干。
3. **精准能力隔离（无误伤正则）**：
   - 唯一真源 `src/lib/ai/provider-protocols.ts`：`clairic`（上游 `@cf/cloudflare/clairic`）标记为 `scope: "ocr_only"`。
   - 前后端双端拦截：`clairic` 仅允许绑定给 `ocr_screenshot`，严禁绑定到 `default`（全局默认）或任何其他业务功能（后端 400 拒绝，前端下拉置灰并说明原因）。
   - **不对 OpenAI 兼容模型写脆弱的「纯文本模型」正则**（当前全局默认 `claude-haiku-5-5` 即支持多模态），避免误杀自定义/中转视觉模型；继续依靠运行期 `validateContent: hasJsonObject` 与后台「试跑」实测校验。
4. **单真源与零隐藏旁路**：`ocr_screenshot` 统一以数据库算力池为唯一配置来源，不再暗中读取 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` 环境变量，避免页面停用或删渠道后后台仍在悄悄调用。
5. **两项体验漏洞收口**：
   - **测速台账透明化**：`ocr_recognition_logs` 新增可空 `fallback_detail jsonb`（向下兼容历史 90 天旧记录），完整记录每一次尝试的渠道、模型、结果/失败原因与耗时，`ocr_ms` 统一按全部识别尝试之和入账。
   - **截图槽位区重试按钮修复**：`src/components/submission/截图槽位区.tsx` 修复 `canRetry` 条件为 `Boolean(slot.assetUrl) || Boolean(slot.file)`，使上传失败与刷新草稿两种场景均可点击重试/重新识别。

---

## 二、完整数据流链路与改动点

### 链路 A：接入 / 管理 / 测试 / 同步 Clairic 渠道
```
管理员打开「接入新渠道」
  → 选 protocol = cloudflare_clairic，填 base_url（官方 / AI Gateway / 自定义代理）+ api_key（Bearer Token）
  → POST /api/admin/ai-config { action: "probe_provider_models", protocol, base_url, api_key }
     → normalizeProtocolBaseUrl()（校验 HTTP/HTTPS，去除末尾斜杠及重复的 /@cf/cloudflare/clairic）
     → discoverModelIds() 识别 protocol === "cloudflare_clairic" → probeClairicOcr({ baseUrl, apiKey })
     → 探针成功返回 modelIds: ["clairic"] / upstreamModelIds: ["@cf/cloudflare/clairic"]（失败返回清晰中文原因，不回显密钥）
  → 点「保存渠道」→ POST /api/admin/ai-config { action: "create", entity: "key", protocol, base_url, api_key, label, selected_model_ids }
     → handleCreateKey() 按 (rtrim(base_url,'/'), protocol) 匹配或新建 ai_providers(protocol)
     → 原子 RPC create_ai_config_channel 写入 ai_providers / ai_provider_keys / ai_provider_key_models(model_id='@cf/cloudflare/clairic', canonical_model_id='clairic', display_name='Cloudflare Clairic')
  → 算力池日常运维：
     - 内联改地址/换 Token：允许改成任意合法 HTTP/HTTPS 代理地址，保持原 protocol 不变（不靠 URL 猜协议）
     - 调顺位：swap_model_channel_order 原生生效
     - 单模型测试 / 渠道测试 / 同步模型 / 全池检查：均读取 ai_providers.protocol，Clairic 走 probeClairicOcr + 同一套 5 态健康记录
```

### 链路 B：截图识别运行时调度与多账号 429 自动冷却 + 回退
```
POST /api/ocr-screenshot（multipart 本地直传 或 bucket+path 云端重识）
  → 读取 feature_key = "ocr_screenshot" 绑定模型 + feature_key = "default" 全局默认
  → resolveFeatureChannelChain() 输出顺位候选链（主模型全部可用渠道 → 全局默认可用渠道 → 冷却中渠道按最早解冻排末位）
     ※ 当主模型为 clairic 时，主模型健康渠道上限放宽至 5 条（Clairic 单次 5s 超时、429 <1s 快失败，确保多账号都能顺位顶上）
  → 逐条执行候选渠道（总预算 60s）：
     - 若 channel.protocol === "cloudflare_clairic"：
       callClairicOcr({ buffer, contentType, fields: CLAIRIC_FIELDS_V2[type] }, { baseUrl: channel.baseUrl, apiKey: channel.apiKey, modelId: channel.model })
       · 成功 → recordProviderSuccess → convertClairicAnswersToResponse()（业务全空 slot_status="failed" 直接返回，不回退）
       · 异常（429 / 401 / 403 / 5xx / timeout / invalid_response）→ recordProviderFailure（429 立即入 1/5/30/60 分钟冷却，401 永久失效）→ 记录 attempt → 切下一条候选渠道
     - 若 channel.protocol === "openai_compatible"：
       走单渠道视觉调用（normalizeVisionDataUrl + buildPromptByType + validateContent: hasJsonObject + parseOcrResponse）
       · 成功 → recordProviderSuccess；异常 → recordProviderFailure → 记录 attempt → 切下一条候选渠道
  → 落账 ocr_recognition_logs：
     - ocr_ms = 所有识别尝试耗时之和
     - channel_name = 最终成功（或最后失败）渠道名
     - model_id = 最终成功（或最后失败）模型 ID
     - fallback_detail = { attempts: [{ channel_name, model_id, protocol, ok, elapsed_ms, error_code?, reason? }] }
```

### 链路 C：数据库迁移（严格向后兼容）
`supabase/migrations/20261122140000_ai_provider_protocol_and_retire_baidu_ocr.sql`：
1. `alter table public.ai_providers add column if not exists protocol text not null default 'openai_compatible' check (protocol in ('openai_compatible', 'cloudflare_clairic'));`
2. 更新 `create_ai_config_channel`：删旧 8 参重载，重建带 `p_protocol text default 'openai_compatible'` 的 9 参函数（按 `rtrim(p.base_url,'/') = p_base_url and p.protocol = coalesce(p_protocol, 'openai_compatible')` 复用或新建 `ai_providers`，并 re-grant `service_role`）。
3. `alter table public.ocr_recognition_logs add column if not exists fallback_detail jsonb default null;`
4. 清理旧百度 OCR 绑定元数据：
   - `delete from public.ai_feature_bindings where feature_key = 'ocr_screenshot_structure';`
   - `update public.ai_feature_bindings set label = '截图识别', channel_settings = '{}'::jsonb where feature_key = 'ocr_screenshot';`

---

## 三、前端交互与视觉设计规范（已审定）

严格遵循 `docs/reference/效率美学.md` 与 `docs/reference/美学宝典.md`（字号 12/13/14/20px、四阶墨 `#141413/#1F1E1D/#78716C/#A8A29E`、圆角 `rounded-md/xl/2xl`、`npm run gate:design` 全绿）。

### 3.1 接入新渠道弹窗（`AddKeyDialog`）
- 步骤 1 在「API 接口地址」上方新增「接口协议」双选卡（桌面 2 列、移动单列，样式复用 `rounded-xl border p-3`，选中 `border-[#78716C]/50 bg-[#F1F1F0] ring-1 ring-[#141413]/15` + 右上角深色圆点勾选）：
  - 默认：`标准对话接口 (OpenAI 兼容)` — 适用于 OpenAI / Claude / Gemini / 千问等常规 AI 模型接入
  - 专项：`Cloudflare Clairic (截图专项)` — Cloudflare Workers AI 专项字段抽取模型，仅供截图识别调用
- 选 Clairic 时：
  - 地址占位符：`https://api.cloudflare.com/client/v4/accounts/{AccountID}/ai/run`，说明：`支持官方地址、AI Gateway 或自定义中转地址`
  - 名称占位符：`例如：Clairic 主账号、Clairic 备用（留空则使用地址主机名）`
  - 步骤 2：后端探测返回 `["@cf/cloudflare/clairic"]`（单模型），自动勾选、隐藏全选和搜索框，右侧灰色淡底小标 `bg-[#EBEBE9] text-[#78716C]` 显示 `截图专项`，保存按钮文案 `保存渠道 (Clairic 截图专项)`。

### 3.2 业务功能配置（`BusinessFunctionsPanel` & `BindingDialog`）
- 功能名统一为「截图识别」，彻底去掉 `ocr_screenshot_structure` 特殊过滤与 `ocr_screenshot_channel` 参数。
- `BindingDialog` 删除旧三选一模式卡（OCR+模型 / 视觉直识 / Clairic 极速）；保留左列系统提示词 + 右列模型调度与专家设置；当 `ocr_screenshot` 选中的模型是 `clairic` 时，在「指定模型」下拉下方显示说明框（`rounded-md border border-[#E2E2DF] bg-[#F7F7F6] p-2 text-[12px] text-[#78716C]`）：`Clairic 是 Cloudflare 专项字段抽取模型，使用内置字段清单，系统提示词对其不生效`。
- 行内「试跑」直接传 `{ feature_key: "ocr_screenshot" }`，按当前所选模型实测对应通道并返回结果。

### 3.3 能力隔离与算力池展示（`ModelFamilySelect`、`ChannelPoolView`、`ModelFamilyCard`）
- `ModelFamilySelect` 新增可选 prop `featureKey?: string`：
  - `clairic` 模型右侧追加轻文字 `· 截图专项`（12px `#78716C`，不加噪音徽标）。
  - 当 `featureKey !== "ocr_screenshot"` 时，`clairic` 置灰禁用，右侧说明：`featureKey === "default"` 显示 `截图专项，不能用作全局默认`，其他业务功能显示 `截图专项，不支持对话`（若历史已误选则仍允许展示当前值但不可新选）。
  - **不做 OpenAI 兼容模型的纯文本猜测禁用**，所有常规模型在「截图识别」中均可选。
- `ChannelPoolView` 右侧渠道详情属性区新增只读一行「接口协议」：
  - 标准接口：`标准对话接口 (OpenAI 兼容)`（不加额外徽标，避免噪音）
  - Clairic：`Cloudflare Clairic` + 灰色淡底小标 `截图专项`
  - 内联编辑 API 地址允许改为任意合法 HTTP/HTTPS 代理地址，保持协议不变。
- `ModelFamilyCard` / `ModelChannelRow` 不给每行加冗余协议徽标，直接复用现有 5 态徽标、冷却倒计时与多账号顺位调整。

### 3.4 截图识别测速台账（`OcrSpeedDrawer`）
- 「耗时」列：
  - 正常单次直出：速度徽标 + `纯识别: 1.42s`（总识别耗时）。
  - 发生多段回退（`fallback_detail.attempts.length > 1`）：速度徽标（按总耗时）+ 温和警示色小标 `已回退`（`bg-[#F7F3ED] text-[#8A6A2F]`）+ 纵向堆叠拆解路径（12px `#78716C` 元数据墨，不用刺眼红）：
    ```
    ├ CF账号1 限流429 · 1.14s
    └ CF账号2 成功 · 1.48s
    ```
  - 历史旧记录（`fallback_detail == null`）：
    - 普通历史记录：保持原样显示 `纯识别: xxx`（不刷屏噪音文字）。
    - 历史回退记录（`channel_name` 含 `->`）：显示温和提示 `历史回退记录（未拆解各段耗时）`（12px `#78716C`），不伪造数据。
- 「渠道与模型」列：始终显示最终生效（或最后尝试）的渠道名与模型 ID。

### 3.5 截图槽位区重试按钮（`src/components/submission/截图槽位区.tsx`）
- `canRetry` 从 `Boolean(slot.assetUrl) && Boolean(slot.file)` 修复为 `Boolean(slot.assetUrl) || Boolean(slot.file)`。

---

## 四、架构约束与禁区

- **分层门禁红线**：`src/lib/**` 严禁 import `@/app/**`；`src/components/**` 只允许 import `@/app/**/actions`（ESLint 强制阻断）。
- **无密钥泄露**：日志、接口响应、`fallback_detail`、前端 toast 一律脱敏，严禁回显 API Token。
- **可维护性门禁**：保持文件/函数精简，遵守 `scripts/maintainability-baseline.json`。
- **不碰禁区**：不动 `daily_reports`、不动权限/RLS、不动 COS 存储逻辑、不删历史 `ocr_recognition_logs`。

---

## 五、可逐条验收清单（14 条）

| # | 验收项 | 期望结果与判断标准 |
|---|--------|--------------------|
| 1 | 百度 OCR 彻底下线 | `baidu-ocr.ts`、`baidu-channel.ts`、`ocr-channel.ts`、`channel-config.ts` 已删除；`feature-catalog.ts` 无 `ocr_screenshot_structure`；`BindingDialog` 无三选一模式卡；全仓 `src/` 零百度运行期引用 |
| 2 | 数据库迁移向后兼容 | 新 migration 可在空白库和现行生产结构上幂等执行；存量 `ai_providers` 默认为 `openai_compatible`；存量 `ocr_recognition_logs` 零丢失且 `fallback_detail` 默认 null |
| 3 | 接入 Clairic 渠道（协议选择与探测） | 后台「接入新渠道」可选 `Cloudflare Clairic (截图专项)`，填入官方地址或代理地址 + Token 探测成功返回 `@cf/cloudflare/clairic` 并自动勾选保存；鉴权失败或地址错误返回清晰中文提示且不泄露密钥 |
| 4 | 多账号顺位与修改地址/密钥 | 录入 2 个以上 Cloudflare 账号后均聚合到 `Clairic` 模型卡下，支持内联改地址（含自定义代理地址）、改 Token、停用、删除与上下调顺位 |
| 5 | 协议级同步与连通测试 | 对 Clairic 渠道执行单模型测试、渠道测试、同步模型、全池检查均走 Clairic 轻量探针，不再请求 `/models` 或 `/chat/completions` 报 404/502 |
| 6 | 能力隔离（前后端双端） | `Clairic` 仅在「截图识别」下拉中可选；在「全局默认」及其他业务功能下拉中禁用并给出说明；直接发请求将 `clairic` 绑定给 `default` 或 `content_tools` 被后端 400 拒绝 |
| 7 | 截图识别行与高级弹窗精简 | 功能名统一为「截图识别」，行内直接下拉切 Clairic 或视觉大模型；高级弹窗无三选一模式卡，选中 Clairic 时显示「系统提示词对其不生效」说明；「试跑」按当前所选模型实测对应渠道并返回清晰结果 |
| 8 | 多账号 429 自动冷却与顺位切换 | 模拟 CF 账号 1 返回 429 → 自动记录失败进入冷却并无缝切 CF 账号 2 成功；后续请求直接跳过冷却中的账号 1 |
| 9 | Clairic 全不可用自动兜底全局默认 | 全部 Clairic 账号 429/超时时，无缝回退到「全局默认」视觉模型完成识别；业务全空（`slot_status: "failed"`）直接返回不错误回退 |
| 10 | 测速台账真实耗时与回退拆解 | 发生回退时 `ocr_recognition_logs.ocr_ms` 为所有尝试之和，`fallback_detail` 记录每段渠道/原因/耗时；抽屉「耗时」列清晰展示拆解路径，历史 90 天无 `fallback_detail` 记录正常渲染不报错 |
| 11 | 截图槽位区「重试 / 重新识别」按钮修复 | 上传失败（有本地 file 无 assetUrl）与刷新草稿后（有 assetUrl 无本地 file）两个场景下，按钮均可见并能触发重试/云端重识（单测 + 浏览器实测） |
| 12 | 线上零中断与真实识别验收 | 发布 CloudBase 上海后，`/api/health?check=cloudbase` 返回 200 `up`；Ego Lite 实测管理后台接入/切换/测试/台账全流程 + `/dashboard` 真实传图识别闭环 |
| 13 | 全部 7 项推送门禁 + 构建全绿 | `doc:links`、`tsc --noEmit`、`npm test`、`eslint`、`gate:design`、`gate:maintainability`、`gate:api-error`、`npm run build` 全部通过，零绕过 |
| 14 | 测试数据净零与日志留档 | 验后清除测试渠道/草稿/COS 测试图，生产原有渠道与业务表零污染；更新 `docs/reference/上线与运维.md` 与 `日志/2026-11-22.md` |
