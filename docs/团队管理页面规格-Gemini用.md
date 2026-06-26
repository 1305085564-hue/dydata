# DYData 团队管理页面规格文档（Gemini UI 重建用）

> 本文档为 Gemini 网站提供足够信息来重建前端 UI。包含页面结构、业务逻辑、数据库表、按钮行为、前后端交互等完整规格。

---

## 一、页面架构总览

### 1.1 导航结构

```
团队管理（/admin）
├── 今日待办（/admin）           ← 主页面，管理员看板
├── 批改台（/admin/content）     ← 内容审核
├── 经营分析（/admin/analytics） ← 数据报表
├── 素材库（/admin/videos）      ← 视频资产
└── 成员与权限（/admin/modules） ← 成员管理 + 团队分组
```

### 1.2 角色权限体系

| 角色 | 代码标识 | 权限范围 |
|------|---------|---------|
| 超级管理员 | `owner` | 全局全权限，可切换公司/团队视角 |
| 团队负责人 | `team_admin`（admin + manage_members=true） | 团队内管理等同 owner |
| 组长 | `group_leader`（admin + groups.leader_user_id） | 负责本组内容和数据 |
| 组员 | `member` | 默认无后台权限，需逐项授权 |

### 1.3 权限开关（Permissions）

```typescript
// 后台权限
type AdminPermissionKey =
  | "view_all_data"      // 查看所有数据
  | "edit_data"          // 编辑/删除数据
  | "export_data"        // 导出数据
  | "view_analytics"     // 数据分析
  | "manage_members"     // 管理成员状态
  | "manage_violations"  // 违规话术复核
  | "view_conversion_hub" // 查看转化中心
  | "view_content_review" // 查看批改台
  | "manage_video_assets" // 管理素材库

// AI 能力
type AiPermissionKey =
  | "use_ai_copywriting"  // AI 文案助手
  | "use_ai_management"   // AI 管理助手
```

---

## 二、今日待办（/admin）— 主页面

### 2.1 页面目标

管理员每天打开的第一个页面，快速看到需要处理的事项，一键审批。

### 2.2 页面布局

```
┌─────────────────────────────────────────────────────────┐
│                      AI 速览面板                          │
│  ┌─────────────┐  ┌────────────────────────────────────┐│
│  │ 告警分组列表  │  │         告警详情 + 批量操作         ││
│  │ (左侧边栏)   │  │                                    ││
│  │ • 高优 3     │  │  ☑ 全选    [一键执行]               ││
│  │ • 中优 5     │  │  ┌──────────────────────────────┐  ││
│  │ • 信息 2     │  │  │ ☑ 张三 · 暴涨 150%           │  ││
│  │              │  │  │ ☑ 李四 · 腰斩 -60%           │  ││
│  │              │  │  │ ☐ 王五 · 异常波动             │  ││
│  │              │  │  └──────────────────────────────┘  ││
│  └─────────────┘  └────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│                    待处理队列（两栏）                      │
│  ┌─────────────────────┐  ┌─────────────────────────────┐│
│  │ 异常视频             │  │ 待审批                      ││
│  │ ┌─────────────────┐ │  │ ┌─────────────────────────┐ ││
│  │ │ 📈 张三 +150%   │ │  │ │ [待催交] [豁免申请] [入团]│ ││
│  │ │ 📉 李四 -60%    │ │  │ │                         │ ││
│  │ │ 📈 王五 +80%    │ │  │ │ 张三 · 深圳二部 · 未交   │ ││
│  │ │ ...             │ │  │ │ 李四 · 申请豁免(昨日)    │ ││
│  │ └─────────────────┘ │  │ │ 王五 · 申请加入深圳一部   │ ││
│  │         [查看全部]→  │  │ └─────────────────────────┘ ││
│  └─────────────────────┘  └─────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 2.3 AI 速览面板

**功能**：AI 自动扫描团队数据，生成告警摘要。

**数据来源**：`/api/admin/dashboard-alerts`

**告警分级**：
- `critical`（高优）：红色标记，如暴涨/腰斩视频、连续未交数据
- `warning`（中优）：橙色标记，如数据异常波动
- `info`（信息）：灰色标记，如常规提醒

**交互**：
- 左侧：告警分组列表，按严重程度排序，点击切换详情
- 右侧：告警详情列表，支持全选/单选
- 操作按钮：
  - 「问问 AI」：跳转 AI 助手对话
  - 「一键执行」：批量执行告警建议动作
  - 「刷新」：手动刷新告警数据

**轮询**：每 3 分钟自动刷新

### 2.4 异常视频卡片

**功能**：展示今日播放量异常（暴涨/腰斩）的视频。

**数据来源**：`/api/admin/cockpit/pending-videos?date=YYYY-MM-DD&limit=10`

**数据库查询**：`admin_anomaly_videos_today` RPC 函数

**数据结构**：
```typescript
interface PendingVideoRow {
  id: string;
  account_name: string;        // 账号名
  video_title: string | null;  // 视频标题
  published_at: string | null; // 发布时间
  play_change_signal: "surge" | "halve"; // 暴涨/腰斩
  play_count_change_pct: number | null;  // 变化百分比
  current_play_count: number | null;     // 当前播放量
  previous_play_count: number | null;    // 之前播放量
  submitted_by: string | null;  // 提交人ID
  submitted_by_name: string | null; // 提交人姓名
}
```

**UI 展示**：
- 每行：趋势图标（📈/📉）+ 账号名 + 提交人 + 播放量
- 颜色：暴涨用红色 `#C9604D`，腰斩用绿色 `#6FAA7D`
- 点击：弹出视频预览对话框
- 「查看全部」→ 跳转 `/admin/content?view=all`

