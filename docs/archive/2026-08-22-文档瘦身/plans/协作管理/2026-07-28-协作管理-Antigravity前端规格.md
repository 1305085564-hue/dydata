# 协作管理 · Antigravity 前端施工规格

> 对应后端接口：`docs/plans/2026-07-28-协作管理-接口约定.md`
> 施工范围：**纯前端**。建新页面 `/admin/collaboration`，并在 `/admin/content`（视频复盘）每条视频上加归属补录入口。
> 接入真实数据是本次核心目标——不允许留 mock / placeholder 数据，所有数字必须来自接口返回值。

---

## 零、读前必看

### 项目惯例（不可绕过）

1. **这是全新页面，没有任何现有前端代码可参考，从零写**
2. 页面结构：Server Component `page.tsx` → Server Component 数据容器 → `"use client"` 工作台
3. 样式用 Tailwind，已有设计令牌遵守 `docs/美学规范.md`
4. UI 原语从 `@/components/ui/` 取（`tabs.tsx` / `badge.tsx` / `sheet.tsx` / `skeleton.tsx` / `empty-state.tsx` / `button.tsx` / `select.tsx`），不引入新组件库
5. 数字格式：
   - 播放量 ≥ 1亿 → `X.X亿`；≥ 1万 → `X.X万`；否则 `toLocaleString("zh-CN")`
   - 环比：**涨用红色 `text-[#DC2626]`，跌用绿色 `#16A34A]`**（A股惯例，不要搞反）
   - null / 上月无数据 → 显示 `—`，不显示 0 也不显示 NaN
6. 动画用 `framer-motion`（项目已装），动效参考 `src/lib/animations.ts` 的 `containerVariants`
7. 图标用 `lucide-react`，本次新增：`Users`（导航图标）、`ChevronDown`（展开行）、`Pencil`（补录按钮）、`TrendingUp` / `TrendingDown`（环比）、`AlertCircle`（健康度告警）
8. **Codex 已完成**：5 个后端接口、路径权限（`analytics-access.ts`）。**Codex 未完成**：导航注册，由本次前端完成（见 1.1）

### 关键边界

- `report_date < '2026-07-27'` 的记录后端已过滤，前端不需要处理历史期
- 播放参考列（文案/剪辑 Tab）**禁止按播放排序**，列头不加排序箭头，这是产品决策
- 归属补录（接口 E）**只有 owner / team_admin 才能看到**，其他角色不展示按钮
- 个人卡同时供管理员（任何人）和员工（只能看自己）使用——本次只做管理员入口，员工复用留二期

---

## 一、导航注册

### `src/components/admin-secondary-nav.tsx`

在文件顶部 import 里加 `Users`：

```ts
import { BarChart3, CalendarCheck, FileText, FolderOpen, Gauge, Users } from "lucide-react";
```

在 `AdminPanelKey` 联合类型加 `"collaboration"`。

在 `ADMIN_SECONDARY_NAV_ITEMS` 数组中，**紧跟 `analytics` 条目之后**插入：

```ts
{
  href: "/admin/collaboration",
  panel: "collaboration",
  label: "协作管理",
  description: "按岗位查看团队成员产量与运营带人情况。",
  icon: Users,
  tone: "neutral",
  group: "daily",
  match: (pathname) =>
    pathname === "/admin/collaboration" ||
    pathname.startsWith("/admin/collaboration/"),
  requiresAdmin: true,
},
```

---

## 二、文件结构

```
src/app/(app)/admin/collaboration/
  page.tsx                         ← Server Component，权限 + searchParams 解析
  loading.tsx                      ← Suspense fallback
  collaboration-data-container.tsx ← Server Component，预取 A+B 两个接口
  collaboration-workbench.tsx      ← "use client"，月份切换 + Tab 切换 + 整体状态
  health-bar.tsx                   ← "use client"，归属健康度窄条
  operator-tab.tsx                 ← "use client"，运营 Tab（含展开子行）
  staff-tab.tsx                    ← "use client"，文案/剪辑 Tab 共用
  personal-card.tsx                ← "use client"，个人卡 Sheet 弹层
```

---

