import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildCollaborationPageData,
  getMonthRange,
  loadCollaborationMonthDataset,
} from "@/app/api/admin/collaboration/_shared";
import { CollaborationWorkbench } from "./collaboration-workbench";
import type { OperatorRow, StaffRow, SummaryData, TalentRow } from "./types";

interface CollaborationDataContainerProps {
  year: number;
  month: number;
  tab: "talents" | "operators" | "writers" | "editors";
  isOwnerOrTeamAdmin: boolean;
}

export async function CollaborationDataContainer({
  year,
  month,
  tab,
  isOwnerOrTeamAdmin,
}: CollaborationDataContainerProps) {
  // 页面容器已完成同 key 的身份+范围确认（30s TTL 缓存命中）；
  // 这里复用同一上下文做防御性权限判定，不再重复 requireAdminActor 的串行身份查询。
  const context = await getCurrentPermissionContext("company", null);
  if (!context || !canAccessAdminPath("/admin/collaboration", context.permissionInfo.role, context.permissionInfo.permissions)) {
    return (
      <div className="rounded-xl border border-[#E5E0D6] bg-[#F5F3EE] px-4 py-3 text-[13px] text-[#C0685C]">
        无权访问
      </div>
    );
  }

  const range = getMonthRange(year, month);
  if (!range) {
    return (
      <div className="rounded-xl border border-[#E5E0D6] bg-[#F5F3EE] px-4 py-3 text-[13px] text-[#C0685C]">
        日期范围无效
      </div>
    );
  }

  const supabase = createAdminClient();
  const visibleUserIds = context.scope.visibleUserIds;

  // 共享月度数据集：当月/上月日报一次查询 + 一次 lookups，各岗位在内存分发；
  // 任一环节失败时保持与旧 allSettled 相同的全空兜底，不伪装成数据为空成功。
  let summary: SummaryData | null = null;
  let operators: OperatorRow[] = [];
  let talents: TalentRow[] = [];
  let staff: StaffRow[] = [];
  let loadFailed = false;
  try {
    const dataset = await loadCollaborationMonthDataset({ supabase, visibleUserIds, range });
    const staffRole = tab === "writers" ? "writer" : tab === "editors" ? "editor" : null;
    const pageData = buildCollaborationPageData(dataset, staffRole);
    summary = pageData.summary as SummaryData;
    operators = pageData.operators as OperatorRow[];
    talents = pageData.talents as TalentRow[];
    staff = pageData.staff as StaffRow[];
  } catch {
    loadFailed = true;
  }

  return (
    <CollaborationWorkbench
      year={year}
      month={month}
      defaultTab={tab}
      summary={summary}
      operators={operators}
      talents={talents}
      staff={staff}
      isOwnerOrTeamAdmin={isOwnerOrTeamAdmin}
      loadFailed={loadFailed}
    />
  );
}
