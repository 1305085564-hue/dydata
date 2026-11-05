# AI 配置页界面重做 · Antigravity 任务书

> 发给：Antigravity。出题与验收：CC。日期：2026-11-05。
> 逻辑已由 Codex 做完。你只做界面：页面长什么样、怎么点。所有「能不能用、用谁、会影响谁」都由后端算好，你只负责读出来、摆好看。

## 一、动手前必读（按顺序读完再动手）

1. `AGENTS.md`：项目规则。
2. `docs/系统架构与设计/Claude设计哲学.md`：读第 0、1 章，按「1.3 步骤链 B：改已有页」走。需要具体数值时查 `视觉与数值手册.md`，需要组件做法时查 `组件与场景契约.md`。
3. `docs/plans/2026-11-05-AI配置页口径重整与链路精简-总方案.md`：读第二节（8 条口径）、第三节（取舍清单）、第六节（落地决策）。
4. `docs/reference/2026-11-05-AI配置重整-数据契约.md`：全文必读，这是你唯一的数据依据。
5. `src/lib/ai-config/presentation.ts`：所有状态文案都在这里。

一句话心智：**业务选一个模型 → 模型由几条渠道排队供货 → 渠道就是买来的 API**。页面上只有这三样东西。

## 二、最高铁律（违反任何一条即返工）

1. **只改界面文件**。只许改 `src/app/(app)/admin/ai-config/` 下的 `components/`、`ai-config-shell.tsx`、`page.tsx` 和同目录的 `*.test.tsx`。禁止改 `hooks/`、`src/lib/`、`src/app/api/`、`supabase/`。觉得非改不可，就跳过并写进交付清单，由 CC 转给 Codex。
2. **不许自己算状态**。能不能用、能用几条、当前优先用谁、是否顶班、是否停摆、影响哪些业务，一律读契约字段。禁止在组件里根据 `is_enabled`、失败次数、`unhealthy_until`、`invalidated_at`、健康字段自己推算。
3. **状态文案只从 `presentation.ts` 取**。按字段里的 `messageKey` 查表显示，状态文字一个都不许写死在组件里。按钮名、标题这类非状态文字可以写在组件里。
4. **写操作只用 `runCommand(action, data, entity)`**，`action` 只能用契约「操作与影响确认」和「接入、同步与找渠道」「检测与恢复」三节列出的。禁止使用 `test_all_keys`、`test_all_keys_all_models`、`sleep_key`、`resume_key`，禁止传 `provider_key_model_id`、`priority`。
5. **数值只从设计规范抄**。颜色、字号、间距、圆角只用设计系统已有令牌和页面现有组件。规范里没有的数值一个都不许出现，不许「凭审美」造。
6. **代码里标着「一次性、待删、勿参考」的块，整块删掉按契约重写，不许参考它的写法**。目前有 4 处：`compute-pool-panel.tsx`、`model-family-card.tsx`、`channel-pool-view.tsx`、`business-functions-panel.tsx`。
7. **拿不准就跳过并记录**，不许猜。

## 三、改动清单（编号对应总方案第三节）

每一项写了「改成什么」和「读哪个字段 / 调哪个操作」。字段名全部以数据契约为准。

### A. 业务功能视角（`business-functions-panel.tsx`、`model-family-select.tsx`、`bindings-dialogs.tsx`）

| 编号 | 改成什么 | 数据来源 |
|---|---|---|
| S4 + N1 | 「渠道冗余与健康度」「运行状态」两列合并为一列「现在状态」。正常显示「当前优先使用：X」；顶班显示「X 暂时不可用，当前优先使用默认 Y」；停摆标红 | `availability.businessAssurances[]` 按 `key` 对应功能；文案用 `messageKey` 查 `presentation.ts`；模型名用 `preferredModelId` / `selectedModelId` 到 `availability.modelFamilies[]` 里取 `displayName` |
| — | 删掉 `getStatusForFeature` 之类的前端状态推算，删掉组件里自带的状态字典 | 只读 `routingStatus` + `messageKey` |
| — | 模型下拉：列出 `modelFamilies`；`isSelectable=false` 的置灰，旁边写不可选原因；当前已选的模型即使不可选也照常显示、保留 | `isSelectable`、`unavailableReasonKey` |
| D9 | 全局默认下拉删掉「未配置 · 按渠道顺位兜底」这一项，默认不能为空 | 保存用 `set_global_default_model {model_id}` |
| — | 保存业务配置 | `save_feature_control {feature_key, model_id(null=跟随默认), 提示词/参数}`；**不传** `provider_key_model_id` |
| D10 | 高级参数弹窗：删掉「功能启用」开关（行上已有停用按钮）；Token 上限、上下文轮数收进默认折起的「专家设置」；「修改即时同步」改成「保存后生效」 | — |

