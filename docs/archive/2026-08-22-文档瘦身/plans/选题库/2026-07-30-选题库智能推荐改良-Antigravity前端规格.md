# 选题库智能推荐改良 · Antigravity 前端规格

> 日期：2026-07-30
> 范围：选题库 `/topics/page.tsx` Tab 架构重构，新增近期高热、高潜待挖、从未做过三个智能视图。
> 全局架构与评分公式见 `2026-07-30-选题库智能推荐改良-总方案.md`（必读）。
> 后端接口规格见 `2026-07-30-选题库智能推荐改良-Codex后端规格.md`（接口字段以它为准）。
> 视觉基线：全程遵守 `docs/美学规范.md`；颜色遵守「红涨绿跌」（`#C9604D` 红＝高于均值/正向，`#6FAA7D` 绿＝低于均值/负向）。

---

## 零、总原则

1. **不重写现有组件**。`SubTopicCard`、`TopicDetailModal`、认领逻辑全部复用，本次只改 `page.tsx` 的 Tab 层和数据获取逻辑。
2. **智能 Tab 展示额外字段**。后端为 trending / high_potential 返回 `_daysSinceLastWork`、`_avgPlayCount`，前端在卡片上展示，不改卡片组件结构，用 props 或外包一层标签。
3. **示弱原则**。评分是算法估算，不是承诺。卡片上展示的是事实数据（均播、天数），不展示原始分数，不说"系统认为这是最好的选题"。
4. **禁止参考 Codex 一次性前端代码**。改动在现役 `page.tsx` 基础上迭代。

---

## 一、改动地图

| 文件 | 改动内容 |
|---|---|
| `src/app/(app)/topics/page.tsx` | Tab 架构重构（核心改动） |
| 其他文件 | **不动** |

---

## 二、Tab 架构重构

### 2.1 现状

当前 `page.tsx` 有两层状态控制视图：
- `activeTab`：`"pool" | "comparison" | "recommendations"`
- `currentView`：`"all" | "my_claims" | "my_created"`

这两层拼出当前约 4-5 个视图，用户需要在 Tab 和下拉筛选之间来回操作。

### 2.2 目标：7 个扁平 Tab

用一个状态 `activeView` 替代原来的双层状态：

```typescript
type ActiveView =
  | "trending"        // 1 推荐选题（近期高热 + AI 建议两段式）
  | "high_potential"  // 2 高潜待挖
  | "never_worked"    // 3 从未做过
  | "my_claims"       // 4 脚本中
  | "all"             // 5 全部选题
  | "my_created"      // 6 个人选题
  | "comparison";     // 7 趋势变化
```

Tab 栏顺序与标签：

```
推荐选题  高潜待挖  从未做过  脚本中  全部选题  个人选题  趋势变化
```

默认激活：`"trending"`（推荐选题）。

Tab 4-7 的数据拉取逻辑与现有完全一致，只是从原来的 currentView 切换改为 activeView 切换。原有 `activeTab === "comparison"` 的逻辑迁移到 `activeView === "comparison"`，原有 `activeTab === "recommendations"` 的 AI 建议逻辑迁移到 Tab 1 下半部分（见 2.4）。

---

### 2.3 Tab 1：推荐选题（两段式布局）

Tab 1 分上下两个区块，用分隔线和小标题区分：

**上半区：近期高热**
- 数据来源：`GET /api/topics/pool?view=trending&page_size=8`
- 排序由后端完成（综合分），前端直接渲染
- 每张卡在 `SubTopicCard` 基础上，在标题右侧追加两个徽标：
  - **均播徽标**：`_avgPlayCount` 格式化（≥10000 显示 `x.x万`），颜色规则见 2.5
  - **新鲜度徽标**：`_daysSinceLastWork` ≤3 天 → 「🔥 N天前」文字橙色；4-7天 → 「N天前」普通灰；>7天 → 「N天前」浅灰
- 空态：「最近 30 天还没有作品数据。先发几条视频，积累数据后这里会自动出现推荐。」

**下半区：AI 选题建议**（与现有 recommendations Tab 完全相同，整体迁移）
- 标题：「AI 建议（基于近期爆款样本生成，尚未入库）」
- 数据来源：`GET /api/topics/recommendations`（不变）
- 卡片、采纳入库、依据说明全部沿用现有实现
- 视觉区隔：底色用浅 `stone-50`，左侧加 2px `#D97757` 描边，明确区分"系统给的创意"与"团队已录入的选题"

---

### 2.4 Tab 2：高潜待挖

