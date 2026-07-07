# 产量对账系统 — 前端实现

## 重要说明

**后端接口已就绪，旧前端已删除，请从零重写前端界面。**

已删除的旧前端文件：
- `/video-review/submit/submit-container.tsx` — 已删除
- `/video-review/manage/review-queue-data-container.tsx` — 已删除

这两个页面的 `page.tsx` 已改为空壳，你需要重新实现完整的前端组件和交互逻辑。

---

## 背景

DYData 是一个抖音数据管理平台，30人短视频团队。团队成员每天要发布一定数量的作品（本周4个/天，下周起6个/天）。管理层需要一个看板，5分钟内完成全盘对账：谁交了、谁没交、谁请了假。

现有 /video-review 模块有基础的文案+截图提交和审核流。现在要扩建为完整的产量对账系统。

---

## 你要交付的 6 个目标

### 目标 1：管理产量看板（/video-review）

**适用角色：** 管理员（admin/owner/team_admin/group_leader）
**member 角色访问此页面直接重定向到 /video-review/submit**

管理员打开这个页面，要能一眼看出今天全队每个人的完成情况。

**核心信息层级：**
1. **全局概览** — 今天目标多少、全队完成率、有多少人亮红灯
2. **按小组展开** — 每个组的完成情况
3. **按个人看** — 每个人提交了几个、差几个、有没有请假/豁免
4. **红灯警告** — 没交够+没请假的人必须视觉上最醒目，管理扫一眼就能找到

**交互功能：**
- 点击某人 → 看到他当天提交的截图缩略图
- 点击截图 → 弹窗放大预览

**数据接口：**
```typescript
// RPC 调用
const { data } = await supabase.rpc('get_production_dashboard', {
  p_date: '2026-07-07',  // YYYY-MM-DD
  p_team_id: null,        // 可选，筛选团队
  p_group_id: null        // 可选，筛选小组
});

// 返回字段
interface DashboardRecord {
  user_id: string;
  user_name: string;
  team_id: string;
  team_name: string;
  group_id: string;
  group_name: string;
  daily_target: number;        // 当天目标数
  submitted_count: number;     // 已提交数
  gap: number;                 // 差额（负数表示超额）
  exemption_status: 'none' | 'pending' | 'approved' | 'rejected';
  alert_level: 'green' | 'yellow' | 'red';  // 绿=达标，黄=豁免待审，红=未达标无豁免
}
```

---

### 目标 2：组员每日提交（/video-review/submit）

**适用角色：** 所有用户

组员每天来这里提交作品凭证，证明自己发了片。

**必须有：**
1. 清晰显示"今天要交几个、已交几个、还差几个"
2. 上传截图（支持多张）+ 填写文案内容
3. 提交后计数自动刷新
4. 已提交的记录以缩略图网格展示，可预览、可删除（当天的）
5. 没交够时有明显入口引导去申请豁免

**数据接口：**

```typescript
// 1. 上传截图（单张）
const formData = new FormData();
formData.append('file', file);
const res = await fetch('/api/work-screenshots/upload', {
  method: 'POST',
  body: formData
});
const { path } = await res.json();  // 返回 Supabase Storage 的存储路径（不能直接访问）

// 2. 提交作品
await fetch('/api/work-submissions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content_text: '文案内容',
    screenshot_urls: [path1, path2, path3],  // 上传接口返回的 path 数组
    note: '备注（可选）'
  })
});

// 3. 查询当天已提交记录
const res = await fetch('/api/work-submissions?date=2026-07-07');
const { data } = await res.json();
// 返回：
interface WorkSubmission {
  id: string;
  content_text: string;
  screenshot_urls: string[];       // 原始存储路径（不能直接访问）
  screenshot_items: Array<{        // 带签名的临时预览地址（有效期 10 分钟）
    path: string;
    signed_url: string;            // 直接用于 <img src={signed_url} />
  }>;
  note: string | null;
  created_at: string;
}

// 4. 删除某条提交（只能删当天的）
await fetch(`/api/work-submissions/${id}`, {
  method: 'DELETE'
});
```

