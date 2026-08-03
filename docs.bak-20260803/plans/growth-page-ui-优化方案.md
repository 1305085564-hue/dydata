# 成长分析页面 UI 优化方案

基于《阿禅美学标准 V1》和 AI 文案助手页面美学实践，对 `/growth` 页面进行视觉升级。

---

## 一、现状诊断

### 当前页面结构
1. **顶部 Hero**：标题 + 描述 + meta标签 + MetricStrip（4个静态指标）+ StatusCardGrid（5个数据卡片）——垂直堆叠，占用过大
2. **中部分栏**：左侧六维雷达图（40%宽度）+ 右侧诊断卡片（60%宽度）
3. **Peer Battle**：同标签对比面板（可选）
4. **底部双栏**：左侧文案拆解 + 右侧 AI 洞察与行动建议

### 与 V1 标准的主要偏差
| 偏差项 | 现状 | V1 标准 |
|--------|------|---------|
| 大卡片圆角 | `rounded-[2rem]` (32px) | `rounded-2xl` (16px) |
| 页面背景 | 默认（偏白） | `#F9F9FB` 或 `#FAFAFB` |
| 顶部垂直空间 | 过大，4指标+5卡片垂直堆叠 | 应压缩为紧凑布局 |
| 分组标签 | 纯文字，无分隔线 | 两侧 `h-px bg-zinc-200` 细线分隔 |
| 内层卡片圆角 | `rounded-[16px]` 随意 | 统一 `rounded-xl` (12px) |
| 按钮圆角 | `rounded-xl` (12px) | `rounded-lg` (8px) |

---

## 二、可借鉴项（确认采用）

1. **全局背景色**：引入 `#F9F9FB` 作为页面底色，卡片保持 `#FFFFFF`
2. **圆角规范化**：外层容器 16px，内层卡片 12px，按钮 8px
3. **分组标签格式**：`text-[10px] uppercase tracking-[0.25em] text-zinc-400` + 两侧细线
4. **状态灯替代大面积色块**：诊断卡片强弱状态可用小圆点 + 文字，减少色块面积
5. **hover 统一**：`-translate-y-[1px] + hover:shadow-md`（已有，保持）
6. **间距压缩**：模块间距从 24px 统一到 20px
7. **AI 洞察区暖橙点缀**：Action Plan 核心区域增加极浅暖橙背景或左侧 3px 导轨

## 三、不适合项（明确不采用）

1. **对话式消息气泡**：成长页是数据仪表盘，非对话界面
2. **输入框外壳样式**：成长页无类似输入交互
3. **侧边栏布局**：成长页无侧边栏需求
4. **欢迎页 Hero 居中布局**：数据页需要信息密度，不适合大留白居中

---

## 四、具体优化动作

### 4.1 顶部 Header 重构（核心改动）

**目标**：释放约 120px 垂直高度，提升信息密度。

**动作**：
- 将 AppShellHero 改为**单层紧凑布局**：
  - 标题行保留（"成长分析总览" + 描述 + meta标签右侧）
  - 4 个静态指标（分析主体、账号数量、样本量、最弱项）从 MetricStrip 中移出，精简为**标题右侧的 inline 元数据标签组**
  - 下方只保留 StatusCardGrid（5 个核心数据指标），一行横向排列
- StatusCardGrid 卡片从 `rounded-2xl` 保持 16px，但**高度压缩**，padding 从 `p-4` 改为 `p-3.5`
- 标签文字从 `tracking-[0.14em]` 提升到 `tracking-[0.25em]` 以符合 V1

### 4.2 全局背景与容器圆角

**动作**：
- `AppShell` 外层增加 `bg-[#F9F9FB] min-h-screen`（或确认页面级背景已设置）
- `AppShellHero` 的 `rounded-[2rem]` → `rounded-2xl`
- `AppShellSection` 的 `rounded-[2rem]` → `rounded-2xl`
- 六维雷达面板外层 `rounded-[2rem]` → `rounded-2xl`
- 诊断与行动外层 `rounded-[2rem]` → `rounded-2xl`
- 文案拆解外层 `rounded-[2rem]` → `rounded-2xl`
- Action Plan 外层 `rounded-[2rem]` → `rounded-2xl`
- PK Panel 外层 `rounded-[2rem]` → `rounded-2xl`
- script-breakdown 内部卡片 `rounded-[16px]` → `rounded-xl`
- EmptyReasonBlock `rounded-[18px]` → `rounded-xl`
- DemoReferenceBlock `rounded-[18px]` → `rounded-xl`
- growth-action-plan-panel 内部卡片 `rounded-[16px]` → `rounded-xl`
- 展开收起按钮 `rounded-xl` → `rounded-lg`

