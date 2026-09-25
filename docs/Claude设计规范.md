# Claude 设计规范（高密度产品适配版）

> 本规范是 Claude 官方设计哲学在高密度中文 B 端产品的适配落地版本。  
> 保持 Claude 人文出版物气质（衬线标题、温润暖白、编辑感装帧），同时适配高密度工作台需求（13px 正文、紧凑留白、发丝表格）。

---

## §1 色彩系统

### 1.1 核心 Token

| Token | 色值 | 场景 |
|---|---|---|
| **Canvas** | `#FCFCFB` | 页面大背景（L1） |
| **Surface** | `#F1F1F0` | 展示气垫（下沉） |
| **Surface Interactive** | `#FFFFFF` | 交互触点（上浮） |
| **Action** | `#D97757` | 全屏唯一主 CTA |
| **Action Hover** | `#C46A4D` | 主 CTA 悬停态 |
| **Location** | `#43718E` | 位置/定位标记 |
| **Ink 950** | `#141413` | H1/H2 标题 |
| **Ink 800** | `#1F1E1D` | H3/H4/正文 |
| **Ink 600** | `#78716C` | 辅助文字 |
| **Ink 500** | `#A8A29E` | 无内容信号 |
| **Border** | `#E2E2DF` | 发丝线 |

### 1.2 中性色体系约束

**H=60° 暖灰锁定**：所有中性色（Canvas / Surface / Ink / Border）锁定 **H=60°** 暖灰体系，禁止冷蓝、冷白、发黄宣纸。  
**业务语义色不受约束**：状态色（成功/警告/错误）、位置蓝、陶土橙可独立定义。

### 1.3 `#A8A29E` 的精确边界

该浅墨**只承载「无内容信号」**，即四类用法：  
① 输入框占位符；② 空值占位符 `—`；③ 图标与发丝线装饰；④ 禁用态文字。

**严禁用于「有内容的可读文字」**（正文、标签、数据、说明），后者一律不得浅于 `#78716C`。  
**判据一句话**：这块浅墨是在说「这里没有内容」，还是「这里有内容但想写淡一点」？后者即违规。

### 1.4 单点聚光灯原则

- **全屏至多 1 个暖橙 CTA**：`bg-[#D97757]` 只给全屏唯一的主行动（提交表单、创建记录、确认操作）
- **全屏 95% 保持中性**：选中勾、引用线、状态标记不得借用暖橙
- **禁止同视野多个饱和焦点**：同一屏幕内不得出现两个以上饱和色焦点

### 1.5 双向深度法则

- **展示容器下沉**：数据展示面板用 `bg-[#F1F1F0]` 浅砂微气垫
- **交互触点上浮**：输入框、按钮用 `bg-white` 配合 `shadow-input` 浮起
- **纯白触点物理凸出律**：纯白落座于暖白桌面时，必须搭配发丝实边（`#E2E2DF`）与微投影（`shadow-input`），严禁裸落

### 1.6 三层色彩律

- **L1 环境光底（Canvas）**：`#FCFCFB` 仅限最外层桌面大背景
- **L2 空间容器（Surface）**：展示用 `#F1F1F0` 下沉；交互用 `#FFFFFF` 上浮
- **L3 纸上排版（Content）**：容器内部统一 `bg-transparent`，用字阶墨度与发丝线（`border-t border-[#E2E2DF]/50`）组织信息

---

## §2 字阶与字重

### 2.1 字阶层级表

| 层级 | 字号 | 行高 | 字重 | 墨度 | 场景 |
|---|---|---|---|---|---|
| **H1 页面级** | 28px | 1.20 | 500 | `#141413` | 每页唯一的页面级标题 |
| **H2 区域级** | 20px | 1.30 | 500 | `#141413` | 独立面板/抽屉主标 |
| **H3 容器级** | 18px | 1.30 | 500 | `#1F1E1D` | 卡片/弹窗标题 |
| **H4 内容级** | 14px | 1.40 | 500 | `#1F1E1D` | 表单段落标题 |
| **Body 正文** | 13px | 1.60 | 400 | `#1F1E1D` | 正文、数据、说明 |
| **Caption 次级** | 12px | 1.50 | 400 | `#78716C` | 辅助说明、时间戳 |
| **Form Label** | 12px | 1.50 | 500 | `#78716C` | 表单字段 label |