**注意：**
- 截图存储在 Supabase Storage bucket "work-screenshots"，是私有桶
- 上传接口返回的是 `path`（存储路径），不能直接访问
- 查询接口返回两套字段：
  - `screenshot_urls`：原始存储路径（提交时用的）
  - `screenshot_items`：带签名的临时预览地址（显示缩略图用的）
- 签名有效期是 **10 分钟**，不是 60 分钟
- 前端展示截图时使用 `submission.screenshot_items[i].signed_url`

---

### 目标 3：豁免申请（/video-review/exemption）

**适用角色：** 所有用户

组员预知今天发不够，主动申请豁免。

**必须有：**
1. 表单：豁免类型（今天少发/请假1天/请假多天）、原因（必填）、日期
2. 提交后 toast 提示等待审批
3. 下方显示自己的申请历史和状态

**数据接口：**

```typescript
// 1. 提交豁免申请
await fetch('/api/exemptions/apply', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    exemption_type: 'single' | '3days' | '4days' | '5days' | 'yesterday' | 'range' | 'permanent',
    reason: '原因说明',
    target_date: '2026-07-07',      // single/yesterday 类型的目标日期
    start_date: '2026-07-07',       // range 类型的开始日期
    end_date: '2026-07-10',         // range 类型的结束日期
  })
});

// exemption_type 说明：
// - 'single': 请假1天
// - '3days': 请假3天
// - '4days': 请假4天
// - '5days': 请假5天
// - 'yesterday': 补昨日请假
// - 'range': 自定义日期范围
// - 'permanent': 永久豁免

// 2. 查询自己的豁免申请历史
const res = await fetch('/api/exemptions');
const { data } = await res.json();
// 返回：
interface ExemptionRequest {
  id: string;
  exemption_type: 'single' | '3days' | '4days' | '5days' | 'yesterday' | 'range' | 'permanent';
  reason: string;
  target_date: string | null;
  start_date: string | null;
  end_date: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
  reviewer_note: string | null;
}
```

---

### 目标 4：管理审批（/video-review/approvals）

**适用角色：** 管理员（admin/owner/team_admin/group_leader）

管理统一处理所有豁免申请。

**必须有：**
1. 待审数量 + 列表
2. 每条可一键通过或驳回
3. 支持批量通过
4. 已处理的折叠在下方

**数据接口：**

```typescript
// 1. 获取待审列表
const res = await fetch('/api/exemptions/pending');
const { data, count } = await res.json();
// 返回格式同上面的 ExemptionRequest[]

// 2. 获取已处理列表
const res = await fetch('/api/exemptions/processed?limit=20');
const { data } = await res.json();
// 返回格式同上面的 ExemptionRequest[]

// 3. 审批（通过或驳回）— 仅支持单个审批
await fetch('/api/exemptions/review', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    request_id: 'uuid',              // 单个请求 ID
    action: 'approved' | 'rejected', // 注意是 'approved' 不是 'approve'
    reviewer_note: '审批备注（可选）'
  })
});

// 批量审批：前端用 Promise.all 串行调用多次
const reviewResults = await Promise.all(
  selectedIds.map(id => 
    fetch('/api/exemptions/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: id,
        action: 'approved',
        reviewer_note: '批量通过'
      })
    })
  )
);
```

---

### 目标 5：目标配置（/admin/settings 内新增区块）

**适用角色：** owner 可编辑，admin 可查看

**必须有：**
1. 当前生效的目标数清晰展示
2. 可添加新规则（生效日期 + 目标数）
3. 历史规则可查看

**数据接口：**

```typescript
// 1. 获取配置列表
const res = await fetch('/api/daily-quota-config');
const { current, history } = await res.json();
// current: { effective_date: '2026-07-01', daily_target: 4 }
// history: Array<{ effective_date: string, daily_target: number }>

// 2. 添加新规则（仅 owner）
await fetch('/api/daily-quota-config', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    effective_date: '2026-07-15',  // 生效日期
    daily_target: 6                // 新目标数
  })
});
```

**注意：**
- 这个功能是在现有的 `/admin/settings` 页面内新增一个区块，不是独立页面
- 需要读取 `/admin/settings/page.tsx`，在合适位置插入这个配置区块