### B. 顶部摘要（`compute-pool-panel.tsx` 顶部）

| 编号 | 改成什么 | 数据来源 |
|---|---|---|
| S3 | 「全池供给 / 冗余 / 单点风险」换成一行：「N 个功能正常 · N 个在顶班 · N 个停摆 · N 条渠道要你处理」。停摆数大于 0 时标红 | `availability.businessSummary.normal / fallback / outage / needsAttentionChannels` |

### C. 模型视角（`compute-pool-panel.tsx`、`model-family-card.tsx`）

| 编号 | 改成什么 | 数据来源 / 操作 |
|---|---|---|
| D1 | 删除「模型管理」弹窗和它的入口，连同 `model-manager-dialog.tsx`、`shelf-models-dialog.tsx` 两个文件。模型列表上方改成「只看在用 / 全部」切换，默认「只看在用」 | `isShelved=true` 即「在用」 |
| D13（新） | 「彻底删除模型记录」整个去掉，不搬到别处。理由：下次同步会把它重新加回来，删了也白删；要停就用「停用模型」，要清理上游已下线的用同步里的一键清理 | — |
| S5 | 模型卡汇总改成「3 条渠道供货，2 条能用」。恰好 1 条能用时加提示「只剩 1 条能用，建议再加一条」；0 条时显示不可用原因 | `channels.length`、`schedulableChannelCount`、`singlePointRisk` → `model.single_supply`；`unavailableReasonKey` |
| 陷阱 A | 渠道行上的开关只管「这个模型在这条渠道上的供应」，不再关整条渠道 | `update / model {id: channels[].keyModelId, is_enabled}`。**禁止用 keyId** |
| N4 | 模型卡加「停用模型 / 恢复模型」按钮 | `set_model_enabled {model_id, is_enabled}` |
| D6 | 模型卡渠道行上的「同步模型」「删除此渠道」两个按钮删掉（这是整条渠道的操作，只留在渠道视角） | — |
| D8 | 删掉「已就绪，但全站未启用」提示 | — |
| D2 | 删掉「临时休眠 30 分钟」「恢复调度」按钮和休眠期间锁顺位的提示（在 `model-family-card.tsx`、`model-test-feedback.tsx`） | — |
| 口径 5 | 渠道行状态只有四种：能用 / 暂时歇着（显示到几点会再试）/ 需要你处理（附原因）/ 已停用（灰色）。「需要你处理」的留在主列表里显眼位置，不许收进折叠区；只有「已停用」可以折叠 | `channels[].messageKey`；歇着用 `sleepUntil`；原因用 `bundle.models[].failureDiagnostic`（按 `keyModelId` 关联），技术详情默认折起 |
| 口径 4 | 渠道排队顺序：上移 / 下移 | `swap_model_channel_order {model_id, key_model_id, target_key_model_id}`。**相邻关系按 `sortOrder` 判断，不按数组下标**（数组里可能临时把恢复试用的供应排在前面） |
| N2 | 模型卡加「为此模型找渠道」：列出候选渠道，每条标「未测试」；点「打开」后端会先测，测通才打开。失败时显示失败原因，开关保持关闭。候选的渠道或地址组本身是关的，写「请先打开这条渠道」 | 列表：`find_model_channels {model_id}` → `candidates[]`；打开：`enable_model_channel {key_id, model_id}`，成功读 `enableResult`，失败是 HTTP 422 读 `testResult` |
| 口径 9 | 模型全挂了也不许从列表里消失，标「暂时不可用」 | `isShelved`、`unavailableReasonKey` |
| — | 模型改名保留（行内改名），改的是这个模型在所有渠道上的名字 | `update / model {id: keyModelId, display_name}`，禁止传 `model_id` |

### D. 渠道视角（`channel-pool-view.tsx`）