## 三、`page.tsx`（Server Component）

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { CollaborationDataContainer } from "./collaboration-data-container";
import CollaborationLoading from "./loading";

export const metadata: Metadata = {
  title: "协作管理",
  description: "按岗位查看团队成员产量与运营带人情况。",
};

interface CollaborationPageProps {
  searchParams: Promise<{ year?: string; month?: string; tab?: string }>;
}

function resolveYearMonth(year: string | undefined, month: string | undefined) {
  const now = new Date();
  const y = Number(year);
  const m = Number(month);
  return {
    year: Number.isFinite(y) && y > 2000 ? y : now.getFullYear(),
    month: Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1,
  };
}

export default async function CollaborationPage({ searchParams }: CollaborationPageProps) {
  const params = await searchParams;
  const context = await getCurrentPermissionContext("company", null);
  if (!context) redirect("/login");

  const { permissionInfo } = context;
  if (!canAccessAdminPath("/admin/collaboration", permissionInfo.businessRole, permissionInfo.permissions)) {
    redirect("/dashboard");
  }

  const { year, month } = resolveYearMonth(params.year, params.month);
  const tab = ["operators", "writers", "editors"].includes(params.tab ?? "")
    ? (params.tab as "operators" | "writers" | "editors")
    : "operators";

  return (
    <AdminWorkspaceLayout indexItems={[]} width="wide">
      <div className="space-y-4">
        <div>
          <p className="text-[12px] tracking-[0.12em] text-zinc-500">协作管理</p>
          <h1 className="mt-1 text-[24px] font-medium tracking-tight text-zinc-900">协作管理</h1>
        </div>
        <Suspense
          key={`${year}-${month}-${tab}`}
          fallback={<CollaborationLoading />}
        >
          <CollaborationDataContainer
            year={year}
            month={month}
            tab={tab}
            isOwnerOrTeamAdmin={
              permissionInfo.businessRole === "owner" ||
              permissionInfo.businessRole === "team_admin"
            }
          />
        </Suspense>
      </div>
    </AdminWorkspaceLayout>
  );
}
```

---

## 四、`loading.tsx`

骨架屏：顶部月份条一行 Skeleton，下方三个 Tab 按钮 Skeleton，内容区 `TableSkeleton rows={6}`。

---

## 五、`collaboration-data-container.tsx`（Server Component）

并行预取 API A（健康度）和 API B（运营列表），失败时降级显示错误条而不崩溃。

```tsx
import { requireAdminActor } from "@/app/api/admin/auth-helper";
// 直接调用 handler 函数，不走 HTTP，复用 Codex 写的 handler
import { getSummary } from "@/app/api/admin/collaboration/handlers";
import { getOperators } from "@/app/api/admin/collaboration/handlers";
import { CollaborationWorkbench } from "./collaboration-workbench";

export async function CollaborationDataContainer({
  year, month, tab, isOwnerOrTeamAdmin,
}: {
  year: number; month: number;
  tab: "operators" | "writers" | "editors";
  isOwnerOrTeamAdmin: boolean;
}) {
  const actorResult = await requireAdminActor({ requiredPermission: "view_analytics" });
  if ("error" in actorResult) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-600">
        无权访问：{actorResult.error}
      </div>
    );
  }

  const [summaryResult, operatorsResult] = await Promise.allSettled([
    getSummary({ year, month, actor: actorResult.actor }),
    getOperators({ year, month, actor: actorResult.actor }),
  ]);

  const summary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
  const operators = operatorsResult.status === "fulfilled" ? operatorsResult.value : [];

  return (
    <CollaborationWorkbench
      year={year}
      month={month}
      defaultTab={tab}
      summary={summary}
      operators={operators}
      isOwnerOrTeamAdmin={isOwnerOrTeamAdmin}
    />
  );
}
```

> ⚠️ **如果 Codex 没有暴露 handler 函数**（只有 route.ts），改成在 data-container 里直接调用 `fetch()`，带 `{ cache: "no-store" }` 和 `Authorization` header。两种方式任选其一，以实际 Codex 代码结构为准。

---

## 六、`collaboration-workbench.tsx`（Client Component）

**状态**：
- `tab: "operators" | "writers" | "editors"` → 初始来自 prop，切换时 `router.push` 更新 URL
- `selectedPersonId: string | null` → 打开个人卡
- `staffData: StaffRow[] | null` → 文案/剪辑 Tab 数据（懒加载）
- `staffLoading: boolean`

**月份切换**：顶部放一个 `<select>` 或自定义月份选择器，选择后 `router.push(`?year=${y}&month=${m}&tab=${tab}`)` 刷新页面（走 Suspense 重新加载）。显示最近 12 个月可选，不允许选早于 2026-07-27 所在月（即最早可选 2026-07）。

**Tab 切换**：点击 文案/剪辑 Tab 时，如果 `staffData` 为 null，立即发起 fetch 请求 `/api/admin/collaboration/staff?year=&month=&role=writer|editor`，把结果存到 state。

**整体布局**：

```
[月份选择器]                        [当前月份标题，如 "2026 年 7 月"]