### 2.5 待审批合并卡

**功能**：三个 Tab 合并展示待处理的审批事项。

**Tab 结构**：

| Tab | 标签 | 数据来源 | 数据库表 |
|-----|------|---------|---------|
| 待催交 | `submissions` | `admin_pending_submissions_today` RPC | `daily_reports` + `profiles` |
| 豁免申请 | `exemptions` | 直接查询 | `exemption_request` |
| 入团申请 | `joins` | `listPendingRequestsForAdmin()` | `team_join_request` |

**待催交 Tab**：
```typescript
interface PendingSubmissionRow {
  profile_id: string;
  name: string;              // 成员姓名
  team_id: string | null;    // 团队ID
  team_name: string | null;  // 团队名
  last_report_date: string | null; // 最后提交日期
}
```
- 展示：团队名 + 姓名 + 最后提交日期
- 操作：点击行查看详情

**豁免申请 Tab**：
```typescript
interface ExemptionRequestRow {
  id: string;
  applicant_user_id: string;
  applicant_name: string;    // 申请人姓名
  exemption_type: string;    // 类型：yesterday/range/permanent
  exemption_category: string | null; // 分类：waive/leave
  reason: string | null;     // 申请原因
  created_at: string;
}
```
- 展示：申请人 + 类型标签 + 原因
- 操作：Hover 显示「批准」「拒绝」按钮
- 撤销：操作后 5 秒内可撤销

**入团申请 Tab**：
```typescript
interface AdminRequestRow {
  id: string;
  applicantName: string;     // 申请人姓名
  targetTeamName: string;    // 目标团队名
}
```
- 展示：申请人 + 申请加入「团队名」
- 操作：Hover 显示「批准」「拒绝」按钮

### 2.6 关键按钮行为

| 按钮 | 位置 | 行为 | 后端接口 |
|------|------|------|---------|
| 批准（豁免） | 豁免申请行 Hover | 调用 `reviewExemptionRequest` | Server Action |
| 拒绝（豁免） | 豁免申请行 Hover | 调用 `reviewExemptionRequest` | Server Action |
| 批准（入团） | 入团申请行 Hover | 调用 `approveJoinRequestAction` | Server Action |
| 拒绝（入团） | 入团申请行 Hover | 调用 `rejectJoinRequestAction` | Server Action |
| 催交历史 | 待催交 Tab 右上角 | 打开催交记录对话框 | `/api/admin/cockpit/remind-logs` |
| 查看全部 | 卡片右上角 | 跳转对应完整页面 | — |
| 问问 AI | AI 速览右上角 | 跳转 AI 助手对话 | — |
| 一键执行 | AI 速览详情区 | 批量执行告警动作 | `/api/admin/dashboard-alerts/{id}/execute` |
| 刷新 | AI 速览右上角 | 手动刷新告警数据 | `/api/admin/dashboard-alerts` |

### 2.7 前后端交互流程