**判定口诀**：页面唯一 → H1；独立面板主标 → H2；卡片/弹窗标题 → H3；表单段落标题 → H4。

### 2.2 Form Label 独立档位说明

表单字段 label 是**独立于正文的层级**，固定 `12px / 500`，**不受「正文 ≥13px」下限管辖**——  
它与输入框本体（13px）保持一层字阶差，是密集工作台维持垂直紧凑的既定手段。

**判定要点**：该 12px 元素必须是**字段名/字段说明**（与某个输入控件一一对应）；  
若是段落描述、列表数据或说明文字，仍归 Body/Caption，须 ≥13px。

### 2.3 中文排版三禁令

#### 2.3.1 正文字号下限 ≥13px

高密度产品正文锁定 **13px**（对应 `text-[13px]`），禁止 11px / 11.5px / 12px 正文。  
**两个豁免**：① Form Label（12px / 500）；② Badge 标签（12px / 400）。

#### 2.3.2 禁止半像素字号

禁止 `10.5px / 11.5px / 12.5px / 13.5px` 等半像素字号——浏览器四舍五入后字阶失控。

#### 2.3.3 Windows 低密度屏衬线回退

Windows 低密度屏（DPR < 1.5）衬线在中文小字下横笔发虚，故 **14px 以下的衬线一律回退无衬线**。  
已在 `globals.css` 配置 `@media (max-resolution: 1.5dppx)` 回退规则。

### 2.4 字重三档约束

**全站仅 400 / 500 / 600 三档**，禁用 300/580/700/800。

#### 600 字重的两个"特许"边界

- **特许一 · 控件激活态**：边界锁死 ①②③  
  ① 仅限状态驱动（`data-active` / `aria-selected` / `:checked`）  
  ② 静止态禁用 600（未选中时必须是 400 或 500）  
  ③ 必须有对比（选中 600 vs 未选 400/500）
  
- **特许二 · 品牌标识**：边界锁死（仅限品牌字标本体，装饰性首字母不享受此豁免）

**禁止**：H3 以下使用 600、正文脱离 400、静态装饰用 600。

### 2.5 衬线标题规则（高密度适配）

#### 衬线使用白名单

| 场景 | 字号 | 间距 | 判据 |
|---|---|---|---|
| 页面 H1 | 28px | `tracking-tight` | 每页唯一的页面级标题 |
| AI 洞察结论 | ≥14px | `tracking-tight` | AI 生成的归因/诊断金句 |

**核心判据**：这是过程，还是宣告？宣告用衬线，过程用 Sans。  
超过 30 字成段改回 Sans（衬线不适合长篇阅读）。

#### 衬线禁区

- ❌ 表格/表单/按钮/导航使用衬线（工具语境必须 Sans）
- ❌ 小于 14px 的衬线（Windows 低密度屏横笔发虚）
- ❌ 标点单独衬线（中文逗号、句号单独用衬线会飘）
- ❌ 常规空状态用衬线（空状态是过程，不是宣告）

#### 衬线间距锁死 `tracking-tight`

衬线标题必须 `tracking-tight`（约 -0.025em），禁用 `tracking-normal` 或正间距。  
原因：衬线笔画优雅但占宽，紧缩间距让汉字呼吸匀称。

---

## §3 留白与圆角

### 3.1 留白四级（高密度紧凑版）

| 语义 | 间距 | 场景 |
|---|---|---|
| **断层 Rift** | 20px | 章节之间 |
| **呼吸 Breath** | 16px | 标题与内容 |
| **紧凑 Tight** | 12px | 同级内容 |
| **亲密 Intimate** | 8px | 强关联元素 |

**留白梯次律**：`gap(父) > gap(子)`，违反即错。  
**锚点**：断层 20px > 呼吸 16px > 紧凑 12px > 亲密 8px。