- 数据来源：`GET /api/topics/pool?view=high_potential&page_size=8`
- 排序由后端完成
- 每张卡追加徽标：
  - **均播徽标**：同 Tab 1
  - **沉睡徽标**：`_daysSinceLastWork` >60 天 → 「💤 已N天未做」文字用 `#8AA8C7` 蓝灰，醒目提示机会窗口；30~60 天 → 「已N天未做」普通灰
- 空态：「最近 30 天内所有有历史作品的选题都还在活跃期，暂无沉睡的高潜选题。」

---

### 2.5 Tab 3：从未做过

- 数据来源：`GET /api/topics/pool?view=never_worked&page_size=20`
- 按录入时间倒序（后端已处理）
- 卡片正常渲染，无额外徽标（本来就没有数据）
- 追加一行小字：「录入于 X 天前 · 尚无作品」
- 支持母题筛选（复用现有 `selectedTopicIds` 过滤逻辑，透传 `topic_id` 参数）
- 空态：「选题库里所有选题都已经有作品了，继续录入新灵感吧。」+ 「录入选题」按钮

---

### 2.6 均播着色规则（Tab 1 & 2 通用）

需计算团队全库均播中位数（可用当前已加载所有子题的 `_avgPlayCount` 列表取中位数，或固定用 3万作为基准线）：

- `_avgPlayCount` ≥ 基准线 → `#C9604D`（红色，高于均值）
- `_avgPlayCount` < 基准线 → `#6FAA7D`（绿色，低于均值）
- `_avgPlayCount` 为 null 或 0 → `#A1A1AA`（灰色，暂无数据）

**简化方案（推荐）**：用固定基准线 3 万，对应流量分 0.3 的档位，语义是"团队期望线"，不需要动态计算。

---

### 2.7 分页

Tab 1-3 均支持"加载更多"按钮（不做自动无限滚动），点击追加下一页。保留现有 `loadingMore` 状态和分页逻辑，适配新的 view 参数即可。

---

### 2.8 Tab 4-7 改动说明

| Tab | 现有状态 | 新状态 | 改动 |
|---|---|---|---|
| 脚本中 | `currentView = "my_claims"` | `activeView = "my_claims"` | 只改状态变量名，逻辑不变 |
| 全部选题 | `currentView = "all"` | `activeView = "all"` | 同上 |
| 个人选题 | `currentView = "my_created"` | `activeView = "my_created"` | 同上 |
| 趋势变化 | `activeTab = "comparison"` | `activeView = "comparison"` | 合并到同一个状态，渲染逻辑不变 |

原有 `activeTab === "recommendations"` 的独立 Tab 取消，内容迁移到 Tab 1 下半区，`recommendations` Tab 按钮从顶部移除。

---

## 三、状态重构指引

原有双层状态：
```typescript
const [activeTab, setActiveTab] = useState<"pool" | "comparison" | "recommendations">("pool");
const [currentView, setCurrentView] = useState<"all" | "my_claims" | "my_created">("all");
```

替换为单层：
```typescript
const [activeView, setActiveView] = useState<ActiveView>("trending");
```

所有依赖 `activeTab` 或 `currentView` 的地方统一改为 `activeView`，数据拉取时：
- `activeView` 为 `"trending" | "high_potential" | "never_worked" | "all" | "my_claims" | "my_created"` → 请求 `/api/topics/pool?view=${activeView}`
- `activeView` 为 `"comparison"` → 请求 `/api/topics/comparison`（不变）

---

## 四、验收要点

1. 7 个 Tab 顺序正确，默认落在「推荐选题」。
2. Tab 1 上半近期高热：每张卡有均播徽标（红/绿/灰着色）和新鲜度徽标，3 天内发布的有橙色🔥标记。
3. Tab 2 高潜待挖：60 天以上的有蓝灰「💤 已N天未做」徽标。
4. Tab 3 从未做过：卡片无播放数据，有「录入于X天前·尚无作品」小字，母题筛选生效。
5. Tab 4-7 原有功能全部正常，行为与改动前一致。
6. 所有空态有引导文案，不出现干瘪空白。
7. 均播着色遵守红涨绿跌（高于 3 万基准线标红，低于标绿），不反色。
8. 视觉符合《美学规范》，未引用 Codex 一次性前端代码。

## 五、上线说明

前端改动需 **push 后经 Vercel 部署才生效**，本地改完线上不变。回滚：`git revert` 对应前端 commit，后端新接口不被调用不影响旧行为。