---

### 目标 6：导航更新

更新 `/video-review` 的子导航（如果有顶部或侧边导航栏）：

1. **产量看板** — `/video-review`（管理可见）
2. **提交作品** — `/video-review/submit`（所有人可见）
3. **申请豁免** — `/video-review/exemption`（所有人可见）
4. **审批中心** — `/video-review/approvals`（仅管理可见）
5. **已发案例** — `/video-review/archive`（所有人可见，原主页面的列表挪到这里）

**注意：**
- 原有的 `/video-review/manage`（内容审核台）保留不动，它和产量对账是两码事
- 导航更新只是建议，如果现有导航结构不适合加子导航，可以用其他方式（如页面内 Tab 切换）实现

---

## 技术约束

1. **权限判断：** 使用 `getUserPermissions()` + `hasPermission()`
   - businessRole 区分：owner / team_admin / group_leader / member
   - 管理权限判断示例：
     ```typescript
     const permInfo = await getUserPermissions();
     const isAdmin = ['owner', 'team_admin', 'group_leader'].includes(permInfo.businessRole);
     ```

2. **样式规范：** 严格遵守 `docs/美学规范.md`
   - CTA 按钮强调色：`#D97757`
   - 间距、圆角、字体、颜色都按美学规范执行

3. **组件库：** 使用项目现有的 shadcn/ui 组件
   - 截图预览弹窗用 `Dialog` + `<img />` 即可，不需要复杂的图片查看器
   - Toast 提示用项目封装的 `useToast()`

4. **截图处理：**
   - 上传时调用 `/api/work-screenshots/upload` 获取 `path`（存储路径）
   - 提交作品时把这些 `path` 放进 `screenshot_urls` 数组
   - 查询已提交记录时，使用返回的 `screenshot_items[].signed_url` 来展示缩略图（签名有效期 10 分钟）
   - 不需要手动调用 Supabase Storage 的 `createSignedUrl`

5. **状态管理：** 简单场景用 React 自带的 useState/useReducer，复杂场景自己决定

6. **布局细节：** 组件拆分、状态管理、布局细节你自己决定，只要目标达成、设计符合美学规范即可

---

## 备注

1. **现有页面保留：**
   - `/video-review/page.tsx` 有 `ApprovedListDataContainer`（已审核案例列表），把它挪到 `/video-review/archive/page.tsx` 保留原有功能
   - `/video-review/manage/page.tsx` 是审核台，保留不动（它处理的是内容审核，和产量对账是两码事）

2. **接口 Mock：** 后端接口由 Codex 实现，你假设接口已就绪来写前端代码。如果接口不通或返回格式不对，先用 mock 数据占位，在代码中标注 `// TODO: 接口联调`

3. **组件复用：** 如果现有组件能复用就复用（比如 Breadcrumb、AdminWorkspaceLayout），但不强制

4. **响应式：** 页面要支持桌面端和移动端，按美学规范做响应式适配

---

## 交付清单

完成后，确保以下功能可用：

- [ ] 管理打开 `/video-review` 看到产量看板，member 自动重定向到 `/video-review/submit`
- [ ] 产量看板正确显示每人红/黄/绿状态
- [ ] 组员提交文案+截图 → work_submissions 有记录 → 提交计数+1
- [ ] 组员能看到自己当天的提交历史，能删除当天的提交
- [ ] 组员申请豁免 → 提交成功 → 下方显示申请历史
- [ ] 管理打开审批中心 → 看到待审列表 → 一键通过/驳回 → 已处理折叠在下方
- [ ] 管理点击某人 → 看到截图缩略图 → 点击放大预览
- [ ] owner 在 `/admin/settings` 修改目标配置 → 看板实时反映
- [ ] 未达标+无豁免 → 红灯；有 pending 豁免 → 黄灯；达标或豁免通过 → 绿灯

---

## 开始实现吧！

后端已就绪，旧前端已删除，现在是你的舞台。按照 6 个目标逐个实现，记得遵守美学规范，做出干净、好用、好看的界面。
