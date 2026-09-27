# Claude 设计规范（高密度产品适配版）

> 本卷只写一件事：**没有它，AI 大概率会走偏的那些内容。**
> 凡读了《Claude 设计哲学》即可正确推导的，不入本卷。两卷冲突时以《哲学》为准。
>
> 度量立在本产品的真实密度上——13px 正文、12px 元数据、紧凑留白、发丝表格。

---

## §1 身份六档（封闭白名单）

### 1.1 六档绑定表

一段文字的身份判定之后，四个属性一次性随之而定，不逐个挑选。

| 身份 | 字号 | 行高 | 字重 | 墨度 | 字体 |
|---|---|---|---|---|---|
| **页面定名** | 28px（`sm:` 以下 20px） | 1.20 | 500 | `#141413` | 衬线 + `tracking-tight` |
| **章节定名** | 18px | 1.30 | 500 | `#141413` | Sans |
| **条目定名** | 14px | 1.40 | 500 | `#1F1E1D` | Sans |
| **正文与数据** | 13px | 1.60 | **400** | `#1F1E1D` | Sans |
| **元数据** | 12px | 1.50 | **400** | `#78716C` | Sans |
| **无内容信号** | 12px | 1.50 | 400 | `#A8A29E` | Sans |

**章节定名**覆盖：区域标题、抽屉主标（`SheetTitle`）、弹窗标题（`DialogTitle`）。三者同为"一个空间在讲什么"，同档。

**条目定名**覆盖：列表行名、卡片名、表单段落标题。它统领的只有自己。

**元数据**覆盖：表头、表单字段名、时间戳、单位、徽标（Badge）、辅助说明。

### 1.2 封闭律

**表内六个字号（28 / 20 / 18 / 14 / 13 / 12）之外，一律不得出现。** 包括 9 / 10 / 11 / 15 / 16 / 17 / 19 / 21 / 22 / 24 / 30px 及一切半像素字号。

缺档时向**下**取（16 → 14，17 → 14，19 → 18，21 → 18），不向上取。向上取会让条目冒充章节。

**两个豁免，仅此两处：**

| 豁免 | 值 | 唯一位置 |
|---|---|---|
| 落地页 Hero | 32 → `sm:`36 → `lg:`41.6px | `src/app/page.tsx` 首屏主标题 |
| 仪表盘指标大数 | 20px / 500 / `#141413` | 统计面板的核心数字本体，不含其标签与单位 |

### 1.3 写法唯一律

**字号只许写 `text-[Npx]`。** Tailwind 语义别名 `text-xs / sm / base / lg / xl / 2xl / 3xl / 4xl` 全部禁用。

原因是两套拼法并存会让同一个值出现两种写法，自检与全局替换双双失效，页面内部必然长花。`rem` 写法同禁（Hero 豁免除外）。

### 1.4 字重两档

**全站只有 400 与 500。** 400 是默认，500 只给三处：六档表里的三种「定名」、控件激活态、品牌字标。

正文、数据、元数据、按钮文字、表格单元格一律 **400**。

`font-semibold`(600) 仅限**状态驱动**的激活态（`data-active` / `aria-selected` / `:checked` / 三元分支），且未选中态必须是 400 或 500 形成对比。静止态禁用 600。`font-bold`、`font-[550]`、`font-[600]` 全禁。

**这一档是全站最容易塌的**：一旦中黑普发，字重就不再意味着定名，强调只能靠放大字号，六档字阶随之崩坏。

### 1.5 墨度四阶

| 墨度 | 色值 | 承载 |
|---|---|---|
| 定名墨 | `#141413` | 页面定名、章节定名、指标大数 |
| 正文墨 | `#1F1E1D` | 条目定名、正文、数据、表格单元格 |
| 元数据墨 | `#78716C` | 表头、字段名、时间戳、单位、辅助说明 |
| 信号墨 | `#A8A29E` | **只承载"这里没有内容"**：占位符、空值 `—`、禁用态、图标装饰 |

**四阶之外的文字灰一律不得出现。** 以下为明令废弃，见即替换：

