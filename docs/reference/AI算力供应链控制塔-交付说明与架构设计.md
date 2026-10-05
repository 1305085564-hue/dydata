# AI 算力供应链控制塔 —— 分组、模型与故障推演工作台
## 交付说明与架构设计文档

> **设计与施工**：[An] Antigravity（前端视觉总控与交互架构）  
> **设计基线**：《Claude 设计哲学》·《Claude 设计规范（高密度产品适配版）》  
> **核心原则**：“渠道只标识供应商归属，分组（API Key 专线）与具体模型是真正的核心调度单元；坏哪个模型红哪个模型，全坏或专线断连才亮大红灯，空分组绝不掩盖真实故障”。

---

## 一、交付物清单

1. **Next.js 生产级组件库**：
   - 页面路由入口：`src/app/ai-routing-tower/page.tsx`
   - 主工作台容器：`src/components/compute-tower/compute-tower-shell.tsx`
   - 纯函数状态引擎：`src/components/compute-tower/status-engine.ts`
   - 完整业务实体类型：`src/components/compute-tower/types.ts`
   - 全场景 Mock 数据集：`src/components/compute-tower/mock-data.ts`
   - 模块化子组件：
     - `stat-overview.tsx`（工业级控制塔大盘概览与全局体检控制）
     - `perspective-selector.tsx`（三重视角切换、跨层级检索与 6 态过滤器）
     - `channel-view.tsx`（渠道视角：严格三层嵌套，彻底消灭平铺盲区）
     - `group-view.tsx`（分组视角：全网同名专线聚合大盘）
     - `model-view.tsx`（模型视角：多路供货拓扑、P1/P2/P3 顺位与容灾回退推演）
     - `status-badge.tsx`（严格符合 Claude 规范的状态徽标）
     - `model-manager-drawer.tsx`（分组挂载模型抽屉与增减差异对比）
     - `fault-detail-dialog.tsx`（故障分级诊断与高风险操作二次确认）
     - `health-check-modal.tsx`（多步并发体检进度控制台与可中断留存）
     - `fault-simulation-panel.tsx`（4 大典型供应链事故推演沙盒）
2. **自动化测试套件**：
   - `src/components/compute-tower/status-engine.test.ts`（场景 A 到 F 核心业务规则 6 组自动化测试，**100% 通过**）
3. **零依赖独立单文件生产 HTML**：
   - `public/ai-routing-tower.html`（内嵌完整状态引擎、React 18、Tailwind CSS、SVG 图标与沙盒，任何环境**双击秒开**，无需 Node 服务与登录凭据）
4. **多端实测证据截图**：
   - 留档于 `docs/reference/screenshots/compute-tower/`
     - `screenshot-tower-desktop-channel.png`（1440px 桌面端渠道视角：三层严密从属）
     - `screenshot-tower-desktop-group.png`（1440px 桌面端分组视角：全网专线大盘）
     - `screenshot-tower-desktop-model.png`（1440px 桌面端模型视角：多路供货与顺位调度）
     - `screenshot-tower-claude-fallback.png`（P1 故障时实时触发 P2 回退接管与警告条）
     - `screenshot-tower-fault-modal.png`（故障诊断排查弹窗与根因分析）
     - `screenshot-tower-simulation-panel.png`（故障推演沙盒控制台）
     - `screenshot-tower-mobile-390px.png`（390px 移动端窄屏完美适配）

---

## 二、六大核心业务问题明确回答

### 1. 你如何表达“渠道 → 分组 → 模型”的层级关系？
- **物理结构彻底消灭平铺**：
  在早期的控制台设计中，供应商卡片把名下的所有 Key 堆在上面，底部的模型去重平铺，导致用户根本看不出模型到底属于哪条专线。我们在【渠道视角】中确立了**严格的视觉三层树状骨架**：
  - **L1 渠道卡片（供应商）**：展示供应商名称、类型（官方直连/第三方中转/自建网关）、整渠模型健康率（如 `4/4 健康`）以及名下专线总数；
  - **L2 专线分组（API Key 单元）**：缩进内嵌于渠道卡身内，明确标为 `🏷️ claude 专线`、`🏷️ gemini 专线`，展示本专线的专属健康状态与挂载模型数；
  - **L3 挂载的具体模型（叶子节点）**：紧随所属分组展开，每一个具体模型都携带自己的健康徽章、实测延迟（如 `285ms`）、优先级顺位（`P1`）以及独立的单点探测、排查与启停开关。
