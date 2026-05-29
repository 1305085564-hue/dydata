# 交接文档：批改台 & 素材库 UI 修复

## 原始需求清单（共 6 项）

| 编号 | 模块 | 需求 |
|------|------|------|
| F1 | 批改台 涨跌列 | 颜色加深（当前太浅，看不清涨跌，跌的色深要低于涨） |
| F2 | 批改台 涨跌列 | 去掉 +/- 符号 |
| F4 | 批改台 涨跌列 | 数字按整数位右对齐 |
| F5 | 批改台 列表容器 | 消除横向滚动条（保留纵向） |
| F6 | 批改台 列表容器 | 消除纵向多余滚动空间 |
| F7 | 素材库 列表容器 | 消除纵向多余滚动空间 |

---

## 代码层面的实际修改

### 1. content-list.tsx（批改台列表）— 4 处改动

**PlayChangeBadge（第 68-85 行）**
- 涨：`#D99E55` → `#C47A2B`，去掉 `+` 和括号
- 跌：`#C9604D` → `#D97A6A`，去掉 `-` 和括号
- 加 `inline-block w-14 text-right` 右对齐

**表格容器（第 577-580 行）**
- 移除 `style={{ maxHeight: "70vh" }}`
- `overflow-x-auto overflow-y-auto` → `h-full overflow-x-hidden overflow-y-auto`

**根元素（第 541 行）和表格包裹层（第 558 行）**
- 添加 `flex flex-1 flex-col min-h-0` 等 flex 布局属性

### 2. content-page-client.tsx — 1 处改动
- section 加 `flex flex-1 flex-col`

### 3. video-list.tsx（素材库列表）— 2 处改动
- 根元素加 `flex flex-1 flex-col min-h-0`
- 表格容器：`overflow-x-auto overflow-y-auto` + `maxHeight: 70vh` → `h-full overflow-x-hidden overflow-y-auto`

### 4. video-page-client.tsx — 1 处改动
- section 加 `flex flex-1 flex-col`

### 5. admin-main-area.tsx — 1 处改动
- 内层 div 加 `h-full flex flex-col`

### 6. content-detail-dialog.tsx — 混入大量非本次需求的已有改动

该文件 git diff 显示 663 行变动，但其中**大量是之前就存在于工作区的未提交代码**（KpiHero 替换 MetricBadge、PillGroup 组件删除、经验标记 UI 重构、buildRuleHints 重构等）。

**本次需求相关的改动只有：**
- MetricTone 类型扩展 `"halve"`
- anomalyChips 暴涨/腰斩去掉 `+/-` 符号
- 腰斩项 tone 从 `"red"` 改为 `"halve"`
- amber 文本色 `#9c7437` → `#C47A2B`
- Chip 渲染处新增 `halve` 分支颜色 `#D97A6A`

---

## 用户反馈的问题

1. **"没有颜色，直接把颜色取消了"**
   - 代码中颜色类名 `text-[#C47A2B]` 和 `text-[#D97A6A]` 仍然存在，没有被取消
   - 可能原因：浏览器缓存、数据中无涨跌信号导致组件返回 null、或颜色值在实际屏幕上不够深
   - **需要浏览器实测验证**

2. **"很多任务没完成"**
   - F2/F4/F5 的代码改动清晰明确，应当已完成
   - F1/F6/F7 依赖实际运行效果，代码已改但需浏览器验证
   - **关键风险**：flex 布局改动（admin-main-area 加 `h-full flex flex-col`）可能影响其他 admin 页面，需要全站滚动行为验证

3. **"maxHeight: '70vh' 魔法数字"**
   - 这是项目原有的代码，不是我加的
   - 我在计划中称其为"魔法数字"是因为这个固定视口比例值无法自适应不同屏幕尺寸
   - 已将其移除并替换为 flex 自适应

---

## 下一个 AI 需要核查的事项

- [ ] 浏览器实测：批改台播放列涨跌标签颜色是否显示、深浅是否符合预期
- [ ] 浏览器实测：整数位右对齐效果（不同位数百分比是否对齐）
- [ ] 浏览器实测：批改台横向滚动条是否已消除
- [ ] 浏览器实测：批改台和素材库纵向滚动是否到底自然结束、无多余空白
- [ ] 浏览器实测：admin 其他页面布局是否被 flex 改动破坏
- [ ] 代码核查：content-detail-dialog.tsx 中大量非本次需求的改动是否为用户预期的其他需求，或需要回滚