| 废弃色 | 替换为 | 说明 |
|---|---|---|
| `#1C1917` | `#141413` | `stone-900`，色相偏红，框架默认值而非设计选择 |
| `#292524` | `#1F1E1D` | `stone-800`，同上 |
| `#8C827A` / `#57534E` / `#5A524C` / `#4A443E` | `#78716C` | 自造中间灰 |
| `#2C2623` | `#1F1E1D` | 自造深墨 |
| `#D6D3D1` | `#A8A29E` | 自造浅墨 |
| `zinc` 系（`#E4E4E7` / `#D4D4D8` / `#A1A1AA` / `#27272A`） | 删除 | 冷灰，H≈240°，且暗色模式无入口，属死代码 |

**信号墨判据一句话**：这块浅墨是在说「这里没有内容」，还是「这里有内容但想写淡一点」？后者即违规，不得浅于 `#78716C`。

**中性色 H=60° 暖灰锁定**：Canvas / Surface / Ink / Border 全部锁暖灰，禁冷蓝、冷白、发黄宣纸。

### 1.6 衬线白名单

| 场景 | 判据 |
|---|---|
| 页面定名（28px） | 每页唯一 |
| 章节定名（18px） | 仅当它是**为一个空间定名**（抽屉主标、区块标题）；表单操作类弹窗标题用 Sans |
| AI 结论金句 | ≥14px 且 ≤30 字 |
| 完卷微符 `✦` | 装帧符号 |

**核心判据：这是过程，还是宣告？** 宣告用衬线，过程用 Sans。

**衬线禁区**：表格 / 表单 / 按钮 / 导航 / 徽标 / 常规空状态；小于 14px；标点单独衬线；超过 30 字成段。

**衬线间距锁死 `tracking-tight`**（约 -0.025em），禁 `tracking-normal` 与正间距。

**Windows 低密度屏回退**：DPR < 1.5 时 14px 以下衬线一律回退 Sans，已在 `globals.css` 配置 `@media (max-resolution: 1.5dppx)`；**新增字号档时须同步扩充该清单**。

---

## §2 组件与 Token 是唯一落点

### 2.1 禁止在业务文件覆盖组件规格

业务页面**不得**给共享组件追加字号、圆角或阴影类。要改长相，改组件。

已定契约的共享件，直接用默认值：

| 组件 | 已定契约 |
|---|---|
| `ui/table.tsx` | 表头 12px/400/`#78716C`、`h-9`、`px-3`；单元格 13px、`py-2.5`；行底 `border-b border-[#E2E2DF]/60`；根带 `tabular-nums`；无斑马纹、无竖向列线 |
| `ui/dialog.tsx` | 标题 18px |
| `ui/sheet.tsx` | 抽屉主标 18px |
| `ui/button.tsx` | 13px/400；S 32px / M 36px / L 40px |
| `ui/input.tsx` · `ui/select.tsx` | 13px；`bg-white` + `border-[#E2E2DF]` + `shadow-input` + `rounded-md` |
| `ui/label.tsx` | 字段名 12px |
| `ui/badge.tsx` | 12px |
| `ui/empty-state.tsx` | 空状态统一走它，不手写 |

**新表格一律用 `ui/table.tsx`**，不新写 `<table>`。

### 2.2 页头一律走壳

| 壳 | 适用 |
|---|---|
| `components/app-shell/app-shell.tsx` | 前台页面 |
| `components/admin-workspace-layout.tsx` | 后台页面 |

槽位顺序与侧位锁死：

| 槽位 | 位置 |
|---|---|
| Eyebrow（所属模块） | 页面定名之上 |
| 页面定名（H1） | 页头左上第一位，**每页必有** |
| 描述 | 定名之下 |
| 主 CTA 与页头操作 | 与定名同行，**右对齐**（全站唯一侧） |
| 筛选器 | 页头之下、内容之上，左对齐同轴 |

用 `eyebrow` / `title` / `description` / `actions` 传值，不自建页头。**已知例外仅三类**：落地页、认证页（`auth-shell`）、错误与空态页（`not-found` / `global-error`）。

### 2.3 内容宽度与导航同轴

内容区最大宽统一 `max-w-7xl`(1280px)，与导航栏一致。

宽表页（列数 ≥12）可放宽至 `max-w-screen-2xl`，但**导航栏须同步加宽**。任何情况下内容不得宽于导航。

### 2.4 死 Token 必须删

定义了却零引用的 Token 与样式表会被后来者当作现行标准复制，必须清除，不是留着"以后可能用"：