- **视觉线索**：采用背景浅灰差（`#FCFCFB` → `#FAFAFA` → `#FFFFFF`）、发丝边框与缩进引导线，层级一目了然，绝不越级穿透。

### 2. 你如何处理一个渠道下空分组和故障分组同时存在？
- **铁律：空分组绝不能伪装成健康供给，也绝不能洗白坏死分组**。
- **纯函数计算逻辑**：
  渠道的状态**只统计该渠道下实际挂载并启用的具体模型**：
  1. 遍历渠道名下所有分组，搜集所有启用的具体模型 `allModels`；
  2. 若 `allModels.length === 0`：渠道标记为灰色 `暂无可供给模型`；
  3. 若 `allModels` 存在，且全部模型均为故障（例如 `api3` 下有 `default` 空分组，以及 `gpt` 全军覆没分组）：
     虽然 `default` 分组没有故障报错，但由于该渠道**实际上一个能用的模型都没有**，渠道状态**严格判定为红色【全线故障】**！
  4. 若该渠道下有 `claude`（全健康）和 `gemini`（全故障）：
     只要有一个可用模型，渠道判定为黄色【部分异常】，提醒管理员有专线坏了，但不给渠道扣上“全线瘫痪”的帽子。

### 3. 你如何区分模型级故障与分组级故障？
- **模型级独立故障 (Model-Level Fault)**：
  - **表象**：分组下其他模型正常，但某一个特定模型返回 `404 model_not_found` 或上游限流；
  - **视觉表达**：该模型单行亮红灯，明确注明错误原因，但**分组卡头与渠道卡头仅显示黄色【部分异常】**，不会牵连该分组下其他健康模型；
  - **推演判定**：用户一眼看出“是上游没有开通这个模型，专线和 API Key 本身是通的”。
- **专线分组级故障 (Group-Level Fault)**：
  - **表象**：API Key 鉴权失败 (401)、服务商账户欠费余额耗尽 (402 Payment Required) 或专线网关断网；
  - **级联推导与视觉呈现**：
    - 分组卡片直接亮起红色警示条：`专线故障阻断：上游账户余额耗尽 (HTTP 402)`，标注`旗下所有模型调用均受阻`；
    - 分组下所有挂载模型被**级联标记为不可用**，并在诊断中指明根因源于分组；
    - 切换到【模型视角】时，该模型来源会明确显示 `[gemini 专线异常] 上游账户余额耗尽`，彻底免除管理员去单个模型排查的徒劳。

### 4. 你如何保证三个视角使用的是同一套数据？
- **单一真理数据源 (Single Source of Truth)**：
  状态机中只维护一份标准核心实体 `channels: Channel[]` 与 `modelCatalog: ModelCatalogItem[]`。
- **纯函数多维切面投影 (Pure Projections)**：
  - `computeChannelStatus(channel)`：以渠道为根做自下而上的健康聚合；
  - `GroupView`：纯函数将所有 `channel.groups` 按标准化的 `group.name`（如 `claude`）聚合成全网专线大盘；
  - `computeModelGlobalStatus(modelId, channels)`：遍历所有渠道所有分组搜集该模型的供货来源并按 `priority` 顺位排序；
- **操作全局联动**：
  在【渠道视角】的抽屉中勾选给 `api7 · claude` 新增了 `claude-opus-4`，切换到【分组视角】，`claude` 专线大盘立即增加该模型；切换到【模型视角】，`claude-opus-4` 立即显示出 `[api7] · claude` 作为供货来源。数据零拷贝、零重复聚合！

