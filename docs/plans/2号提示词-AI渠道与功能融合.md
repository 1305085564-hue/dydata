# 2号 Claude Code 任务书：AI 渠道与功能区融合重构

## 身份与目标
你好，我是阿禅。你是我的顶级架构师兼前端专家。
当前目标：将"AI 渠道管理"和"AI 功能配置"在前端融合为一个"所见即所得"的紧凑配置页。

## 强制 Skill 调用（硬规则，违反即返工）
1. 动手改 UI 前 → 必须先调用 `frontend-design` Skill 规划交互与组件结构
2. 准备提交或改了 3 个文件以上 → 必须调用 `code-review` Skill 自查
3. 充分利用系统中一切可用的 Skill 工具

## 分支规则
- 新建分支 `feat/ai-channels-merge`，基于 main
- 所有改动在此分支上，× 直接改 main

---

## 现有代码结构（必读，× 猜）

### AI 渠道管理
路径：`src/app/(app)/admin/ai-channels/`
- `page.tsx` — Server Component，仅 owner 可访问
- `ai-channels-client.tsx` — 650 行客户端组件
  - 表格布局：名称 | 地址 | 密钥(脱敏) | 模型 | 优先级 | 状态 | 最近记录 | 失败次数 | 操作
  - 状态：健康(绿) / 熔断中(红) / 已禁用(灰)
  - 操作：测试(文本+OCR两种) | 编辑 | 恢复/禁用 | 删除(带确认弹窗)
  - 新增/编辑用 Dialog 弹窗表单
  - API：GET/POST/PUT/DELETE `/api/admin/ai-channels`，测试 `/api/admin/ai-channels/test`，恢复 `/api/admin/ai-channels/recover`

### AI 渠道数据类型
```typescript
type AiChannelRow = {
  id: string;
  name: string;
  base_url: string;
  api_key_masked: string;      // GET 返回 "***"，POST/PUT 返回真实脱敏值
  model: string | null;
  priority: number;
  is_enabled: boolean;
  unhealthy_until: string | null;
  consecutive_failures: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  last_error_message: string | null;
};
```

### AI 功能配置
路径：`src/app/(app)/admin/ai-features/`
- `page.tsx` — Server Component
- `ai-features-client.tsx` — 269 行，主逻辑
- `ai-features-group-list.tsx` — 373 行，功能分组列表
- `ai-features-hero.tsx` — 101 行，页面头部导航
- `ai-features-nav-cards.tsx` — 59 行，导航卡片（指向 ai-channels 等页面）
- API：GET/PUT `/api/admin/ai-features`
- 保存机制：自动保存（debounce 500ms + sequence number 乐观更新）

### AI 功能数据类型
```typescript
type AiFeatureApiRow = {
  id: string;
  feature_key: string;          // 如 growth_insight, rewrite 等
  label: string;                // 显示名称
  channel_id: string | null;    // 绑定的渠道 ID（null = 自动 failover）
  channel_name: string | null;  // join 出来的渠道名
  model: string | null;         // 功能专属模型（null = 跟随渠道默认）
  system_prompt: string | null; // 功能专属提示词
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};
```

### 关键数据关系（最重要，× 搞反）
数据模型是 **功能 → 渠道** 的引用关系（每个功能的 `channel_id` 指向一个渠道），× 是"渠道拥有功能"。
- 一个功能只能绑定一个渠道（或 null 表示自动分配）
- 一个渠道可以被多个功能引用
- 功能共 13 个，分 5 组（成长分析/内容工具/OCR/后台助手/其他）

### 功能分组元数据
定义在 `src/lib/ai/feature-metadata.ts`，包含每个功能的标题、位置、用途、输入输出说明。

---

## 融合重构要求

### 1. 整体布局：左导航 + 右配置

**左侧边栏（240px 固定宽度，× 用百分比）**：
- 垂直列出所有 AI 渠道
- 每个渠道项显示：名称 + 状态指示（绿点=健康 / 红点=熔断 / 灰点=禁用）+ 启停 Switch
- 选中态有明显高亮
- 底部："+ 添加渠道" 按钮
- 点击切换渠道时，右侧内容无刷新平滑切换（useState 控制 selectedChannelId）

**右侧主区（剩余宽度）**：分上下两个区域

