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
      <div className="flex items-center gap-2.5 rounded-lg border border-[#ECE7DE] bg-[#FAF8F4] p-3 text-[13px] text-[#78716C]">
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#C0685C]/10 text-[#C0685C]">
          <span className="size-1.5 rounded-full bg-[#C0685C]" />
        </span>
        <span className="font-medium text-[#292524]">访问权限不足</span>
        <span>· 当前账号无权查看协作工作台</span>
      </div>
    );
  }

  const range = getMonthRange(year, month);
  if (!range) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-[#ECE7DE] bg-[#FAF8F4] p-3 text-[13px] text-[#78716C]">
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#B98A54]/10 text-[#B98A54]">
          <span className="size-1.5 rounded-full bg-[#B98A54]" />
        </span>
        <span className="font-medium text-[#292524]">日期范围无效</span>
        <span>· 所选月份超出系统支持的日期区间</span>
      </div>
    );
  }

  const supabase = createAdminClient();
  const visibleUserIds = context.scope.visibleUserIds;

  // 共享月度数据集：统计起点~当月末日报一次查询 + 一次 lookups，各岗位在内存分发；
  // 任一环节失败时保持与旧 allSettled 相同的全空兜底，不伪装成数据为空成功。
  let summary: SummaryData | null = null;
  let operators: OperatorRow[] = [];
  let talents: TalentRow[] = [];
  let staff: StaffRow[] = [];
  let loadFailed = false;
  try {
    const dataset = await loadCollaborationMonthDataset({ supabase, visibleUserIds, range });
    const staffRole = tab === "writers" ? "writer" : tab === "editors" ? "editor" : null;
    const pageData = buildCollaborationPageData(
      dataset,
      staffRole,
      context.scope.kind === "self" ? context.scope.userId : undefined,
    );
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