### 5. 你认为页面中最复杂的交互是什么？
- **模型视角下的动态容灾推演与调度顺位回滚机制 (Dynamic Failover Deduction & Optimistic Rollback)**：
  1. **多路容灾回退判定**：当模型的 P1 首选来源发生故障时，系统必须自动在 P2/P3 中寻找健康来源接管，并在卡头动态生成醒目的黄色回退条：`首选来源 P1 [api7] 故障，已自动降级由 P2 [api1] 接管业务 · 业务未中断`；
  2. **顺位调整的即时反馈与安全回滚**：管理员可以通过上移/下移/设为首选来重新编排供货顺位。系统采用**乐观更新 (Optimistic UI)** 瞬间重排，同时内置网络失败推演：如果远端调度服务同步失败 (HTTP 504)，系统能够自动捕捉并**安全回滚至上一顺位状态**，并向用户提供清晰的错误提示，兼顾极速响应与操作安全感。

### 6. 哪些地方你选择了简化，为什么？
- **简化了多余的“模型部署 (Deployment) 抽象层”**：
  在真实算力底层中，模型可能对应集群、Pod、实例等微观架构。但在供应链控制台中，我们坚持用户只需要理解“渠道 → 分组 → 模型”三层关系。把部署层剥离，能够让平台负责人在 3 秒内理清供货格局，避免把业务控制台退化为复杂的 K8s 运维底座。
- **简化了全屏锁死式的 Loading Spinner**：
  执行全局体检时，不锁死整个页面，而是通过轻量进度弹窗与行内微动画展现。管理员在体检过程中依然可以查看其他卡片，并且允许随时“中断体检，保留已完成的结果”。
- **克制了视觉噪点**：
  坚决不搞廉价的大屏深色渐变与满屏刺眼的饱和彩色色块。状态色严格执行“文字本色 + 8% 淡底 + 发丝边框”，留白使用四级语义梯度，把视觉焦点让渡给真实的故障信息。

---

## 三、复杂业务场景覆盖说明 (Scenarios A - H)

| 场景 | 对应 Mock 节点 | 行为与判定逻辑 |
| :--- | :--- | :--- |
| **场景 A：正常渠道** | `api7` | claude (2 模型健康)、gemini (2 模型健康)、default (空分组)；空分组标记为灰色“未挂载模型”，渠道状态精准判定为健康绿灯。 |
| **场景 B：部分模型故障** | `api1` | claude 专线下 sonnet 健康、haiku 故障 (404)、opus 待探测；分组与渠道均精准显示黄色【部分异常】，不误判全灭。 |
| **场景 C：整个分组级故障** | `OpenRouter` | gemini 分组标记余额不足 (402)；分组显示红色【专线不可用】，名下 flash 与 pro 均受阻，展现分组级因果关系。 |
| **场景 D：渠道仍可用** | `api2` | claude 全健康、gemini 全故障；渠道精准判定为【部分异常】，不能直接给渠道亮全线瘫痪红灯。 |
| **场景 E：空分组不掩盖故障** | `api3` | default 为空分组，gpt 下所有模型故障 (401)；即便有空分组，渠道依然严格判定为红色【全线故障】。 |
| **场景 F：多渠道供货与回退推演** | `claude-sonnet-4-5` | P1 api7、P2 api1、P3 OpenRouter；通过沙盒模拟 P1 故障，界面即刻高亮 P2 接管，展示动态回退警告条。 |
| **场景 G：长名称与极端数据** | `EdgeRelay-Cluster-US-East...` | 极长网关名称、极长微调模型名、极长 30000ms 超时堆栈，文字优雅截断带 Tooltip 与一键复制，布局丝毫不崩。 |
| **场景 H：空数据极限状态** | 沙盒场景 4 | 提供一键切换“完全空渠道”态、搜索无结果态、筛选无结果态，呈现清晰指引与一键重置恢复入口。 |

---

## 四、验证证据

- **自动化单测**：`npx tsx --test src/components/compute-tower/status-engine.test.ts` 全部 6 组场景用例 PASS；
- **全站静态类型检查**：`npx tsc --noEmit` 0 错误；
- **浏览器实测**：Playwright 驱动 Chromium 对 `public/ai-routing-tower.html` 进行端到端走查；
- **多端响应式**：1440px 桌面端、390px 移动端截屏全部实测验证无横向溢出，所有交互闭环可用。