### 3.2 圆角分级

| 元素类型 | 圆角 | Tailwind Class |
|---|---|---|
| 按钮/输入 | 6px | `rounded-md` |
| 小容器 | 8px | `rounded-lg` |
| 大容器 | 16px | `rounded-2xl` |

---

## §4 阴影与动效

### 4.1 漫反射阴影

```css
--shadow-input: 0 0 0 1px rgba(28,25,23,0.08), 0 1px 2px 0 rgba(28,25,23,0.04);
--shadow-card-ring: 0 0 0 1px rgba(28,25,23,0.08), 0 1px 2px 0 rgba(28,25,23,0.05);
--shadow-claude-float: 0 1px 2px rgba(28,25,23,0.04), 0 10px 28px -4px rgba(28,25,23,0.12), 0 3px 8px -2px rgba(28,25,23,0.06);
--shadow-claude-dialog: 0 1px 3px rgba(28,25,23,0.04), 0 18px 42px -6px rgba(28,25,23,0.16), 0 6px 18px -2px rgba(28,25,23,0.08);
```

### 4.2 物理动效

- **按压**：`active:scale-[0.99] active:duration-120`
- **抽屉**：`ease-[cubic-bezier(0.16,1,0.3,1)] duration-300`
- **淡入淡出**：`transition-opacity duration-200`

---

## §5 核心组件规格

### 5.1 Segmented Control 分段滑块

- **底槽**：`bg-[#F1F1F0]` + `rounded-lg` + `p-0.5`
- **选中**：`bg-white` + `shadow-2xs` + `font-medium`（允许 500 或 600，同产品内统一）
- **未选**：`text-[#78716C]` + `font-normal`

### 5.2 按钮规格

| 类型 | 底色 | 文字 | 字重 | 圆角 | 高度 |
|---|---|---|---|---|---|
| 主按钮 | `#D97757` | `#FFFFFF` | 500 | `rounded-md` | S: 32px / M: 36px / L: 40px |
| 次按钮 | `#FFFFFF` | `#1F1E1D` | 500 | `rounded-md` | 同上 + `shadow-input` |
| 幽灵按钮 | `transparent` | `#1F1E1D` | 400 | `rounded-md` | 同上 |

**移动端触控目标回正规则**：  
移动端可按无障碍标准放宽至 `min-h-[44px]`，此为**合规**；  
但凡是**会被桌面端复用**的元素，**必须同时配 `sm:min-h-0`** 让桌面端视觉回正到三档。

**判定要点**：这个 44px 是**为了手指命中率**（合规），还是**在桌面端也照样生效**（必须回正）。

### 5.3 输入框规格

- **底色**：`bg-white`
- **边框**：`border border-[#E2E2DF]`
- **阴影**：`shadow-input`
- **圆角**：`rounded-md`
- **高度**：S: 32px / M: 36px / L: 40px
- **占位符**：`placeholder:text-[#A8A29E]`

### 5.4 Alert 提示条

```tsx
<Alert variant="info">  // default / info / success / warning / error
  <span>操作提示内容</span>
</Alert>
```

**底色约束**：  
- Info: `bg-[#43718E]/8`
- Success: `bg-green-50`
- Warning: `bg-amber-50`
- Error: `bg-red-50`

禁用饱和色实底（`bg-green-500` 等）。

### 5.5 表格规则

#### 表头
- 无背景（`bg-transparent`）
- `text-[13px] font-medium text-[#78716C]`

#### 行分隔
- 仅底边 `border-b border-[#E2E2DF]/60`
- 禁用顶边、竖向列线（冻结列线豁免）、斑马纹

#### 数字列
- `tabular-nums` + `text-right`

#### 空值
- `—`（em dash，`&mdash;`）

### 5.6 出版物装帧组件

#### 卷首寄语 (Epigraph)
```tsx
<div className="border-l-2 border-[#D97757] pl-6 py-4 text-[15px] leading-relaxed text-[#78716C] font-serif tracking-tight">
  <p>寄语正文</p>
  <cite className="block mt-3 text-[13px] font-sans not-italic text-[#A8A29E]">— 署名</cite>
</div>
```