**首屏加载（SSR）**：
```
1. 服务端验证权限 → getUserPermissions()
2. 构建数据访问范围 → buildDataAccessScope()
3. 并行加载：
   - loadAdminFirstScreenData(date) → 异常视频 + 待催交 + 豁免申请 + 入团申请
   - loadAlertsForSSR(userId) → AI 告警数据
4. 渲染页面，数据作为 initialData 传给客户端组件
```

**客户端轮询**：
```
- 异常视频：每 3 分钟 → /api/admin/cockpit/pending-videos
- 待催交：每 5 分钟 → /api/admin/cockpit/pending-submissions
- 汇总数字：每 3 分钟 → /api/admin/cockpit/summary
- AI 告警：每 3 分钟 → /api/admin/dashboard-alerts
```

### 2.8 数据库表依赖

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `profiles` | 成员信息 | id, name, role, team_id, group_id, permissions, status |
| `teams` | 团队 | id, name |
| `groups` | 分组 | id, team_id, name, leader_user_id |
| `daily_reports` | 日报 | id, user_id, report_date, play_count, follower_gain |
| `videos` | 视频 | id, account_id, user_id, play_change_signal, play_count_change_pct |
| `video_metrics_snapshots` | 视频快照 | video_id, snapshot_type, play_count, captured_at |
| `exemption_request` | 豁免申请 | id, applicant_user_id, exemption_type, request_status |
| `team_join_request` | 入团申请 | id, applicant_user_id, target_team_id, status |
| `content_feedback_cards` | 批改卡 | id, video_id, target_user_id, card_status |

---

## 三、成员与权限（/admin/modules）

### 3.1 页面目标

管理团队成员的角色、权限、团队归属、分组分配。

### 3.2 页面布局

```
┌─────────────────────────────────────────────────────────┐
│ 成员与权限 · 团队与成员                                    │
│ 成员权限管理、团队与分组维护                                │
├─────────────────────────────────────────────────────────┤
│  [成员权限]  [团队与分组]     [+ 管理团队]  [数据管理]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  团队: [全部团队 ▼]  搜索: [姓名/邮箱/团队]    显示 12/15人 │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 姓名        团队        角色      权限    >          ││
│  ├─────────────────────────────────────────────────────┤│
│  │ 张三        深圳二部    管理员    7/11    >          ││
│  │ 李四        深圳一部    成员      2/11    >          ││
│  │ 王五        深圳二部    成员      3/11    >          ││
│  │ ...                                                 ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  [上一页] [1] [2] [3] [下一页]    [展开全部（共15人）]     │
└─────────────────────────────────────────────────────────┘
```

### 3.3 成员权限 Tab

**数据来源**：SSR 首屏 + `/api/admin/modules/member-emails`（邮箱补全）

**成员行展示**：
- 姓名（左对齐）
- 团队名（左对齐）
- 角色标签：管理员（橙色圆点）/ 成员（灰色背景）
- 权限计数：`已启用/总数`（如 `7/11`）

**点击成员行 → 右侧 Sheet 面板**：

```
┌─────────────────────────────────────────┐
│ 张三  管理员  [AI 建议]                   │
│ 深圳二部  zhangsan@example.com           │
├─────────────────────────────────────────┤
│                                         │
│ 后台权限                                 │
│ ┌─────────────────────────────────────┐ │
│ │ 查看所有数据           ☑            │ │
│ │ 编辑/删除数据          ☐            │ │
│ │ 导出数据               ☑            │ │
│ │ 数据分析               ☑            │ │
│ │ 管理成员状态           ☐            │ │
│ │ 违规话术复核           ☐            │ │
│ │ 查看转化中心           ☐            │ │
│ │ 查看批改台             ☐            │ │
│ │ 管理素材库             ☐            │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ AI 能力                                  │
│ ┌─────────────────────────────────────┐ │
│ │ AI 文案助手            ☑            │ │
│ │   使用文案改写工具生成爆款文案       │ │
│ │ AI 管理助手            ☑            │ │
│ │   使用后台 AI 助手查询与执行管理操作 │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 成员操作                                 │
│ 角色: [管理员 ▼]                         │
│ 团队: [深圳二部 ▼]                       │
│ [重置密码]  [移出团队]                    │
│ [设置豁免]                               │
├─────────────────────────────────────────┤
│ * 权限变更将在成员下次访问页面时生效       │
│              [取消]  [保存]              │
└─────────────────────────────────────────┘
```

