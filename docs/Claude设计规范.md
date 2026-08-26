# Claude 设计规范

> 精确到像素的执行标准。灵魂层见「Claude设计哲学.md」。

---

## 1. 色彩 Token 矩阵

### 1.1 核心色彩系统

| Token 类别 | 语义别名 | 语义 / 名称 | 色值 HEX | 适用场景 | 禁忌 |
|---|---|---|---|---|---|
| **Action** | primary | 暖陶土橙 (Terracotta) | `#D97757` (Hover: `#C46A4D`) | 主 CTA 按钮、主链接、核心操作 | 严禁多处并列乱点缀 |
| **Location** | position | 暴雨灰蓝 (Storm Blue) | `#43718E` | 侧栏选中态、当前面包屑、位置指引 | 禁与行动色同组件混用 |
| **Canvas** | canvas | 温润象牙暖纸底 | `#FBF9F5` | 页面大背景，桌面底层 | 禁大面积纯白刺眼背景 |
| **Surface** | surface / surface-soft | 纯白纸层 / 极浅砂岩气垫 | `#FFFFFF` / `#F5F3EE` | 业务主容器、辅助配角微气垫 | 禁嵌套多层白卡纸 |
| **Surface Dark** | surface-dark | 深炭产品底 | `#181715` | 代码窗口、深色模式容器 | 禁用于常规页面背景 |
| **Ink 950** | ink-heading | 暖炭浓墨 (Heading Ink) | `#1C1917` | 页面大标题 (H1/H2) | 禁用于大段正文 |
| **Ink 800** | ink-body | 正文暖墨 (Body Ink) | `#292524` | 正文、常规数据文本、表单输入 | 保持阅读舒适清透 |
| **Ink 600** | ink-muted | 辅助墨 (Muted Ink) | `#78716C` | 表头、副标题、次级元数据 | 不得浅于此底线 (防糊) |
| **Border** | hairline | 暖砂岩细边 (Hairline) | `#E5E0D6` / `#ECE7DE` | 表格防串行线、极细分割线 | 禁全页面厚重边框 |

### 1.2 色彩使用原则

**结构层与信号层分离**：
- **结构层**（标题/导航/布局框架）：仅用灰阶墨度（Ink 950/800/600）与留白建立层次
- **信号层**（行动/状态）：行动色 `#D97757` + 位置色 `#43718E`

**视觉杠杆不叠加原则**：
- 单个元素禁止同时叠加：超大字号 + 重字重 + 鲜艳色 + 有色背景
- 大尺寸指标 (24-36px) 必须用中性灰阶，不可配彩色渐变
- 用对比、微气垫（`bg-[#F5F3EE]`）、状态点突出内容，不用放大字号

**输入框宣纸漫反射层**：
- 输入框与文本域采用象牙漫反射微底色（`bg-[#FAF8F4]/50`）+ 暖砂发丝边（`border-[#E5E0D6]`）+ 微投影（`shadow-2xs`），激活聚焦时才温润显影为纯白（`focus:bg-white focus:border-[#78716C]`），彻底杜绝刺眼白洞。
- **输入框安全空间红线**：所有 AI 识别状态、置信度指示圆点、单位后缀，**严禁绝对定位在 input 内部遮挡数字，必须外置在 Label 栏右侧**。

---

## 2. 排版与字阶体系

### 2.1 双字体协同字体栈 (Dual-Type System)

- **古典学者衬线栈（Serif · 骨相）**：
  `"Iowan Old Style", Charter, Georgia, "Songti SC", "Source Han Serif SC", "STSong", serif`
  用于：全站所有页面 H1/H2 大标题、模块与卡片标题、成员名牌、弹窗抽屉大标题、Hook 金句引述、卷首寄语。