#### 学者边注 (Marginalia)
```tsx
<aside className="text-[12px] leading-relaxed text-[#78716C] border-t border-[#E2E2DF] pt-3 mt-4">
  边注内容
</aside>
```

#### 完卷徽记 (Colophon)
```tsx
<div className="flex items-center justify-center gap-2 text-[#A8A29E] text-[11px] mt-8">
  <span>✦</span>
  <span>全文完</span>
  <span>✦</span>
</div>
```

---

## §6 核心禁止清单

### 6.1 色彩
- ❌ L1 背景用冷白或发黄宣纸（必须 `#FCFCFB`）
- ❌ 同视野多个饱和焦点
- ❌ 状态色用饱和实底（`bg-green-500` / `bg-red-500` 等）
- ❌ 选中勾、引用线借用暖橙（暖橙只给 CTA）

### 6.2 字体
- ❌ 衬线加粗到 600+
- ❌ 衬线用 `tracking-normal` 或正间距
- ❌ 正文小于 13px（除 Form Label / Badge）
- ❌ 小于 14px 的衬线
- ❌ 半像素字号（10.5px / 11.5px / 12.5px / 13.5px）

### 6.3 布局
- ❌ 纸内套娃（白底套实底小框）
- ❌ 主容器加厚边框（用 `shadow-card-ring` 替代）
- ❌ 均匀分布留白（必须有四级语义）

### 6.4 动效
- ❌ 操作结果可见时仍弹 Toast
- ❌ 浮夸弹跳动画

### 6.5 表格
- ❌ 表头用彩色背景
- ❌ 竖向列线（普通表格列线；抽屉边缘线/分栏线/冻结列线/行内装饰线豁免）
- ❌ 斑马纹（含骨架屏条纹）
- ❌ 数字列不开启 `tabular-nums`
- ❌ 数字列左对齐
- ❌ 空值显示"暂无"或"null"（统一用 em dash「—」）

---

## §7 决策树

### 7.1 我应该用什么字号？

→ 页面 H1？ → 28px  
→ 区域标题（抽屉/面板）？ → 20px  
→ 容器标题（卡片/弹窗）？ → 18px  
→ 正文/数据？ → 13px  
→ 表单 label？ → 12px

### 7.2 我应该用衬线还是 Sans？

→ 页面 H1 或 AI 结论金句 且 ≥14px 且 ≤30 字？ → 衬线 + `tracking-tight`  
→ 其他所有情况 → Sans

### 7.3 容器用什么底色？

→ 页面大背景？ → `#FCFCFB`  
→ 稀疏卡片（≤3 列）？ → `#F1F1F0` 微气垫  
→ 密集表格（≥8 列）？ → `bg-white` + `shadow-card-ring`  
→ 输入表单？ → `bg-white`  
→ 容器内部？ → `bg-transparent`

---

## §8 AI 自检清单

提交前运行：

```bash
# 检查半像素字号（预期：0 结果）
grep -rn "text-\[10\.5px\]\|text-\[11\.5px\]\|text-\[12\.5px\]\|text-\[13\.5px\]" src/

# 检查非法字重（预期：仅在选中态/品牌标识）
grep -rn "font-semibold" src/ | grep -v "data-active\|aria-selected\|DYData"

# 检查衬线间距（预期：0 结果）
grep -rn "font-serif.*tracking-normal\|font-serif.*tracking-wide" src/

# 检查饱和色背景（预期：0 结果）
grep -rn "bg-green-500\|bg-red-500\|bg-blue-500" src/
```

手工检查：
- [ ] 全屏只有 1 个 `bg-[#D97757]` 主 CTA
- [ ] 密集表格（≥8 列）用了 `bg-white` 而非灰底
- [ ] AI 结论金句用了衬线且 ≥14px
- [ ] Form Label 用了 12px / 500
- [ ] 所有衬线标题用了 `tracking-tight`
