# Codex 审查任务：选题库线上版本不一致

## 背景

项目 dydata 的选题库页面 `/topics` 存在**本地代码与线上部署版本不一致**的问题。

### 本地代码（main 分支）
- 文件：`src/app/(app)/topics/page.tsx`
- 组件：`src/components/topics-v2/TopicHubV2.tsx`
- 页面结构：
  - 标题"选题库"
  - **今日聚焦** (TodayFocusSection)
  - **选题大盘** (TopicPoolExplorer)
  - **选题效果横向对比** (TopicComparisonMatrix)
  - 候选位 0/5
  - 录入选题按钮

### 线上实际显示（dydata.cc/topics）
- 标题"选题库"
- **推荐选题 / 全部选题 / 脚本中 / 趋势变化** Tab
- **AI 建议模块**
- 候选位 0/5
- 录入选题按钮

### 关键发现
1. `src/app/(app)/topics/page.tsx` 已引用 `TopicHubV2` 组件
2. `src/components/topics-v2/TopicHubV2.tsx` 代码包含"今日聚焦"和"选题大盘"
3. 线上显示的是不同的 UI 结构（推荐选题/全部选题等 Tab）
4. dydata.cc 域名解析到 Vercel IP（76.76.21.93, 66.33.60.194）
5. Vercel 项目 ID：`prj_A2aAvvNiAFbrNwhum54b9teaXXVP`

## 审查任务

### 1. 检查部署配置
- 查看 `vercel.json` 配置
- 检查是否有 GitHub Actions 配置（`.github/workflows/`）
- 确认 Vercel 是否配置了自动部署

### 2. 检查分支与部署关系
- 当前在 `feat/redo-today-submit-workbench` 分支
- main 分支最新提交：`23715a05`
- 确认 Vercel 部署的是哪个分支

### 3. 检查代码版本差异
- 对比 `src/components/topics-v2/TopicHubV2.tsx` 与线上实际渲染的组件
- 检查是否有条件渲染逻辑导致显示不同版本
- 检查是否有 A/B 测试或特性开关

### 4. 检查构建产物
- 检查 `.next/` 目录的构建时间
- 检查是否有缓存问题
- 确认构建是否成功

### 5. 检查部署历史
- 查看 Vercel 部署日志
- 检查最近的部署状态
- 确认是否有部署失败

## 输出要求

请提供：
1. **根因分析**：为什么线上显示的是旧版本？
2. **部署链路梳理**：代码从提交到上线的完整流程
3. **修复方案**：如何让线上更新到最新代码
4. **预防措施**：如何避免以后出现类似问题

## 相关文件

- `src/app/(app)/topics/page.tsx` - 选题库页面
- `src/components/topics-v2/TopicHubV2.tsx` - V2 主组件
- `vercel.json` - Vercel 配置
- `.vercel/project.json` - Vercel 项目信息
- `wrangler.jsonc` - Cloudflare Workers 配置
- `package.json` - 构建脚本