- `design-tokens.css`：`--shadow-light/medium/heavy/card/float/toast/primary`、`--color-surface-muted`、`--color-focus`、`--color-text-*`、`--admin-text-*`
- `styles/components/dashboard.css`：全部 55 个类零引用
- `app-shell.css`：`.app-shell-section-title` / `-description`
- `tokens.css` 暗色分支：暗色模式无切换入口，整块为死代码

---

## §3 空间与形状档位

### 3.1 留白四级

| 语义 | 间距 | Tailwind |
|---|---|---|
| **断层 Rift** | 20px | `gap-5` / `space-y-5` |
| **呼吸 Breath** | 12px | `gap-3` / `space-y-3` |
| **紧凑 Tight** | 8px | `gap-2` / `space-y-2` |
| **亲密 Intimate** | 4px | `gap-1` / `space-y-1` |

**元素间距禁半档**：`gap-1.5`(6px)、`gap-2.5`(10px)、`gap-3.5`(14px) 及 `space-y` 同档全禁。相邻两级只差两三像素时，梯次就不存在了。

**内边距不受四级管辖**：它的职责是撑出控件高度与容器呼吸，由 §2.1 的组件规格决定，允许 `py-1.5` / `px-2.5` 这类半档。但 `py-0.2`(0.8px) 这种无语义值禁用。

**梯次律**：`gap(父) > gap(子)`，违反即错。容器**左右内边距必须相等**（表格列为对齐数字取 `pl-4 pr-2` 属合规）。

### 3.2 圆角三档 + 全圆

| 元素 | 圆角 | Tailwind |
|---|---|---|
| 控件（按钮/输入/药丸） | 6px | `rounded-md` |
| 容器（卡片/面板/空态块） | 12px | `rounded-xl` |
| 大容器（主托盘/弹窗/抽屉） | 16px | `rounded-2xl` |
| 头像与状态点 | 全圆 | `rounded-full` |

**禁用**：`rounded-lg`(8px)、裸 `rounded`(4px)、`rounded-sm`、`rounded-3xl`、自定义像素圆角。8px 与 6px 肉眼分不出，同时存在只会产生"同一个分段控件三个页面三种圆角"。

**形状同源**：同一类元素全站只有一个圆角。

### 3.3 阴影三档

```css
--shadow-input:         0 0 0 1px rgba(28,25,23,0.08), 0 1px 2px 0 rgba(28,25,23,0.04);
--shadow-card-ring:     0 0 0 1px rgba(28,25,23,0.08), 0 1px 2px 0 rgba(28,25,23,0.05);
--shadow-claude-float:  0 1px 2px rgba(28,25,23,0.04), 0 10px 28px -4px rgba(28,25,23,0.12), 0 3px 8px -2px rgba(28,25,23,0.06);
--shadow-claude-dialog: 0 1px 3px rgba(28,25,23,0.04), 0 18px 42px -6px rgba(28,25,23,0.16), 0 6px 18px -2px rgba(28,25,23,0.08);
```

| 用途 | Token |
|---|---|
| 交互触点（输入框、次按钮） | `shadow-input` |
| 托盘（主卡片、主表格） | `shadow-card-ring` |
| 浮层（下拉、气泡、抽屉） | `shadow-claude-float` |
| 弹窗 | `shadow-claude-dialog` |

**禁用** Tailwind 原生阴影：`shadow-2xs` / `shadow-xs` / `shadow-sm` / `shadow-md` / `shadow-2xl` / 裸 `shadow`。

**纯白触点物理凸出律**：纯白落在暖白桌面上，必须配发丝边 `#E2E2DF` 与微投影，严禁裸落。

### 3.4 色彩与状态

| Token | 色值 | 场景 |
|---|---|---|
| Canvas | `#FCFCFB` | 页面大背景（L1），仅最外层 |
| Surface | `#F1F1F0` | 展示气垫（下沉） |
| Surface Interactive | `#FFFFFF` | 交互触点（上浮） |
| Hover | `#EBEBE9` | 悬停态 |
| Row Hover / Selected | `#F7F7F6` / `#E4E4E1` | 表格行 |
| Action | `#D97757` | **全屏唯一**主 CTA |
| Action Hover | `#C46A4D` | 主 CTA 悬停 |
| Border | `#E2E2DF` | 发丝线 |

**状态色只上文字与淡底，不上实底**：