- **现代人文细黑栈（Sans · 肉相）**：
  `Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
  用于：正文描述、列表说明、表单 Label、选项文案与操作按钮。
- **活字雕版等宽栈（Mono / Tabular · 脉络）**：
  `ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace` 配合 `tabular-nums`
  用于：所有播放量、完播率、跳出率、发布条数、金额等指标数字。

### 2.2 字阶与字重锁死

| 层级 | 语义与场景 | 字体类别 | 字号 | 字重 | 墨度（暗色） |
|---|---|---|---|---|---|
| **H1 页面级** | 页面大标题 (Page Hero) | **Serif 衬线** | `24px` (`text-2xl`) | `600` (Semibold) | `#1C1917` (Ink 950) |
| **H2 区域级** | 侧边栏/抽屉主标题、独立面板 | **Serif 衬线** | `18px~20px` (`text-lg/xl`) | `600` (Semibold) | `#1C1917` (Ink 950) |
| **H3 篇章级** | 选题卡片标题、成员名牌、弹窗标题 | **Serif 衬线** | `14px~16px` (`text-sm/base`) | `600` (Semibold) | `#1C1917` (Ink 950) |
| **Hook 灵感级** | 视频 Hook 金句、观点引述 | **Serif 衬线** | `13px~14px` | `400/500` | `#292524` (Ink 800) |
| **Body 正文** | 列表数据、大段描述、输入框 | **Sans 细黑** | `13px~14px` (`text-sm`) | `400` (Normal) | `#292524` (Ink 800) |
| **Caption 次级** | 发丝副标题、时间戳、元数据 | **Sans 细黑** | `12.5px~13px` | `400` (Normal) | `#78716C` (Ink 600) |
| **Stamp 微印章** | 角色标签 (创始人/主管)、母题 | **Mono/Sans** | `11px~11.5px` | `500` (Medium) | `#57534E` / `#78716C` |
| **Badge 微缩** | 状态圆点旁说明、占位符 | **Sans 细黑** | `11px~12px` | `400` (Normal) | `#78716C` / `#A8A29E` |

### 2.3 中文排版三禁令

1. **渲染与等宽隔离**：
   - 全局强制开启 `antialiased` 抗锯齿
   - 含中文容器禁止 `font-mono`（微印章与纯英文标签除外）
   - 数字混排必须用 `tabular-nums`

2. **字重防糊锁死**：
   - `font-semibold (600)` 仅特许给 H1/H2/H3 衬线大标题与名牌
   - 全站正文与说明严禁脱离 400（Normal）

3. **小字可读底线与豁免**：
   - 常规正文文本字号不得小于 `13px`，颜色不得浅于 `#78716C` (Ink 600)
   - `11px~12px` 仅限用于：微印章、极小时间注或不可用状态

### 2.4 数字与指标强制规则

- **所有数字列、KPI、指标必须开启 `tabular-nums`**
- 数字右对齐（`text-right`）
- 大尺寸指标 (24-36px) 保持中性灰阶，不配彩色背景

### 2.5 全站出版物级衬线体与排版协同规范

使用衬线字体的标题（H1/H2/H3/名牌/金句），必须设置收紧字间距：

| 场景 | Tailwind 类 | 实际值 | 为什么 |
|---|---|---|---|
| 页面大标题 (H1) | `font-serif tracking-tight text-2xl font-semibold` | -0.025em | 消除松散感，建立精装书卷首风骨 |
| 区域/抽屉标题 (H2) | `font-serif tracking-tight text-xl font-semibold` | -0.025em | 保持现代高定出版物感 |
| 模块/卡片/名牌 (H3) | `font-serif tracking-tight text-[14px] font-semibold` | -0.02em | 骨感利落，字形清瘦锐利 |
| 立意金句 (Hook) | `font-serif text-[13px] leading-relaxed` | normal | 灵感火花摘录感 |

**必须使用衬线体（Serif）的场景**：
- ✅ 全站所有页面的 H1 页面大标题与 H2 模块大标题
- ✅ 选题库卡片标题、素材库标题、视频复盘标题
- ✅ 成员档案名牌姓名、播报条认领人姓名与作品《书名号》
- ✅ 弹窗与侧边抽屉（Sheet）的大标题
- ✅ 视频 Hook 金句、立意提炼、卷首寄语 (Epigraph)
- ✅ 404 / 异常 / 空状态的大提示标题

**保持清爽无衬线（Sans）的场景（严禁滥用衬线防发虚）**：
- ✅ 正文段落、表单输入框文本、按钮文字
- ✅ 筛选工具栏（Tab 切换、搜索框、下拉筛选菜单）
- ✅ 表单 Label（如“播放量”、“互动率”）
- ✅ 卡片底部辅助元数据（如“1人在写 · 尚未成片”）
- ✅ 密集数据表格中的描述文本

---

## 3. 尺度精确值