[健康度条 HealthBar]

[Tab: 运营 | 文案 | 剪辑]
[Tab 内容区]
```

---

## 七、`health-bar.tsx`（归属健康度）

接收 `summary` prop（类型见接口约定 A）。

**两种形态**：

**正常态**（`summary.unattributed === 0 && summary.neverFillMembers.length === 0`）：
```
一行灰色小字：本月 {total} 条 · 已归属 {attributed} 条 · 自包办 {selfHandled} 条
```

**告警态**（否则）：

```
[!] 归属健康度提醒
[琥珀色展开卡片]
  本月 {total} 条记录中，{unattributed} 条未完整归属。
  从不填分工的成员：小李、小王...（超出 3 人折叠）
```

颜色系：背景 `bg-amber-50`，边框 `border-amber-200`，图标 `text-amber-600`，文字 `text-amber-800`。

---

## 八、`operator-tab.tsx`（运营 Tab）

接收 `operators` prop（接口 B 返回数组）。

### 表格列

| 列 | 对齐 | 可排序 | 说明 |
|---|---|---|---|
| 运营姓名 | 左 | 否 | |
| 带达人数 | 右 | 否 | `operatedProfileCount`，加 info tooltip：「按本月经手作品反推，非固定配置」 |
| 本月条数 | 右 | **默认排序↓** | `reportCount` |
| 总播放 | 右 | 可 | `formatBigNumber(totalPlay)` |
| 人均播放 | 右 | 可 | `formatBigNumber(avgPlay)` |
| 导粉 | 右 | 可 | `totalFollowerConvert.toLocaleString("zh-CN")` |
| 爆款数 | 右 | 否 | `hitCount` |
| 环比 | 右 | 否 | 见下方 |

**环比显示**：`momChange` 为 null → `—`；> 0 → `↑ XX%`（红色 `#DC2626`）；< 0 → `↓ XX%`（绿色 `#16A34A`）；= 0 → `→ 0%`（灰色）。

**行展开**：每行最左侧有一个 `ChevronDown` 图标，点击展开该运营名下达人子列表（内联展开，不弹层）。

**子列表列**：达人姓名（`ownerName`）、账号名（`accountName`）、条数、总播放、导粉。

**点击姓名**：打开个人卡（`setSelectedPersonId(row.userId)`）。

**空态**：本月无运营记录 → `EmptyState` 提示「本月暂无运营归属记录，2026-07-27 起开始统计」。

---

## 九、`staff-tab.tsx`（文案/剪辑 Tab 共用）

接收 `rows: StaffRow[]`（接口 C 返回数组）和 `role: "writer" | "editor"`。

### 表格列

| 列 | 对齐 | 可排序 | 说明 |
|---|---|---|---|
| 姓名 | 左 | 否 | |
| 本月篇数 | 右 | **默认排序↓** | `reportCount` |
| 给谁做的 | 左 | 否 | `involvedAccounts`（见下） |
| 总播放 | 右 | ❌ 不可排序 | 列头标注小灰字「参考」，**无排序箭头** |
| 人均播放 | 右 | ❌ 不可排序 | 同上 |
| 自包办条数 | 右 | 否 | `selfHandledCount`，灰色显示 |

