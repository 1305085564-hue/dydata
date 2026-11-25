import { Alert } from "@/components/ui/alert";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { resolveCollaborationScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonthRange } from "@/lib/collaboration/domain/report-rules";
import { readEvaluationStandards } from "@/lib/evaluation-standards-store";
import { loadCollaborationWorkbenchData } from "@/lib/collaboration/data/workbench-loader";
import type { CollaborationDataTab, CollaborationWorkbenchData } from "@/lib/collaboration/data/workbench-loader";
import { CollaborationWorkbench } from "./collaboration-workbench";
import type { TabKey } from "@/lib/collaboration/domain/workbench-state";

interface CollaborationDataContainerProps {
  year: number;
  month: number;
  tab: TabKey;
  view?: "roles" | "teams";
  groupId?: string;
  personId?: string;
  isOwnerOrTeamAdmin: boolean;
  canManageVideos: boolean;
}

function emptyData(input: {
  tab: CollaborationDataTab;
  month: number;
  standards: Awaited<ReturnType<typeof readEvaluationStandards>>;
}): CollaborationWorkbenchData {
  return {
    tab: input.tab,
    counts: { talents: 0, operators: 0, writers: 0, editors: 0, teams: 0 },
    summary: { total: 0, attributed: 0, unattributed: 0 },
    overviewStats: { month: input.month, total: 0, totalPlay: 0, goodExcellentRate: null },
    evaluationStandards: input.standards,
    talents: [], operators: [], writerStaff: [], editorStaff: [], writerCandidates: [],
    workGroupViews: input.tab === "teams" ? { ready: false, groups: [], details: [] } : undefined,
    workGroupRawGroups: [], workGroupRoster: [],
  };
}

export async function CollaborationDataContainer({
  year,
  month,
  tab,
  view = "roles",
  groupId,
  personId,
  isOwnerOrTeamAdmin,
  canManageVideos,
}: CollaborationDataContainerProps) {
  const context = await getCurrentPermissionContext("company", null);
  if (!context || !canAccessAdminPath("/admin/collaboration", context.permissionInfo.role, context.permissionInfo.permissions)) {
    return (
      <Alert variant="error">
        <span className="font-normal text-[#1F1E1D]">访问权限不足</span>
        <span className="text-[#78716C]">· 当前账号无权查看协作工作台</span>
      </Alert>
    );
  }

  const range = getMonthRange(year, month);
  if (!range) {
    return (
      <Alert variant="warning">
        <span className="font-normal text-[#1F1E1D]">日期范围无效</span>
        <span className="text-[#78716C]">· 所选月份超出系统支持的日期区间</span>
      </Alert>
    );
  }

  const supabase = createAdminClient();
  const resolution = await resolveCollaborationScope(supabase, context.scope);
  const restrictToSelf = resolution.restrictToSelf;
  const dataTab: CollaborationDataTab = view === "teams" ? "teams" : tab;
  const evaluationStandards = await readEvaluationStandards(context.scope.teamId);
  const scopeKey = JSON.stringify([
    context.scope.userId,
    context.scope.role,
    context.scope.companyRole,
    context.scope.kind,
    context.scope.teamId,
    resolution.visibleUserIds.slice().sort(),
    context.permissionInfo.permissions,
  ]);
  let initialData: CollaborationWorkbenchData;
  let loadFailed = false;
  try {
    initialData = await loadCollaborationWorkbenchData({
      supabase,
      range,
      tab: dataTab,
      visibleUserIds: resolution.visibleUserIds,
      activeVisibleUserIds: context.scope.activeVisibleUserIds,
      restrictToSelf,
      userId: context.scope.userId,
      teamId: context.scope.teamId,
      scopeKey,
      standards: evaluationStandards,
      canLoadWriterCandidates: isOwnerOrTeamAdmin,
      actor: { userId: context.scope.userId, companyRole: context.permissionInfo.companyRole },
      personId,
    });
  } catch {
    initialData = emptyData({ tab: dataTab, month, standards: evaluationStandards });
    loadFailed = true;
  }

  return (
    <CollaborationWorkbench
      year={year}
      month={month}
      defaultTab={tab}
      defaultView={view}
      defaultGroupId={groupId}
      defaultPersonId={personId}
      initialData={initialData}
      isOwnerOrTeamAdmin={isOwnerOrTeamAdmin}
      canManageVideos={canManageVideos}
      currentUserId={context.scope.userId}
      restrictToSelf={restrictToSelf}
      canManageWorkGroups={context.permissionInfo.permissions.manage_members === true && Boolean(context.scope.teamId)}
      actorTeamId={context.scope.teamId}
      scopeKey={scopeKey}
      loadFailed={loadFailed}
    />
  );
}
