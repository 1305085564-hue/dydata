import { Alert } from "@/components/ui/alert";
import { loadWriterCandidates } from "@/lib/writer-certifications";
import type { WriterCandidateRow } from "./writer-tab";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { resolveCollaborationScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTeamOptions } from "@/lib/teams";
import {
  buildCollaborationPageData,
  buildStaff,
  buildWorkGroupViews,
  getMonthRange,
  loadCollaborationMonthDataset,
} from "@/app/api/admin/collaboration/_shared";
import { CollaborationWorkbench } from "./collaboration-workbench";
import type {
  OperatorRow,
  StaffRow,
  SummaryData,
  TalentRow,
  WorkGroupViews,
  WorkGroupRow,
  WorkGroupRosterMember,
} from "./types";

interface CollaborationDataContainerProps {
  year: number;
  month: number;
  tab: "talents" | "operators" | "writers" | "editors";
  view?: "roles" | "teams";
  groupId?: string;
  isOwnerOrTeamAdmin: boolean;
  canManageVideos: boolean;
}

export async function CollaborationDataContainer({
  year,
  month,
  tab,
  view = "roles",
  groupId,
  isOwnerOrTeamAdmin,
  canManageVideos,
}: CollaborationDataContainerProps) {
  // 页面容器已完成同 key 的身份+范围确认（30s TTL 缓存命中）；
  // 这里复用同一上下文做防御性权限判定，不再重复 requireAdminActor 的串行身份查询。
  const context = await getCurrentPermissionContext("company", null);
  if (!context || !canAccessAdminPath("/admin/collaboration", context.permissionInfo.role, context.permissionInfo.permissions)) {
    return (
      <Alert variant="error">
        <span className="font-medium text-[#292524]">访问权限不足</span>
        <span className="text-[#78716C]">· 当前账号无权查看协作工作台</span>
      </Alert>
    );
  }

  const range = getMonthRange(year, month);
  if (!range) {
    return (
      <Alert variant="warning">
        <span className="font-medium text-[#292524]">日期范围无效</span>
        <span className="text-[#78716C]">· 所选月份超出系统支持的日期区间</span>
      </Alert>
    );
  }

  const supabase = createAdminClient();
  // 岗位管理模块的可见范围统一由 resolveCollaborationScope 唯一判定：
  // 组员放宽为本公司（无公司归属时降级只看自己），组长/所有者与全局范围一致。
  const resolution = await resolveCollaborationScope(supabase, context.scope);
  const restrictToSelf = resolution.restrictToSelf;

  const workGroupTeamIds = context.scope.kind === "all"
    ? (await getTeamOptions()).map((t) => t.id)
    : context.scope.teamId
      ? [context.scope.teamId]
      : [];

  const canManageWorkGroups =
    context.permissionInfo.permissions.manage_members === true &&
    Boolean(context.scope.teamId);

  // 共享月度数据集：统计起点~当月末日报一次查询 + 一次 lookups，各岗位在内存分发；
  // 任一环节失败时保持与旧 allSettled 相同的全空兜底，不伪装成数据为空成功。
  let summary: SummaryData | null = null;
  let operators: OperatorRow[] = [];
  let talents: TalentRow[] = [];
  let staff: StaffRow[] = [];
  let loadFailed = false;
  let writerCandidates: WriterCandidateRow[] = [];
  let writerCount: number | undefined;
  let editorCount: number | undefined;
  let workGroupViews: WorkGroupViews = { ready: false, groups: [], details: [] };
  let workGroupRawGroups: WorkGroupRow[] = [];
  let workGroupRoster: WorkGroupRosterMember[] = [];

  try {
    const dataset = await loadCollaborationMonthDataset({
      supabase,
      visibleUserIds: resolution.visibleUserIds,
      range,
      includeWriterCertifications: true,
      workGroupTeamIds,
    });
    const staffRole = tab === "writers" ? "writer" : tab === "editors" ? "editor" : null;
    const pageData = buildCollaborationPageData(
      dataset,
      staffRole,
      restrictToSelf ? context.scope.userId : undefined,
    );
    if (tab === "writers" && isOwnerOrTeamAdmin) {
      writerCandidates = await loadWriterCandidates({
        supabase,
        activeVisibleUserIds: context.scope.activeVisibleUserIds ?? [],
        actor: context.permissionInfo,
      });
    }
    summary = pageData.summary as SummaryData;
    operators = pageData.operators as OperatorRow[];
    talents = pageData.talents as TalentRow[];
    staff = pageData.staff as StaffRow[];

    const writerStaff = tab === "writers"
      ? staff
      : (buildStaff(dataset.currentRows, "writer", dataset.profiles, dataset.accounts, dataset.writerCertifications) as StaffRow[]);
    const editorStaff = tab === "editors"
      ? staff
      : (buildStaff(dataset.currentRows, "editor", dataset.profiles, dataset.accounts) as StaffRow[]);

    writerCount = (restrictToSelf && context.scope.userId)
      ? writerStaff.filter((r) => r.userId === context.scope.userId).length
      : writerStaff.length;
    editorCount = (restrictToSelf && context.scope.userId)
      ? editorStaff.filter((r) => r.userId === context.scope.userId).length
      : editorStaff.length;

    workGroupViews = buildWorkGroupViews(dataset);
    workGroupRawGroups = dataset.workGroups?.groups ?? [];
    workGroupRoster = dataset.workGroups?.roster ?? [];
  } catch {
    loadFailed = true;
  }

  return (
    <CollaborationWorkbench
      year={year}
      month={month}
      defaultTab={tab}
      defaultView={view}
      defaultGroupId={groupId}
      workGroupViews={workGroupViews}
      workGroupRawGroups={workGroupRawGroups}
      workGroupRoster={workGroupRoster}
      canManageWorkGroups={canManageWorkGroups}
      actorTeamId={context.scope.teamId}
      summary={summary}
      operators={operators}
      talents={talents}
      staff={staff}
      writerCount={writerCount}
      editorCount={editorCount}
      isOwnerOrTeamAdmin={isOwnerOrTeamAdmin}
      canManageVideos={canManageVideos}
      loadFailed={loadFailed}
      writerCandidates={writerCandidates}
    />
  );
}