### 3.1 圆角分级

| 级别 | Tailwind 类 | 像素 | 场景 |
|---|---|---|---|
| 行级 / 紧凑输入 | `rounded-md` / `rounded-lg` | 6px / 8px | 按钮、紧凑数据输入格（高 ≤40px）、选择器 |
| 文本域 / 小容器 | `rounded-xl` / `rounded-lg` | 12px / 8px | 多行长文案文本域（高 ≥80px）、小卡片、Badge、弹层 |
| 大容器 / 主输入舱 | `rounded-2xl` | 16px | 模态框、主卡片、全屏主输入舱 |
| 胶囊 | `rounded-full` | — | 状态标签、头像 |

### 3.2 留白精确数值

| 语义 | 间距 | 使用场景 |
|---|---|---|
| 断层 (Rift) | `40px` | 章节与章节之间 |
| 呼吸 (Breath) | `24px` | 标题与该区域内容之间 |
| 紧凑 (Tight) | `16px` | 同级内容项之间 |
| 亲密 (Intimate) | `8px` | 强关联元素之间 |
| **副标微阶 (Sub-header)** | `8px~12px` (`pt-1` / `space-y-2`) | 页面大标题与下方发丝副标/问候语之间（严禁两行粘连） |

### 3.3 数据表格规格

- **数字右对齐** + `tabular-nums`
- **空值显示「—」**（em dash，不是减号）
- **复合信息单行内联，用「·」连接**（如 "张三 · 2024-08-23 · 已完成"）
- **行高 32~36px**（`h-8` / `h-9`）
- 宽屏平铺全部并行指标列，文本列弹性伸缩

---

## 4. 交互与动效手感

### 4.1 三层反馈

| 层 | 表现 | 代码 |
|---|---|---|
| **Hover** | 底色轻微提亮、文字墨度加深 | `hover:bg-[#F5F3EE] hover:text-[#1C1917]`，`transition-all duration-150` |
| **Active** | 微按压感 | `active:scale-[0.98]`，松手即消失 |
| **Selected** | 菜单/Tab用微气垫，列表行用极弱暖底色 | `bg-[#F5F3EE]`（菜单）/ `bg-[#FAF8F4]`（列表） |

### 4.2 操作显隐规则

- **核心操作**：常态可见但安静（幽灵态），Hover 提亮
- **辅助操作**：默认隐藏，Hover 浮现（`hover:opacity-100`，平时 `opacity-0`）
- **破坏性操作**：收至二级菜单（如 Dropdown），不在一级平铺

### 4.3 主 CTA 规则

- 暖橙实底（`bg-[#D97757]`）+ 白字 + `shadow-sm`
- **每屏至多 1 个**

---

## 5. 组件速查

### 5.1 Toast

- **使用原则**：仅在操作结果不可见时使用（结果可见则省略）
- **位置**：底部偏右
- **内容**：单行不超 20 字
- **时长**：3 秒消失

### 5.2 Tag / Badge / Stamp

- **最小点击高度**：20px（防点击盲区）
- **圆角**：`rounded-md`（6px）
- **字号**：`11.5px~12px`，字重 `500`

### 5.3 图表标注

- **优先级**：贴线标注 > 独立图例
- **图例触发**：≥3 系列才引入图例
- **色彩限制**：同一图表最多 3 色系列

### 5.4 控制栏与筛选工具 (Control & Filter Bar)

- **去框平铺**：`bg-transparent`，按钮高度 `h-7`（28px，`px-2.5`），功能群之间用 16px 微竖线隔离（原尺寸基准完全保留）
- **筛选与搜索**：Tab 与下拉必须保持清爽细黑 (`text-[13px] font-sans`)；搜索框采用宣纸漫反射微底 (`bg-[#FAF8F4]/50 border-[#E5E0D6]`)
- **配额与槽位**：指标必须采用象牙纸面微印章 (`bg-[#FAF8F4] border-[#ECE7DE] font-mono text-[11.5px] tabular-nums`)
- **主 CTA**：暖橙实底 (`bg-[#D97757] text-white`)，每栏至多 1 个

### 5.5 出版物装帧组件 (Editorial Craft)