| 编号 | 改成什么 | 数据来源 / 操作 |
|---|---|---|
| D3 | 删掉 #N 序号和两段顺位说明，删掉渠道优先级编辑相关的全部代码 | — |
| D5 | 渠道详情里删掉「所属接入点」下拉 | — |
| S7 | 改 API 地址时，如果同地址还有别的渠道，弹出「同地址的 N 条渠道会一起改」并列出名字，确认后再改 | 第一次请求返回 409 且带 `sharedAddressImpact` → 弹窗 → 原请求加 `confirm_shared_address: true` 重发。文案键 `operation.shared_address` |
| 口径 5 | 渠道状态同 C 节四种 | `availability.keys[].messageKey`，原因 `bundle.keys[].failureDiagnostic` |
| — | 「检测此渠道」保留 | `test_key {key_id, test_mode:"text"}`，结果读 `testResult` |
| — | 渠道里的模型勾选：取消勾选只是关闭，不删除 | `set_key_model_selection {key_id, model_ids}` |
| — | 删除整条渠道保留，走 H 节统一确认 | `delete / key {id}` |

### E. 检查与测试（`compute-pool-panel.tsx` 顶部按钮、`model-test-feedback.tsx`、`channel-model-test-list.tsx`）

| 编号 | 改成什么 | 数据来源 / 操作 |
|---|---|---|
| S1 | 「巡检全部渠道」「全部模型检测」两个按钮合并成一个「检查一遍」，旁边小字「只查正在用的模型」 | `check_all_in_use {}` |
| S2 | 三种检测结果条合并成一个「最近一次检查结果」：「共查 N 组，M 组通过，K 组失败」，失败的逐条列出渠道、模型和原因。`total=0` 时写「现在没有需要检查的对象」，**不许写「全部通过」** | `checkResult.total / successCount / failureCount / results[]` |
| 口径 6 | 测试按钮只有一种结果：通过就显示「已恢复能用」，失败就显示原因。删除所有「通过但仍休眠」之类的分支文案 | `testResult` |

### F. 接入新渠道（`add-key-dialog.tsx`、`providers-dialogs.tsx`）

| 编号 | 改成什么 | 数据来源 / 操作 |
|---|---|---|
| S6 | 不再要求先选或先建「接入点」：直接填地址和钥匙 → 点「获取模型」→ 勾选模型 → 保存。删除弹窗里内嵌的「新增接入点」小表单 | 获取：`probe_provider_models {base_url, api_key}` → `modelIds`、`modelGroups`；保存：`create / key {base_url, api_key, label?, selected_model_ids}`，`selected_model_ids` 始终要传，可以是空数组 |
| D4 | 删除「调度顺位优先级」输入项 | — |
| 保留 | 获取模型后，自动勾上正在被业务或全局默认使用的模型 | 业务正在用的模型 = `businessAssurances[].selectedModelId` 加 `globalDefaultModelId`，与 `modelIds` 取交集 |
| — | 删除 `add-key-dialog` 的 `providerId` 入参 | — |
| 保留 | 接入点管理（`providers-dialogs.tsx`）保留，只用于整组改地址、整组停用。整组停用走 H 节统一确认 | `update / provider {id, base_url}` 或 `{id, is_enabled}` |

### G. 同步模型（`sync-models-dialog.tsx`，以及渠道视角的上游比对卡）

| 编号 | 改成什么 | 数据来源 / 操作 |
|---|---|---|
| 口径 7 | 同一个模型的不同写法显示成一行，名字用 `displayName`；点开「更多版本」才看到别的写法和带日期、Thinking、Agentic 的变体。勾选时存的是真实 ID | `syncResult.modelGroups[] {displayName, recommendedModelId, modelIds}` |
| S9 | 标签只保留「在用」和「新发现」两种，其他标签删掉。修好键盘勾选：焦点在勾选框上时按空格要能勾选和取消 | — |
| D7 | 删掉「疑似，未验证」分类 | — |
| S8 | 上游比对卡（5 种状态、4 个按钮）换成一行字「上游新增 N 个 / 下线 N 个」，加一个「同步模型」按钮 | `sync_key_models {key_id}` → `syncResult.newCount`、`reconciliation` |
| 口径 7 | 「清理上游已下线的模型」：一键清理后逐条显示结果。没删掉的要写清原因（还开着 / 还有业务在用 / 上游其实还在 / 无法确认） | `cleanup_stale_models {key_id, model_ids}` → `cleanupResult[].status / reason` |
| D12 | 删掉同步弹窗里永远不会出现的「刷新中 / 刷新失败」提示条，删掉页面底部装饰文案 | — |
| 保留 | 同步弹窗里的划选批量勾选 | — |