**「给谁做的」列**：最多显示 3 个账号名（逗号分隔），`involvedAccountTotal > 3` 时末尾追加灰色小字「等 N 个账号」。

**点击姓名**：打开个人卡。

**空态**：同运营 Tab，说明词改为「本月暂无文案/剪辑归属记录」。

**加载中**：`staffLoading` 为 true 时，内容区显示 `TableSkeleton rows={4}`。

---

## 十、`personal-card.tsx`（个人卡 Sheet）

用 `@/components/ui/sheet.tsx` 实现从右侧滑入。宽度 `max-w-xl`（约 560px）。

打开时立即发起 `fetch(/api/admin/collaboration/person?userId=&year=&month=)`，loading 期间 Sheet 内显示骨架屏。

### 内容布局（从上到下）

**头部**
```
[大号姓名]  [小组 Badge（若有）]
本月三岗位：文案 N 篇 · 剪辑 N 条 · 运营 N 条
```

**运营汇总区**（`operatorSummary !== null` 时展示）

```
[4 个小 KPI 卡片：总播放 / 人均播放 / 导粉 / 爆款数]
带了 N 个达人（反推）  环比 ↑XX% [红/绿]
```

**近 6 个月产量趋势**（柱状图，只显示 editorCount/writerCount/operatorCount 叠加，用 3 个颜色区分岗位）

使用 `recharts`（项目已装），X 轴是月份，Y 轴是条数。不显示流量/播放——这是产量图，不是流量图。

**明细列表**（`records` 数组，按 report_date 倒序）

| 列 | 说明 |
|---|---|
| 日期 | `report_date` |
| 账号 | `accountName` |
| 标题 | `title`，超长截断 |
| 播放 | `formatBigNumber(playCount)` |
| 岗位 | `roles` 数组 → 每个岗位一个小 Badge（文案/剪辑/运营，不同色） |
| 状态 | `anomaly`，`null` → 灰色「—」；`正常` → 不显示；其他值 → 橙色 Badge |

列表行高 44px，超过 10 条出现内部滚动（`max-h-96 overflow-y-auto`）。

---

## 十一、归属补录入口（在视频复盘页）

> 修改文件：`src/app/(app)/admin/content/content-list.tsx`（或视频行所在的子组件，**先读文件确认位置**）

**只有 `isOwnerOrTeamAdmin` 为 true 时才渲染**。

在每一条视频行（`report_date >= '2026-07-27'` 的行，旧记录不显示）的操作区加一个极小的 `Pencil` 图标按钮：

```
[原有操作] ... [Pencil icon button, tooltip="修改归属"]
```

点击后弹出一个小型 `Dialog`（`@/components/ui/dialog.tsx`）：

```
标题：修改岗位归属
正文：
  文案：[下拉选人，含「自包办」选项]
  剪辑：[同上]
  运营：[同上]
  [确认] [取消]
```

下拉人员候选列表来源：调用 `/api/dashboard/operator-members`（已有接口，返回当前团队成员列表）。

确认时调用 `PATCH /api/admin/collaboration/attribution`，成功后显示 `feedbackToast.success("归属已更新")`；若 `videoUpdated: false` 则追加提示「视频侧未找到对应记录，仅更新了日报」；失败时 `feedbackToast.error`。

**重要**：这个 Dialog 的状态必须隔离到单独的子组件里，不要污染 content-list 的主状态。

---

## 十二、类型定义

在 `src/app/(app)/admin/collaboration/` 目录下新建 `types.ts`，把接口 A/B/C/D 的返回类型写成 TypeScript interface，供各组件 import。不要在每个组件里重复定义。

---

## 十三、不要做的事

- ❌ 不写任何 mock 数据 / hardcode 数字，所有数据来自接口
- ❌ 播放列不加排序箭头（文案/剪辑 Tab）
- ❌ 不改 `/api/video-submit` 或任何 Codex 写的后端文件
- ❌ 不引入新的组件库或图表库（recharts 项目已装，直接用）
- ❌ 不在任何地方显示「历史数据补录」入口（批量补录场景不存在）
- ❌ 环比涨跌颜色不要搞反——涨=红，跌=绿
- ❌ 个人卡内的近 6 个月趋势图只显示产量（条数），不显示播放流量