**Sheet 内按钮行为**：

| 按钮 | 行为 | 后端接口 |
|------|------|---------|
| AI 建议 | 获取 AI 对该成员的分析建议 | POST `/api/admin/member-ai-suggestion` |
| 执行（AI建议） | 执行 AI 建议的操作 | POST `/api/admin/execute-tool` |
| 保存 | 保存权限变更 | Server Action `updatePermissions` |
| 角色下拉 | 切换成员/管理员角色 | Server Action `changeRole` |
| 团队下拉 | 调配成员到其他团队 | Server Action `updateMemberTeam` |
| 重置密码 | 弹出密码重置对话框 | Server Action `resetMemberPassword` |
| 移出团队 | 确认后移出团队 | Server Action `removeMemberFromTeam` |
| 设置豁免 | 打开豁免设置弹窗 | Server Action |

### 3.4 团队与分组 Tab

**数据来源**：`/api/admin/modules/team-management`

**数据结构**：
```typescript
interface TeamManagementData {
  access: TeamManagementAccess;  // 当前用户权限级别
  teams: Team[];                 // 团队列表
  groups: Group[];               // 分组列表
  profiles: Profile[];           // 成员列表
  leaderCandidates: Profile[];   // 可选组长候选人
}
```

**功能**：
- 创建/编辑/删除分组
- 分配成员到分组
- 选择/更换组长
- 管理团队（创建/删除团队）

### 3.5 数据管理按钮

打开数据治理对话框，支持：
- 导出数据（需要 `export_data` 权限）
- 编辑/删除数据（需要 `edit_data` 权限）

---

## 四、批改台（/admin/content）

### 4.1 页面目标

管理员审核达人提交的视频内容，提供反馈，跟踪批改进度。

### 4.2 页面布局

```
┌─────────────────────────────────────────────────────────┐
│ [未开始 5] [全部 23]   [公司视角] [团队视角] [深圳二部 ▼]  │
│                                          批改台          │
│                            待确认 2  已确认未发 1  已下发 3│
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 📹 视频卡片列表                                      ││
│  │                                                     ││
│  │ ┌─────────────────────────────────────────────────┐ ││
│  │ │ 视频标题 · 账号名 · 发布时间                      │ ││
│  │ │ 播放量: 12,500  点赞: 320  评论: 45              │ ││
│  │ │ 状态: [未开始]  [生成批改卡] [查看快照]            │ ││
│  │ └─────────────────────────────────────────────────┘ ││
│  │                                                     ││
│  │ ┌─────────────────────────────────────────────────┐ ││
│  │ │ ...更多视频...                                   │ ││
│  │ └─────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 4.3 视角切换

- **公司视角**（仅 owner）：查看所有团队数据
- **团队视角**：查看指定团队数据，可切换团队

### 4.4 批改卡工作流

```
未开始 → 草稿(draft) → 已确认(confirmed) → 已下发(sent) → 员工已读(viewed)
```

**批改卡数据结构**：
```typescript
interface ContentFeedbackCardView {
  card_id: string | null;
  video_id: string;
  workflow_status: "not_started" | "draft" | "confirmed" | "sent" | "viewed";
  workflow_label: string;
  has_ai_draft: boolean;
  latest_draft_at: string | null;
  confirmed_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  manager_note: string | null;
}
```

### 4.5 关键按钮

| 按钮 | 行为 | 后端接口 |
|------|------|---------|
| 生成批改卡 | AI 生成批改建议 | POST `/api/admin/content/feedback-cards` |
| 确认 | 确认批改内容 | PATCH `/api/admin/content/feedback-cards/{id}` |
| 下发 | 发送给员工 | POST `/api/admin/content/feedback-cards/{id}/send` |
| 查看快照 | 查看视频 24h/72h 数据快照 | — |

---

## 五、经营分析（/admin/analytics）

### 5.1 页面目标

查看团队/成员的数据趋势、爆款分析、AI 洞察。

### 5.2 页面布局

```
┌─────────────────────────────────────────────────────────┐
│ 经营分析                                                 │
├─────────────────────────────────────────────────────────┤
│ 时间范围: [近7天] [近30天] [近90天] [自定义]              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────┐│
│  │ 播放量趋势图     │ │ 粉丝增长趋势图   │ │ 汇总指标   ││
│  │                 │ │                 │ │            ││
│  │   📈            │ │   📈            │ │ 总播放: 1M ││
│  │                 │ │                 │ │ 总涨粉: 5K ││
│  └─────────────────┘ └─────────────────┘ └────────────┘│
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 成员排行榜                                           ││
│  │                                                     ││
│  │ 排名  姓名    播放量    涨粉    完播率                ││
│  │ 1     张三    500K     2.1K    45%                   ││
│  │ 2     李四    320K     1.8K    38%                   ││
│  │ ...                                                 ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ AI 洞察                                              ││
│  │ • 张三连续 3 天播放量下滑，建议检查选题方向...         ││
│  │ • 深圳二部整体涨粉率高于其他团队...                    ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 5.3 数据来源