### H. 危险操作确认（`dangerous-action-dialog.tsx`，统一一个）

适用于四种停用（接入点、渠道、单个供应、整个模型），以及删除渠道、删除单条供应、取消勾选。

- 流程：先照常发请求。后端返回 HTTP 409 且 `requiresConfirmation: true` 时，弹出确认框：标题用 `operation.confirm_impact`，列出 `affectedBusinesses[].label`，下面一句「更稳的做法：先给这些业务换个模型，或者先接一条新渠道」。用户点确认后，**原请求原样重发，`data` 里加 `confirm_impact: true`**。
- 后端没有返回 409 的，直接执行，不弹框。
- **不许前端自己预判会不会停摆**。名单已经算进了全局默认。
- 明细（技术信息）默认折起。
- D11：删除类操作的两层确认合并为一层。

### I. 拆分大文件（最后做）

`compute-pool-panel.tsx`（1031 行）、`model-family-card.tsx`（892）、`sync-models-dialog.tsx`（830）、`channel-pool-view.tsx`（807）改完后每个都必须 ≤ 800 行，越短越好。按「一个组件一个职责」拆，例如顶部摘要、检查按钮与结果条、找渠道面板、渠道行，各拆一个文件。拆的时候只搬代码，不改逻辑。

## 四、最容易出的事故（提前堵住）

1. **删弹窗不等于删功能**。删「模型管理」弹窗时，只删上下架、全部/现役/储备和彻底删除。模型改名、停用/恢复要在模型卡上有入口。删之前先列出弹窗里每个按钮的去向，写进交付清单。
2. **关掉的东西不许消失**。停用的供应灰色显示，可以折叠；「需要你处理」的必须显眼；全挂的模型照样显示。
3. **不许出现「实际在用」四个字**。一律是「当前优先使用」。
4. **「能用 N 条」不许自己数**。只用 `schedulableChannelCount`。
5. **409 不是报错**。带 `requiresConfirmation` 的 409 要弹确认框；带 `sharedAddressImpact` 的 409 要弹同地址确认框。两种确认标记不一样，不能混用：前者 `confirm_impact`，后者 `confirm_shared_address`。别的 409 才当错误提示。
6. **422 也不是系统坏了**。「打开候选渠道」返回 422 表示现场测试没通过，显示 `testResult` 里的原因即可。
7. **红色只给停摆和需要你处理**。顶班不是故障，不许用红色。
8. **`useAiConfig()` 里的旧函数一律不用**：`mutateEntity`、`setKeySleep`、`testAllKeysAllModels`、`mutateFeatureControl`。尤其是 `mutateEntity`，它会把 409 的影响名单吞掉、直接弹报错，确认流程就断了。新代码只用 `runCommand`、`checkAllInUse` 和 `bundle` / `useAvailabilityReport` 里的数据。

## 五、改法示例

```tsx
// ❌ 自己算状态
const usable = channels.filter(c => c.isEnabled && !c.unhealthyUntil).length;
const label = usable > 0 ? "正常" : "停摆";

// ✅ 只读契约
const label = formatMessage(assurance.messageKey, {
  preferredModelName: nameOf(assurance.preferredModelId),
  selectedModelName: nameOf(assurance.selectedModelId),
});
const usable = family.schedulableChannelCount;
```

```tsx
// ❌ 模型卡上的开关关掉整条渠道
onToggleKeyEnable(channel.keyId, false);

// ✅ 只关这一条供应，并处理确认
const res = await runCommand("update", { id: channel.keyModelId, is_enabled: false }, "model");
if (!res.ok && res.status === 409 && res.requiresConfirmation) {
  openImpactDialog(res.affectedBusinesses, () =>
    runCommand("update", { id: channel.keyModelId, is_enabled: false, confirm_impact: true }, "model"));
}
```