#### 上半区：渠道基础参数
- 表单字段：名称 / Base URL / API Key（密码遮罩 + 显示/隐藏切换）/ 默认模型 / 优先级
- "测试连接" 按钮 — 保留文本测试和 OCR 测试两种模式（现有代码已有，复用）
- "保存" 按钮 — 提交渠道基础参数修改
- "删除渠道" 按钮 — 带确认弹窗（现有代码已有，复用）
- 渠道健康状态信息：最后成功/失败时间、连续失败次数、熔断恢复时间（只读展示）

#### 下半区：功能绑定区（核心改造）
- 标题："该渠道可承接的 AI 功能"
- 用 Grid 卡片（2列）平铺所有 13 个功能
- 每个功能卡片显示：
  - 功能名称（label）+ 功能分组标签
  - Switch 开关：表示"是否将此功能绑定到当前渠道"
  - Switch 逻辑：
    - 如果该功能的 `channel_id === 当前选中渠道的 id` → Switch 亮起
    - 如果该功能的 `channel_id === null`（自动分配）→ Switch 关闭，但显示"自动分配"灰色标签
    - 如果该功能的 `channel_id === 其他渠道的 id` → Switch 关闭，显示"已绑定到 [渠道名]"灰色标签
  - 打开 Switch → 将该功能的 `channel_id` 设为当前渠道 id
  - 关闭 Switch → 将该功能的 `channel_id` 设为 null（回到自动分配）
  - Switch 操作后自动保存（保留现有的 debounce 500ms 机制）
  - 卡片可展开：展开后显示该功能的专属模型选择 + 专属提示词编辑（Textarea）

### 2. 保存机制（两套并存，× 统一）
- 渠道基础参数：手动保存（点"保存"按钮提交）— 沿用现有 ai-channels 的 PUT 逻辑
- 功能绑定：自动保存（debounce 500ms）— 沿用现有 ai-features 的自动保存逻辑
- 页面顶部显示保存状态指示器（"已保存" / "保存中..." / "有未保存的更改"）

### 3. 路由策略
- 融合后的页面路由保留 `/admin/ai-channels`
- `/admin/ai-features` 页面改为重定向到 `/admin/ai-channels`（在 page.tsx 中 `redirect("/admin/ai-channels")`）
- 更新 `AdminSecondaryNav` 中的导航项（如果 ai-features 有独立导航入口的话）
- 清理 `ai-features-nav-cards.tsx` 中指向 ai-channels 的导航卡片（融合后不需要了）

### 4. 组件拆分（× 塞进一个文件）
融合后代码量会很大，必须拆分：
- `ai-channels-client.tsx` — 主容器（状态管理 + 左右布局框架），控制在 300 行以内
- `channel-sidebar.tsx` — 左侧渠道列表
- `channel-detail-form.tsx` — 右侧上半区：渠道基础参数表单
- `channel-feature-bindings.tsx` — 右侧下半区：功能绑定 Grid
- `channel-feature-card.tsx` — 单个功能绑定卡片（含 Switch + 展开配置）
- `channel-test-dialog.tsx` — 测试连接弹窗（从现有代码提取）
- `channel-delete-dialog.tsx` — 删除确认弹窗（从现有代码提取）

### 5. 现有功能必须保留（× 丢）
- 渠道 CRUD（增删改查）
- 渠道测试（文本测试 + OCR 测试）
- 渠道熔断恢复
- 渠道启用/禁用
- 功能启用/禁用
- 功能绑定渠道
- 功能专属模型选择
- 功能专属提示词编辑
- 功能自动保存 + 保存状态反馈

---

## 硬性约束（违反任何一条即返工）

1. × 修改 `src/app/api/` 下的任何 API 路由文件
2. × 修改 `src/components/app-shell/` 下的共享组件
3. × 修改 `src/components/ui/` 下的现有组件（可以新增）
4. × 改变任何 API 的请求/响应格式
5. × 删除或改变现有的权限检查逻辑（page.tsx 中的 auth + role 检查）
6. × 修改 `src/lib/ai/feature-metadata.ts`（功能元数据定义）
7. × 修改 `src/lib/ai/client.ts`（AI 客户端库）
8. 所有现有功能必须保留
9. 改完后必须 `npm run build` 通过，零错误

## 验收标准
1. `npm run build` 零错误
2. 左侧渠道列表正确显示，点击切换无刷新
3. 右侧上半区：渠道参数编辑 + 保存 + 测试连接 + 删除 全部正常
4. 右侧下半区：13 个功能卡片全部显示，Switch 状态正确反映 channel_id 绑定关系
5. 功能绑定的自动保存正常工作
6. `/admin/ai-features` 正确重定向到 `/admin/ai-channels`
7. 新增渠道功能正常