### 4.3 分组标签增强

**动作**：
- "Script Breakdown"、"PK Compare"、"Action Plan" 等分组标签，从纯文字改为**带两侧细线的分隔样式**：
  ```tsx
  <div className="flex items-center gap-3">
    <div className="h-px flex-1 bg-zinc-200" />
    <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
      Action Plan
    </span>
    <div className="h-px flex-1 bg-zinc-200" />
  </div>
  ```
  但注意：只在需要强调分组的地方使用，不要过度。

### 4.4 雷达图与诊断区优化

**动作**：
- 雷达图 SVG 容器 `maxHeight: 280` → `maxHeight: 240`，缩小约 15%
- 图例文字使用 `text-[10px]` 统一
- 诊断卡片网格 `gap-3 lg:grid-cols-2` 保持，但内部卡片 `rounded-2xl` → `rounded-xl`
- 诊断卡片 "下一步动作" 底部区域，如果是弱项，左侧边框从 `border-l-zinc-950` 改为 `border-l-[#D97757]`（暖橙导轨，表示行动点）
- 强项保持 `border-l-zinc-950` 或改为 `border-l-[#067647]`

### 4.5 AI 洞察区增强

**动作**：
- Action Plan 最外层卡片增加**极浅暖橙背景晕染**：`bg-[#D97757]/[0.02]` 或保持白底但内层 "下一步动作" 卡片用暖橙左侧导轨
- 或者：给 Action Plan 整个区域增加左侧 3px 暖橙色导轨 `border-l-[3px] border-l-[#D97757]`
- 空状态提示保持现有图标，但颜色统一为 `text-zinc-400`

### 4.6 模块间距统一

**动作**：
- `AppShell` 的 `space-y-6 sm:space-y-8` → `space-y-5 sm:space-y-6`
- 中部分栏 `gap-6` → `gap-5`
- 底部双栏 `gap-6` → `gap-5`
- AppShellHero 内部 `space-y-5` → `space-y-4`
- AppShellSection 内部 `space-y-4` → `space-y-3`

### 4.7 loading.tsx 同步

**动作**：
- loading 骨架的圆角也同步调整：`rounded-xl` 保持，`rounded-2xl` 用于外层

---

## 五、文件改动清单

| 文件 | 改动类型 | 改动内容 |
|------|---------|---------|
| `src/app/(app)/growth/growth-client.tsx` | 修改 | Header重构、圆角、间距、背景 |
| `src/app/(app)/growth/loading.tsx` | 修改 | 圆角同步 |
| `src/components/growth/status-card-grid.tsx` | 修改 | 标签tracking、卡片padding微调 |
| `src/components/growth/六维雷达面板.tsx` | 修改 | 圆角、高度缩小 |
| `src/components/growth/diagnosis-card.tsx` | 修改 | 圆角、行动区左侧导轨色 |
| `src/components/growth/growth-action-plan-panel.tsx` | 修改 | 圆角、暖橙点缀 |
| `src/components/growth/script-breakdown.tsx` | 修改 | 圆角、分组标签 |
| `src/components/growth/growth-pk-panel.tsx` | 修改 | 圆角 |
| `src/components/app-shell/app-shell.tsx` | 修改 | 圆角、间距、背景色 |

---

## 六、验收标准

1. 页面在桌面端顶部垂直空间减少 ≥ 100px
2. 所有外层容器圆角统一为 16px，无 32px 大圆角
3. 页面背景为 `#F9F9FB`，卡片为白色
4. 诊断卡片行动区弱项有暖橙左侧导轨
5. 分组标签有两侧细线分隔（至少 Action Plan、Script Breakdown 两处）
6. 构建无错误