`formatMessage`、`nameOf` 只是示意。`runCommand` 返回值的真实形状见 `src/lib/ai-config/client-command.ts` 的 `AiConfigCommandResult`：成功是 `{ok:true, body}`，失败是 `{ok:false, status, error, requiresConfirmation, affectedBusinesses, sharedAddressImpact?, testResult?}`。

## 六、本地验收（必须做，只许用本地库）

- **禁止连生产库**。`.env.local` 指向生产库，直接 `npm run dev` 在页面上点开关，改的就是线上配置。启动方式只许用：

```bash
set -a; . ./.env.ai-test.local; set +a; npx next dev -p 3236
```

- 打开页面后，先在浏览器网络面板确认请求的数据库地址是 `127.0.0.1`，不是就立刻停。
- 登录账号见 `docs/通用管理/测试账号.md`。
- 演示数据：用 Codex 提供的本地演示数据脚本（CC 会通知你脚本就绪）。它会把正常、顶班、停摆、歇着、需要你处理、已停用、只剩 1 条、5-5 与 5.5 两种写法这些状态都造出来。脚本没就绪前可以先写代码，浏览器验收等脚本。
- 逐个场景截图（每张图标场景编号）：
  1. 业务视角三种状态各一行（正常、顶班、停摆）。
  2. 顶部摘要一行字。
  3. 模型卡：3 条供货 2 条能用；只剩 1 条的提示；全挂的模型仍在列表里。
  4. 渠道行四种状态，「需要你处理」展开原因。
  5. 关掉一个业务唯一可用的供应：先弹影响名单，确认后才关。
  6. 停用模型再恢复：恢复后开着的供应和停用前一样。
  7. 在模型卡关一条供应：同渠道其他模型不受影响（看渠道视角）。
  8. 改共享地址：弹出「同地址的 N 条渠道会一起改」。
  9. 为此模型找渠道：一条打开成功，一条测试失败显示原因。
  10. 同步弹窗：5-5 和 5.5 合成一行，展开看到两种写法；键盘空格能勾选。
  11. 检查一遍：结果条；没有对象时显示「现在没有需要检查的对象」。
  12. 接入新渠道：不用先选接入点，填地址和钥匙即可。
- 页面控制台不许有报错。

## 七、完成后必须跑的自检（把输出原样贴回来）

```bash
cd "src/app/(app)/admin/ai-config"
grep -rnE "sleep_key|resume_key|test_all_keys|provider_key_model_id|providerKeyModelId|priority|global_is_enabled|globalIsEnabled|onToggleKeyEnable|一次性、待删|实际在用|全站未启用|疑似|mutateEntity|setKeySleep|testAllKeysAllModels|mutateFeatureControl" components ai-config-shell.tsx page.tsx --include="*.tsx" | grep -v "\.test\.tsx"
grep -rnE "consecutive_failures|unhealthy_until|invalidated_at|last_success_at|isSchedulable" components --include="*.tsx" | grep -v "\.test\.tsx"
grep -rnE "\"(能用|暂时歇着|需要你处理|已停用|停摆：无可用模型)\"" components --include="*.tsx" | grep -v "\.test\.tsx"
ls components/model-manager-dialog.tsx components/shelf-models-dialog.tsx
wc -l components/*.tsx | sort -n | tail -5
cd /Users/mac/Projects/dydata
npx tsc --noEmit --pretty false
npm run lint
npm run build
AI_GOVERNANCE_TEST_URL=http://127.0.0.1:54321 npx tsx --test --test-concurrency=1 'src/app/(app)/admin/ai-config/'*.test.tsx
npm run gate:maintainability
npm run gate:design
```

预期：前三条 grep 没有输出；`ls` 报两个文件不存在；行数最大的不超过 800；后面的命令全部通过。`gate:maintainability` 里不许出现 `ai-config` 目录下的条目。有输出或失败的，要么改掉，要么在交付清单里写明原因。

## 八、交付清单

1. 本地提交，提交说明以 `feat(ai-config-ui):` 开头。**不许 push**。
2. 按编号逐项列出：改了哪个文件、改成什么样。
3. 第六节 12 张截图。
4. 第七节自检的原样输出。
5. 「模型管理」弹窗里每个按钮的去向。
6. **跳过或没做完的项、以及原因，一条都不许隐瞒。**
