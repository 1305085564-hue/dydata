import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMonthRange,
  loadOperatorsData,
  loadSummaryData,
  loadTalentsData,
} from "@/app/api/admin/collaboration/_shared";
import { CollaborationWorkbench } from "./collaboration-workbench";
import type { OperatorRow, SummaryData, TalentRow } from "./types";

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
  const actorResult = await requireAdminActor({
    requiredPermission: "view_analytics",
  });
  if ("error" in actorResult) {
    return (
      <div className="rounded-xl border border-[#E5E0D6] bg-[#F5F3EE] px-4 py-3 text-[13px] text-[#DC2626]">
        无权访问：{actorResult.error}
      </div>
    );
  }

  const context = await buildPermissionContextForActor(actorResult.actor);
  if (!context) {
    return (
      <div className="rounded-xl border border-[#E5E0D6] bg-[#F5F3EE] px-4 py-3 text-[13px] text-[#DC2626]">
        用户权限范围加载失败
      </div>
    );
  }

  const range = getMonthRange(year, month);
  if (!range) {
    return (
      <div className="rounded-xl border border-[#E5E0D6] bg-[#F5F3EE] px-4 py-3 text-[13px] text-[#DC2626]">
        日期范围无效
      </div>
    );
  }

  const supabase = createAdminClient();
  const visibleUserIds = context.scope.visibleUserIds;

  const [summaryResult, operatorsResult, talentsResult] =
    await Promise.allSettled([
      loadSummaryData({ supabase, visibleUserIds, range }),
      loadOperatorsData({ supabase, visibleUserIds, range }),
      loadTalentsData({ supabase, visibleUserIds, range }),
    ]);

  const summary: SummaryData | null =
    summaryResult.status === "fulfilled"
      ? (summaryResult.value as SummaryData)
      : null;
  const operators: OperatorRow[] =
    operatorsResult.status === "fulfilled"
      ? (operatorsResult.value as OperatorRow[])
      : [];
  const talents: TalentRow[] =
    talentsResult.status === "fulfilled"
      ? (talentsResult.value as TalentRow[])
      : [];

  return (
    <CollaborationWorkbench
      year={year}
      month={month}
      defaultTab={tab}
      summary={summary}
      operators={operators}
      talents={talents}
      isOwnerOrTeamAdmin={isOwnerOrTeamAdmin}
    />
  );
}