- SSR 首屏：`/api/admin/panels/analytics`
- 时间范围：`preset`（7d/30d/90d/custom）+ `from`/`to`

---

## 六、全局组件

### 6.1 顶部导航栏（AdminTopNav）

```typescript
const navItems = [
  { label: "今日待办", href: "/admin", badgeKey: "cockpit" },
  { label: "经营分析", href: "/admin/analytics" },
  { label: "素材库", href: "/admin/videos", badgeKey: "videos" },
  { label: "批改台", href: "/admin/content", badgeKey: "content" },
];
```

- Badge 数字：轮询 `/api/admin/sidebar-badges`

### 6.2 工作区布局（AdminWorkspaceLayout）

```typescript
interface AdminWorkspaceLayoutProps {
  eyebrow?: string;     // 小标题（如"成员与权限"）
  title?: string;       // 主标题
  description?: string; // 描述
  indexItems?: Array<{ id: string; label: string }>; // 锚点导航
  children: React.ReactNode;
}
```

---

## 七、API 接口清单

### 7.1 今日待办相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/cockpit/summary?date=YYYY-MM-DD` | 汇总数字 |
| GET | `/api/admin/cockpit/pending-videos?date=YYYY-MM-DD&limit=10` | 异常视频 |
| GET | `/api/admin/cockpit/pending-submissions?date=YYYY-MM-DD` | 待催交 |
| GET | `/api/admin/cockpit/remind-logs?date=YYYY-MM-DD` | 催交历史 |
| GET | `/api/admin/dashboard-alerts` | AI 告警 |
| POST | `/api/admin/dashboard-alerts/{id}/execute` | 执行告警动作 |

### 7.2 成员管理相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/modules/team-management` | 团队管理数据 |
| GET | `/api/admin/modules/member-emails` | 成员邮箱 |
| POST | `/api/admin/member-ai-suggestion` | AI 成员建议 |
| POST | `/api/admin/execute-tool` | 执行工具 |

### 7.3 内容审核相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/content/list?view=pending&scope=company` | 内容列表 |
| GET | `/api/admin/content/feedback-cards?videoId=xxx` | 批改卡详情 |
| POST | `/api/admin/content/feedback-cards` | 创建批改卡 |
| PATCH | `/api/admin/content/feedback-cards/{id}` | 更新批改卡 |
| POST | `/api/admin/content/feedback-cards/{id}/send` | 下发批改卡 |

### 7.4 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/sidebar-badges` | 侧边栏 Badge |
| GET | `/api/admin/panels/analytics?preset=30d` | 经营分析数据 |
| GET | `/api/register-teams` | 团队列表（公开） |

---

## 八、Server Actions 清单

| 函数名 | 文件 | 说明 |
|--------|------|------|
| `createTeam` | `actions.ts` | 创建团队 |
| `deleteTeam` | `actions.ts` | 删除团队 |
| `updatePermissions` | `actions.ts` | 更新权限 |
| `changeRole` | `actions.ts` | 切换角色 |
| `resetMemberPassword` | `actions.ts` | 重置密码 |
| `updateMemberTeam` | `actions.ts` | 调配团队 |
| `removeMemberFromTeam` | `actions.ts` | 移出团队 |
| `reviewExemptionRequest` | `actions.ts` | 审批豁免 |
| `approveJoinRequestAction` | `join-request-actions.ts` | 批准入团 |
| `rejectJoinRequestAction` | `join-request-actions.ts` | 拒绝入团 |

---

## 九、设计规范

### 9.1 颜色系统

