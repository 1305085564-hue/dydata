# DYData 视觉质感升级方案

> 2026-03-17 | 状态：执行中

## 已完成

- [x] AI 功能打通（Vercel 环境变量 AI_BASE_URL/AI_API_KEY/AI_MODEL，渠道3，opus 模型）

## 待执行

### 一、数据上传面板排版重构

现状：涨粉在"基本信息"，导粉在"核心指标"，各占一行，层次混乱。

重构为 3 个区块，有轻重之分：

| 区块 | 字段 | 设计意图 |
|------|------|---------|
| 📋 基本信息（低调） | 账号、视频标题、提交日期 | 灰色调，纯信息录入 |
| 🔥 核心数据（视觉加重） | 播放量、涨粉、完播率、平均播放时长、2s跳出率、5s完播率 | 播放量+涨粉做大号输入框或加色彩权重突出；其余4项 2×2 网格 |
| 📎 补充信息（收纳） | 互动四件套（点赞/评论/分享/收藏 一行4列）、导粉+发布时间（同一行）、文案 | 导粉降级到这里 |

关键：有轻重，播放量和涨粉在核心区顶部视觉突出，互动四件套压缩一行，导粉降级。

文件：`src/app/(app)/dashboard/dashboard-form.tsx`

---

### 二、趋势图加回团队 P70 对比线

现状：ResultTrend / InteractionTrend 组件有团队数据线，但 build个人趋势数据 算的是团队"平均"，不是 P70。改版前有 P70，这次被去掉了。

改动：
1. `src/lib/趋势图.ts` → build个人趋势数据 团队聚合从 mean → P70
2. `src/app/(app)/dashboard/page.tsx` → teamAverageLabel 从"团队人均"→"团队 P70"
3. 趋势图组件副标题文案同步更新

---

### 三、全站视觉质感升级（重心，要求最高）

标杆：/growth 页面的 DiagnosisCard（毛玻璃+渐变+深阴影+圆角16px）——"有一点味道但还不够"。所有页面向这个水准靠齐并超越。

#### 3.1 设计系统（Design Tokens）

在 globals.css 建立统一变量：

- 圆角：`--radius-card: 16px`
- 阴影 3 级：
  - light: `0 1px 3px rgba(15,23,42,0.06)`
  - medium: `0 8px 24px -8px rgba(15,23,42,0.12)`
  - heavy: `0 18px 48px -32px rgba(15,23,42,0.28)`
- 毛玻璃：`backdrop-blur-xl` + `bg-white/75` + `border-white/70`
- 背景：从纯 `bg-muted/30` → 微妙径向渐变

#### 3.2 动效系统（Motion）

统一 framer-motion 参数：
- 页面进入：卡片 stagger 淡入 + 微上移（delay 0.05s 递增）
- Tab/指标切换：spring（stiffness: 220, damping: 26）——ResultTrend 已有，全站统一
- 数字变化：AnimatedNumber 扩大使用范围
- 交互反馈：按钮 hover scale(1.02)、卡片 hover translateY(-2px) + 阴影加深
- 成功/错误状态：fade + scale 过渡

#### 3.3 层次感（Depth）

3 层视觉层级：
- 背景层：大面积浅灰微渐变，无阴影
- 内容层：毛玻璃白卡片，medium 阴影
- 焦点层：高亮卡片/弹窗，heavy 阴影 + 更强毛玻璃

#### 3.4 排版节奏

- 标题：tracking-tight，font-semibold
- 数据数字：tabular-nums + font-semibold
- 卡片间距：统一 gap-4（紧凑）/ gap-6（宽松）
- 内边距：统一 p-5 / p-6
- 留白充足，不挤

#### 3.5 色彩克制

- 主色调：蓝灰为主
- 强调色：只在关键指标出现
- 状态色：绿（好）、橙（注意）、红（差）
- × 花哨渐变，× 多余装饰色

#### 3.6 执行顺序

1. globals.css 建设计系统变量 + 通用类
2. /growth 页面打磨到位（标杆）
3. /dashboard 页面靠齐
4. /admin + /admin/analytics 靠齐
5. 登录/注册页面收尾

#### 3.7 涉及文件

| 文件 | 改动 |
|------|------|
| `src/app/globals.css` | 设计系统变量 + 通用类 |
| `src/app/(app)/layout.tsx` | 背景渐变 |
| `src/components/ui/card.tsx` | 统一卡片样式 |
| `src/app/(app)/growth/growth-client.tsx` | 动效 + 打磨 |
| `src/components/growth/*.tsx` | 各卡片组件统一风格 |
| `src/app/(app)/dashboard/dashboard-form.tsx` | 排版重构 + 风格统一 |
| `src/app/(app)/dashboard/page.tsx` | 页面级动效 |
| `src/components/charts/*.tsx` | 图表容器风格统一 |
| `src/components/leaderboard/leaderboard.tsx` | 风格统一 |
| `src/app/(app)/admin/page.tsx` | 风格统一 |
| `src/app/(app)/admin/analytics/*.tsx` | 风格统一 |
| `src/app/(auth)/login/login-form.tsx` | 风格统一 |
| `src/app/(auth)/register/register-form.tsx` | 风格统一 |