| 组件 | Tailwind 规格 | 适用场景 |
|---|---|---|
| **卷首寄语 (Epigraph)** | `font-serif italic text-[13.5px] text-[#292524]/90 border-l-2 border-[#D97757]/60 pl-4 bg-gradient-to-r from-[#F5F3EE]/60 to-transparent rounded-r-lg` | 深度诊断、复盘报告顶部开篇 |
| **学者边注 (Marginalia)** | `text-[12.5px] leading-[1.65] text-[#78716C] border-t border-[#ECE7DE]/80 pt-2.5 flex items-start gap-2` (带 `text-[#D97757]` ✦ 微符) | 表单/数据列表旁同行经验批注 |
| **文人微印章 (Rice Paper Stamp)** | `bg-[#FAF8F4] border border-[#ECE7DE] text-[#57534E] text-[11.5px] font-mono px-2 py-0.5 rounded-md` | 创始人/主管/组员角色标签、母题分组名、数据口径微注 |
| **完卷徽记 (Colophon)** | `flex items-center justify-center gap-3 py-6` + `h-[1px] w-8 bg-[#ECE7DE]` + `text-[12px] text-[#A8A29E] ✦` | 长页面收尾、卡片底部分隔 |
| **动态播报便签条** | `bg-[#FAF8F4]/80 border border-[#ECE7DE] rounded-xl px-4 py-2`，名牌与《书名》用 `font-serif font-semibold`，数字用 `tabular-nums` | 选题/内容库顶部滚动播报 |
| **灵感卡片四层阶梯** | 顶层微印章 + `font-serif` 主标题 + `font-serif italic` 金句 + `font-sans` 元数据小注 | 选题卡片、案例卡片微观装帧 |

### 5.6 暖墨矢量插图规格 (Editorial Illustrations)

- **风格标准**：100% 纯 SVG 矢量单线蚀刻手稿（Monoline Ink Sketch），禁止外链位图 (PNG/JPG)、禁止 3D 拟物与渐变大色块。
- **色彩 Token 绑定**：
  * 主线墨色：`stroke-[#292524]` (Ink 800) / 发丝辅助：`stroke-[#78716C]` (Ink 600)
  * 底色光晕：`fill-[#F5F3EE]` (Surface-soft)
  * 点睛高光：`fill-[#D97757]` (Terracotta) / 生长绿：`fill-[#6FAA7D]`
- **尺寸三档锁死**：
  * **紧凑级 (72px)**：抽屉、侧边栏、卡片局部点睛
  * **标准级 (96px)**：登录卡片头部、普通弹窗
  * **展卷级 (120px)**：今日已归档空态、全屏 Hero 迎宾

---

## 6. 深层质感规格（进阶）

### 6.1 区块分隔优先级

| 优先级 | 手段 | 代码 |
|---|---|---|
| 1 | 大留白断层 | `gap-10`（40px）/ `gap-12`（48px） |
| 2 | 单条发丝线 | `border-b border-[#ECE7DE]/80 pb-10` |
| 3 | 弱底色微气垫 | `bg-[#F5F3EE] rounded-lg p-4`（零边框） |
| 4 | 边框（最后手段） | `border border-[#E5E0D6]`（仅表格/浮层） |

### 6.2 发丝级表格

| 部位 | 规格 |
|---|---|
| 表头 | 无背景色，`text-[11px] font-medium text-[#78716C] tracking-wider uppercase` |
| 行分隔 | 仅底边 `border-b border-[#ECE7DE]/60`，无竖线 |
| 行 Hover | `hover:bg-[#F5F3EE]/40` |

**禁止**：表头背景色、竖向网格线、斑马纹。

### 6.3 状态色降饱和

除唯一主 CTA 外，所有状态降级：

| 语义 | 字色 | 底色 |
|---|---|---|
| 成功 / 正常 | `text-[#6FAA7D]` | `bg-[#6FAA7D]/10` |
| 警示 / 待处理 | `text-[#B98A54]` | `bg-[#B98A54]/10` |
| 异常 / 失败 | `text-[#C0685C]` | `bg-[#C0685C]/10` |
| 中性 / 已归档 | `text-[#78716C]` | `bg-[#F5F3EE]` |

**禁止**：`bg-green-500` / `bg-red-500` / `bg-blue-500` 饱和实底。

### 6.4 漫反射阴影