| 用途 | 颜色值 | 说明 |
|------|--------|------|
| 主色调 | `#D97757` | 橙红色，用于主要按钮、活跃状态 |
| 主色调 Hover | `#C96442` | 主色调悬停态 |
| 危险色 | `#C9604D` | 红色，用于删除、暴涨标记 |
| 警告色 | `#D99E55` | 橙色，用于中优告警、豁免标记 |
| 安全色 | `#6FAA7D` | 绿色，用于腰斩标记、成功状态 |
| 高优告警 | `#A05D5D` | 深红色 |
| 文本主色 | `text-zinc-800` | 主要文本 |
| 文本次色 | `text-zinc-500` | 次要文本 |
| 文本弱色 | `text-zinc-400` | 辅助文本 |
| 边框色 | `border-zinc-200` | 默认边框 |
| 背景色 | `bg-zinc-50` | 浅灰背景 |

### 9.2 字体规范

| 元素 | 字号 | 字重 |
|------|------|------|
| 页面标题 | `text-[18px]` | `font-medium` |
| 卡片标题 | `text-[14px]` | `font-medium` |
| 正文 | `text-[13px]` | 默认 |
| 辅助文本 | `text-[12px]` | 默认 |
| 标签文本 | `text-[11px]` | 默认 |
| 小标签 | `text-[10px]` | `font-medium` |

### 9.3 圆角规范

| 元素 | 圆角 |
|------|------|
| 卡片 | `rounded-2xl` |
| 按钮 | `rounded-lg` 或 `rounded-xl` |
| 输入框 | `rounded-xl` |
| 标签 | `rounded-md` 或 `rounded-lg` |

### 9.4 间距规范

| 场景 | 间距 |
|------|------|
| 卡片内边距 | `p-4` 或 `p-6` |
| 卡片间距 | `gap-3` 或 `gap-4` |
| 列表项间距 | `space-y-0.5` |
| 区块间距 | `space-y-6` |

---

## 十、数据流示意

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Supabase  │────▶│  Server     │────▶│  Client     │
│   Database  │     │  (SSR)      │     │  (React)    │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                    │
      │                    │                    │
      ▼                    ▼                    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ profiles    │     │ 权限验证     │     │ 首屏渲染     │
│ teams       │     │ 数据加载     │     │ 轮询更新     │
│ groups      │     │ 范围过滤     │     │ 交互处理     │
│ daily_reports│    └─────────────┘     └─────────────┘
│ videos      │
│ exemption_  │
│ request     │
│ team_join_  │
│ request     │
└─────────────┘
```

---

## 十一、关键业务规则

### 11.1 权限默认值

```typescript
// owner 永远全权限
// team_admin 默认值
const DEFAULT_ADMIN_PERMISSIONS = {
  view_all_data: true,
  edit_data: false,
  export_data: true,
  view_analytics: true,
  manage_members: false,
  manage_violations: false,
  view_conversion_hub: false,
  view_content_review: false,
  manage_video_assets: false,
  use_ai_copywriting: true,
  use_ai_management: true,
};

// member 默认值
const DEFAULT_MEMBER_PERMISSIONS = {
  use_ai_copywriting: false,
  use_ai_management: false,
};
```

### 11.2 数据访问范围

- `owner`：查看所有团队数据
- `team_admin`：查看本团队数据
- `group_leader`：查看本组数据
- `member`：仅查看自己的数据

### 11.3 豁免类型

```typescript
type ExemptionRequestType =
  | "yesterday"  // 昨日豁免
  | "range"      // 多日豁免
  | "permanent"  // 永久豁免
  | "single"     // 单日
  | "3days"      // 3天
  | "4days"      // 4天
  | "5days";     // 5天

type ExemptionCategory =
  | "waive"      // 免除
  | "leave";     // 请假
```

---

## 十二、页面路由与权限映射

| 路径 | 页面名 | 最低权限 | 说明 |
|------|--------|---------|------|
| `/admin` | 今日待办 | owner 或 team_admin | 管理员看板 |
| `/admin/modules` | 成员与权限 | owner 或 team_admin | 成员管理 |
| `/admin/content` | 批改台 | view_content_review | 内容审核 |
| `/admin/analytics` | 经营分析 | view_analytics | 数据报表 |
| `/admin/videos` | 素材库 | manage_video_assets | 视频资产 |

---

> 本文档基于 DYData 项目代码整理，供 Gemini 网站重建前端 UI 使用。
