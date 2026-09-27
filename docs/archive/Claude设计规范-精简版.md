# Claude 设计规范（高密度产品适配版）

---

## 1. 色彩 Token

| Token | 色值 | 场景 |
|---|---|---|
| **Action** | `#D97757` | 全屏唯一主 CTA |
| **Surface** | `#F1F1F0` / `#FFFFFF` | 展示气垫 / 交互纯白 |
| **Canvas** | `#FCFCFB` | 页面大背景 |
| **Ink 950** | `#141413` | H1/H2 标题 |
| **Ink 800** | `#1F1E1D` | 正文 |
| **Ink 600** | `#78716C` | 辅助文字 |
| **Border** | `#E2E2DF` | 发丝线 |

**中性色锁定 H=60° 暖灰体系；业务语义色（陶土橙/位置蓝/状态色）不受约束。**

### 色彩原则

- **单点聚光灯**：每屏至多 1 个暖橙 CTA，全屏 95% 保持中性
- **双向深度**：展示容器用 `#F1F1F0` 下沉，输入框用 `#FFFFFF` 上浮
- **禁止**：冷蓝强调色、饱和色实底（`bg-green-500` 等）、同视野多个饱和焦点

---

## 2. 字阶与字重

| 层级 | 字号 | 字重 | 墨度 |
|---|---|---|---|
| H1 页面级 | 28px | 500 | `#141413` |
| H2 区域级 | 20px | 500 | `#141413` |
| H3 容器级 | 18px | 500 | `#1F1E1D` |
| H4 内容级 | 14px | 500 | `#1F1E1D` |
| Body 正文 | 13px | 400 | `#1F1E1D` |
| Caption 次级 | 12px | 400 | `#78716C` |

**判定口诀：** 页面唯一 → H1；独立面板主标 → H2；卡片/弹窗标题 → H3。

### 字重规则

- 全站仅 **400 / 500 / 600** 三档
- 600 仅限：① 选中态（`data-active` 等状态驱动）；② 品牌标识
- 禁止：H3 以下使用 600、正文脱离 400

### 衬线使用白名单（高密度适配）

| 场景 | 字号 | 间距 | 判据 |
|---|---|---|---|
| 页面 H1 | 28px | `tracking-tight` | 每页唯一的页面级标题 |
| AI 洞察结论 | ≥14px | `tracking-tight` | AI 生成的归因/诊断金句 |

**判据：这是过程，还是宣告？** 宣告用衬线，过程用 Sans。超过 30 字成段改回 Sans。

**禁止：** 表格/表单/按钮/导航使用衬线、小于 14px 的衬线、标点单独衬线、常规空状态用衬线。

---

## 3. 留白四级（高密度紧凑版）

| 语义 | 间距 | 场景 |
|---|---|---|
| 断层 | 20px | 章节之间 |
| 呼吸 | 16px | 标题与内容 |
| 紧凑 | 12px | 同级内容 |
| 亲密 | 8px | 强关联元素 |

**留白梯次律：** `gap(父) > gap(子)`，违反即错。

---

## 4. 圆角 / 阴影 / 动效

### 圆角分级
- 按钮/输入：`rounded-md` (6px)
- 小容器：`rounded-lg` (8px)
- 大容器：`rounded-2xl` (16px)

### 漫反射阴影
```css
--shadow-input: 0 0 0 1px rgba(28,25,23,0.08), 0 1px 2px 0 rgba(28,25,23,0.04);
--shadow-card-ring: 0 0 0 1px rgba(28,25,23,0.08), 0 1px 2px 0 rgba(28,25,23,0.05);
```

### 物理动效
- 按压：`active:scale-[0.99] active:duration-120`
- 抽屉：`ease-[cubic-bezier(0.16,1,0.3,1)] duration-300`

---

## 5. 组件配方速查

### Alert 提示条
```tsx
<Alert variant="info">  // default / info / success / warning / error
  <span>操作提示内容</span>
</Alert>
```

### Segmented Control 分段滑块
- 底槽：`bg-[#F1F1F0]` + `rounded-lg`
- 选中：`bg-white` + `shadow-2xs` + `font-medium`（允许 500 或 600，同产品内统一）
- 未选：`text-[#78716C]` + `font-normal`

### 表格规则
- 表头：无背景，`text-[13px] font-medium text-[#78716C]`
- 行分隔：仅底边 `border-b border-[#E2E2DF]/60`
- 数字列：`tabular-nums` + `text-right`
- 空值：`—`（em dash）

**禁止：** 表头背景色、竖向列线（冻结列线豁免）、斑马纹。

---

## 6. 核心禁止清单

### 色彩
- ❌ L1 背景用冷白或发黄宣纸（必须 `#FCFCFB`）
- ❌ 同视野多个饱和焦点
- ❌ 状态色用饱和实底

### 字体
- ❌ 衬线加粗到 600+
- ❌ 衬线用 `tracking-normal` 或正间距
- ❌ 正文小于 13px（除 Form Label / Badge）
- ❌ 小于 14px 的衬线

### 布局
- ❌ 纸内套娃（白底套实底小框）
- ❌ 主容器加厚边框（用 `shadow-card-ring` 替代）
- ❌ 均匀分布留白（必须有四级语义）

### 动效
- ❌ 操作结果可见时仍弹 Toast
- ❌ 浮夸弹跳动画

---

## 7. 决策树

### 我应该用什么字号？
→ 页面 H1？ → 28px  
→ 区域标题（抽屉/面板）？ → 20px  
→ 容器标题（卡片/弹窗）？ → 18px  
→ 正文/数据？ → 13px

### 我应该用衬线还是 Sans？
→ 页面 H1 或 AI 结论金句 且 ≥14px 且 ≤30 字？ → 衬线 + `tracking-tight`  
→ 其他所有情况 → Sans

### 容器用什么底色？
→ 页面大背景？ → `#FCFCFB`  
→ 稀疏卡片（≤3 列）？ → `#F1F1F0` 微气垫  
→ 密集表格（≥8 列）？ → `bg-white` + `shadow-card-ring`  
→ 输入表单？ → `bg-white`  
→ 容器内部？ → `bg-transparent`

---

## 8. AI 自检清单

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