```css
--shadow-claude-float:  0 1px 3px rgba(0,0,0,0.02), 0 8px 24px -4px rgba(28,25,23,0.05);
--shadow-claude-dialog: 0 1px 3px rgba(0,0,0,0.02), 0 12px 32px -4px rgba(28,25,23,0.06);
```

下拉/Popover → `--shadow-claude-float`；Dialog/Drawer → `--shadow-claude-dialog`。

**禁止**：`shadow-lg/xl/2xl`。

### 6.5 物理动效

| 场景 | 规格 |
|---|---|
| 按钮按压 | `active:scale-[0.985] active:duration-75` |
| 抽屉/折叠 | `ease-[cubic-bezier(0.16,1,0.3,1)] duration-300` |
| 聚焦光晕 | `focus-visible:border-[#78716C] focus-visible:ring-1 ring-[#D97757]/25 focus-visible:ring-offset-0` |

### 6.6 骨架屏显影

底色 `bg-[#F5F3EE]`，呼吸 `2.5s`，数据返回 `120ms` 淡入 + 微上浮 `2px`。

### 6.7 毛玻璃吸顶

导航栏、Sticky 表头：`bg-[#FBF9F5]/85 backdrop-blur-md border-b border-[#ECE7DE]/80`

### 6.8 空状态与归档态

- **常规空状态**：垂直留白 `py-16`（常规）/ `py-24`（整页），图标 16-20px 单线色 `#A8A29E`（或省略），说明 `text-[13px] text-[#78716C]` 业务化措辞。
- **完成归档态**：采用纯矢量暖墨手稿插图（如静谧茶盏 `ZenFinishedIllustration`）+ `bg-gradient-to-br from-[#FAF8F4] via-white to-[#F5F3EE]/40 border border-[#ECE7DE]` 温润底色 + 指标三联 + 就地操作。

**禁止**：大面积彩色营销插画、彩色空状态图、感叹号、「暂无数据」系统语。

---

## 7. 禁止操作清单

### 7.1 色彩禁区

- ❌ 用纯白 (`#FFFFFF`) 或冷灰 (`#F3F4F6`) 替代象牙暖底（会丢失品牌识别度）
- ❌ 用冷蓝或青色做强调色（会变成"又一个 AI 工具"）
- ❌ 把暖橙散布到所有次级按钮（破坏聚光灯原则）
- ❌ 同一视野内出现两个以上饱和色焦点
- ❌ 状态色用饱和实底（`bg-green-500` / `bg-red-500` / `bg-blue-500`）

### 7.2 字体禁区

- ❌ 给衬线标题加粗到 600+（必须保持 600 Semibold 的骨相，杜绝傻粗）
- ❌ 用普通黑体做全站 H1/H2 页面大标题与名牌（页面顶标、模块大标、名牌姓名必须统一使用 `font-serif`）
- ❌ 衬线标题使用 `tracking-normal` 或正间距（必须使用 `tracking-tight` 收紧字距）
- ❌ 含中文容器使用 `font-mono`（微印章与纯英文标签除外）
- ❌ 常规正文字号小于 13px（除微印章/时间注/不可用状态豁免）

### 7.3 布局与表单禁区

- ❌ 把 AI 识别状态、置信度圆点绝对定位在 input 框内部遮挡数据（必须外置在 Label 栏右侧）
- ❌ 页面大标题与发丝副标贴死粘连（必须留足 8~12px 垂直呼吸留白）
- ❌ 连续两个区块用相同底色（破坏呼吸节奏）
- ❌ 在纸上叠纸（纸内套娃白卡片）
- ❌ 用营销插图假装代码能力（优先用真实代码窗口）
- ❌ 主角容器加厚边框（主角裸铺，依靠留白确立地位）
- ❌ 均匀分布留白（留白必须有四级语义：断层/呼吸/紧凑/亲密）

### 7.4 动效禁区

- ❌ 大面积渐变背景光、发光投影
- ❌ 浮夸弹跳、旋转菊花
- ❌ 非破坏性操作的无脑弹窗确认
- ❌ 操作结果可见时仍弹 Toast（就地更新即可）

### 7.5 表格禁区

- ❌ 表头用彩色背景
- ❌ 竖向网格线、斑马纹
- ❌ 数字列不开启 `tabular-nums`
- ❌ 数字列左对齐
- ❌ 空值显示"暂无"或"null"（统一用 em dash「—」）