| 语义 | 色值 | 用法 |
|---|---|---|
| 成功 / 涨 | `#6FAA7D` | 文字本色 + `/8` 透明底 |
| 异常 / 跌 | `#C0685C` | 同上 |
| 待处理 | `#B98A54` | 同上 |
| 进行中 / 位置 | `#43718E` | 同上 |

禁 `bg-[#6FAA7D]` 这类饱和实底——**换个 hex 不改变它是一块饱和实底的事实**，它会跟唯一的主 CTA 抢光。实底只属于 `#D97757`，且全屏至多一处。

L3 容器内部统一 `bg-transparent`，**严禁同色套同色**。

### 3.5 动效

- 按压：`active:scale-[0.99] active:duration-120`
- 抽屉：`ease-[cubic-bezier(0.16,1,0.3,1)] duration-300`
- 淡入淡出：`transition-opacity duration-200`
- 结果直接可见时不弹 Toast；禁浮夸弹跳

### 3.6 出版物装帧组件

```tsx
// 卷首寄语 Epigraph
<div className="border-l-2 border-[#D97757] pl-6 py-3 text-[14px] leading-relaxed text-[#78716C] font-serif tracking-tight">
  <p>寄语正文</p>
  <cite className="block mt-3 text-[12px] font-sans not-italic text-[#A8A29E]">— 署名</cite>
</div>

// 学者边注 Marginalia
<aside className="text-[12px] leading-relaxed text-[#78716C] border-t border-[#E2E2DF] pt-3 mt-3">边注内容</aside>

// 完卷徽记 Colophon
<div className="flex items-center justify-center gap-2 text-[#A8A29E] text-[12px] mt-5">
  <span>✦</span><span>全文完</span><span>✦</span>
</div>
```

---

## §4 自检

```bash
# 1. 表外字号（预期 0）
rg -o 'text-\[(9|10|11|15|16|17|19|21|22|24|26|30|32)px\]' src

# 2. Tailwind 字号别名（预期 0）
rg -o '\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl)\b' src

# 3. 半像素字号（预期 0）
rg -o 'text-\[[0-9]+\.[0-9]+px\]' src

# 4. 废弃墨色（预期 0）
rg -o '#(1C1917|292524|8C827A|2C2623|57534E|5A524C|4A443E|D6D3D1|E4E4E7|D4D4D8|A1A1AA|27272A)' src

# 5. 状态色饱和实底（预期 0；实底只属 #D97757）
rg -o 'bg-\[#(6FAA7D|C0685C|B98A54|43718E|C9604D|5A9B69|2E5E3B|245233|843228|375F77)\]' src

# 6. 废弃圆角（预期 0）
rg -o '\brounded-(lg|sm|3xl)\b' src; rg -oP 'rounded(?![-\w])' src

# 7. 废弃阴影（预期 0）
rg -o '\bshadow-(2xs|xs|sm|md|2xl)\b' src; rg -oP 'shadow(?![-\w])' src

# 8. 元素间距半档（预期 0；内边距不在此列）
rg -o '\b(gap|gap-[xy]|space-[xy])-(1\.5|2\.5|3\.5)\b' src; rg -o '\bp[xytblr]?-0\.2\b' src

# 9. 业务文件覆盖组件字号（预期 0）
rg -n '<(DialogTitle|SheetTitle|TableHead|TableCell|Badge|Button|Input|Label)[^>]*text-\[' src --glob '!src/components/ui/**'

# 10. 非法字重（预期：600 仅在状态驱动分支）
rg -n 'font-(bold|\[550\]|\[600\])' src
rg -n 'font-semibold' src | rg -v 'data-active|aria-selected|checked|\?|isOpen|isActive'

# 11. 字重健康度（font-medium 占比应 < 35%）
echo "medium=$(rg -o 'font-medium' src | wc -l)  normal=$(rg -o 'font-normal' src | wc -l)"

# 12. 衬线间距（预期 0）
rg -o 'font-serif[^"]*tracking-(normal|wide)' src
```

手工检查：

- [ ] 每个页面有且仅有一个页面定名（H1），走壳的 `title` 槽
- [ ] 全屏只有一处 `bg-[#D97757]`
- [ ] 列表项/卡片名是 14px，不是 18px
- [ ] 内容区不宽于导航栏
- [ ] 同类两页截图叠加，H1 / 筛选器 / 主 CTA 重合
- [ ] 卡片网格各卡定名与脚注在同一水平线
- [ ] 实底容器内部没有再套实底（尤其同色）
