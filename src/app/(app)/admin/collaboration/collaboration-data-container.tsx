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
  //
  // 首屏一次备齐全部页签数据（summary/运营/达人 + 文案、剪辑两份名单 + 小队视图），
  // 让「岗位↔小组、切页签、进组」在客户端就地命中、不再触发服务器重取整页；
  // view/tab/groupId 因此不再左右服务器取数，只用于决定默认打开哪一块。
  let summary: SummaryData | null = null;
  let operators: OperatorRow[] = [];
  let talents: TalentRow[] = [];
  let writerStaff: StaffRow[] = [];
  let editorStaff: StaffRow[] = [];
  let loadFailed = false;
  let writerCandidates: WriterCandidateRow[] = [];
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
    const restrictUserId = restrictToSelf ? context.scope.userId : undefined;
    const pageData = buildCollaborationPageData(dataset, null, restrictUserId);
    summary = pageData.summary as SummaryData;
    operators = pageData.operators as OperatorRow[];
    talents = pageData.talents as TalentRow[];

    // 文案/剪辑两份名单一次备齐；组员放宽或只看自己时，与运营/达人同口径按 restrictUserId 收窄，防止越权外泄。
    const writerList = buildStaff(
      dataset.currentRows,
      "writer",
      dataset.profiles,
      dataset.accounts,
      dataset.writerCertifications,
    ) as StaffRow[];
    const editorList = buildStaff(dataset.currentRows, "editor", dataset.profiles, dataset.accounts) as StaffRow[];
    writerStaff = restrictUserId ? writerList.filter((r) => r.userId === restrictUserId) : writerList;
    editorStaff = restrictUserId ? editorList.filter((r) => r.userId === restrictUserId) : editorList;

    // 认证候选只服务文案页签，但为让切到文案时即时呈现，组长/所有者首屏一并加载（组员不加载）。
    // 单独容错：这份数据只影响文案「可认证零产出候选」，失败时降级为不显示候选，
    // 不能连带把达人/运营/小组视图一起拖成空白。
    if (isOwnerOrTeamAdmin) {
      try {
        writerCandidates = await loadWriterCandidates({
          supabase,
          activeVisibleUserIds: context.scope.activeVisibleUserIds ?? [],
          actor: context.permissionInfo,
        });
      } catch {
        writerCandidates = [];
      }
    }

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
      writerStaff={writerStaff}
      editorStaff={editorStaff}
      isOwnerOrTeamAdmin={isOwnerOrTeamAdmin}
      canManageVideos={canManageVideos}
      loadFailed={loadFailed}
      writerCandidates={writerCandidates}
    />
  );
}
