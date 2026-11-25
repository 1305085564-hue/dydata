"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HelpCircle } from "lucide-react";
import { RatingRulesDialog } from "@/components/rating-rules/rating-rules-dialog";
import { CollaborationWorkbenchToolbar, type CollaborationSegment } from "./collaboration-workbench-toolbar";
import { HealthBar } from "./health-bar";
import { CollaborationWorkbenchContent } from "./collaboration-workbench-content";
import type { WriterCandidateRow } from "./writer-tab";
import {
  buildCollaborationHeadline,
  generateMonthOptions,
  mergeLocalWorkGroupViews,
  stepCollaborationMonth,
  WORK_GROUP_ROLE_TAB,
  type TabKey,
} from "@/lib/collaboration/domain/workbench-state";
import type { EvaluationStandards } from "@/lib/evaluation-standards";

import type { CollaborationOverviewStats, OperatorRow, StaffRow, SummaryData, TalentRow, WorkGroupViews, WorkGroupRow, WorkGroupRosterMember } from "@/lib/collaboration/types";
import { buildCollaborationSearchParams, buildCollaborationUrl, COLLABORATION_BASE_PATH, pickActiveGroupDetail, resolveCollaborationView, type CollaborationSortDir } from "@/lib/collaboration/work-group-navigation";
import { useCollaborationSort } from "./use-collaboration-sort";
import {
  CollaborationDiagnosisContext,
  type CollaborationDiagnosisDetail,
} from "@/components/admin/collaboration-work-review-link";

interface CollaborationWorkbenchProps {
  year: number;
  month: number;
  defaultTab: TabKey;
  defaultView?: "roles" | "teams";
  defaultGroupId?: string | null;
  defaultPersonId?: string | null;
  defaultSortKey?: string | null;
  defaultSortDir?: CollaborationSortDir;
  workGroupViews?: WorkGroupViews;
  workGroupRawGroups?: WorkGroupRow[];
  workGroupRoster?: WorkGroupRosterMember[];
  canManageWorkGroups?: boolean;
  actorTeamId?: string | null;
  evaluationStandards: EvaluationStandards;
  summary: SummaryData | null;
  overviewStats?: CollaborationOverviewStats | null;
  operators: OperatorRow[];
  talents: TalentRow[];
  writerStaff: StaffRow[];
  editorStaff: StaffRow[];
  isOwnerOrTeamAdmin: boolean;
  canManageVideos: boolean;
  currentUserId?: string | null;
  restrictToSelf?: boolean;
  /** 首屏共享数据集加载失败：明确报错，不把失败伪装成空数据 */
  loadFailed?: boolean;
  writerCandidates?: WriterCandidateRow[];
}

export function CollaborationWorkbench({
  year,
  month,
  defaultTab,
  defaultView = "roles",
  defaultGroupId = null,
  defaultPersonId = null,
  defaultSortKey = null,
  defaultSortDir = "desc",
  workGroupViews,
  workGroupRawGroups = [],
  workGroupRoster = [],
  canManageWorkGroups = false,
  actorTeamId = null,
  evaluationStandards,
  summary,
  overviewStats = null,
  operators,
  talents,
  writerStaff,
  editorStaff,
  isOwnerOrTeamAdmin,
  canManageVideos,
  currentUserId = null,
  restrictToSelf = false,
  loadFailed = false,
  writerCandidates = [],
}: CollaborationWorkbenchProps) {
  const router = useRouter();
  const headline = buildCollaborationHeadline({ month, loadFailed, overview: overviewStats });
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const [view, setView] = useState<"roles" | "teams">(defaultView);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(defaultGroupId);
  const [manageDrawerOpen, setManageDrawerOpen] = useState(false);
  const [manageDrawerFocusGroupId, setManageDrawerFocusGroupId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(defaultPersonId);
  const { sortKey, sortDir, syncSortFromParams, resetSort, handleSortChange } = useCollaborationSort({
    defaultSortKey, defaultSortDir, year, month, view, tab, selectedGroupId, selectedPersonId,
  });
  // 档案抽屉与小队详情是否由本页压入历史节点：关闭/返回时据此决定「回退消费」还是「改写地址」。
  const personEntryPushedRef = useRef(false);
  const groupEntryPushedRef = useRef(false);
  const [personCardRefreshKey, setPersonCardRefreshKey] = useState(0);
  const [leaderboardDialogOpen, setLeaderboardDialogOpen] = useState(false);

  // 视频诊断大抽屉状态：支持就地直出，不发生路由跳转与页面卸载
  const [diagnosisDetail, setDiagnosisDetail] = useState<CollaborationDiagnosisDetail | null>(null);
  const [openingReportId, setOpeningReportId] = useState<string | null>(null);

  // 岗位小队编制本地状态（支持就地静默更新）
  const [currentRawGroups, setCurrentRawGroups] = useState<WorkGroupRow[]>(workGroupRawGroups);
  const [currentRoster, setCurrentRoster] = useState<WorkGroupRosterMember[]>(workGroupRoster);

  useEffect(() => {
    setCurrentRawGroups(workGroupRawGroups);
  }, [workGroupRawGroups]);

  useEffect(() => {
    setCurrentRoster(workGroupRoster);
  }, [workGroupRoster]);

  const monthOptions = useMemo(() => generateMonthOptions(), []);
  const currentMonthValue = `${year}-${month}`;

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    setView(defaultView);
  }, [defaultView]);

  useEffect(() => {
    setSelectedGroupId(defaultGroupId);
  }, [defaultGroupId]);



  const resolvedWorkGroupViews = useMemo(
    () => mergeLocalWorkGroupViews(workGroupViews, currentRawGroups, currentRoster),
    [workGroupViews, currentRawGroups, currentRoster],
  );

  const activeGroupDetail = useMemo(
    () =>
      pickActiveGroupDetail({
        view,
        groupId: selectedGroupId,
        details: resolvedWorkGroupViews?.details,
      }),
    [selectedGroupId, view, resolvedWorkGroupViews],
  );

  // 档案卡的岗位视角：按岗位模式跟当前页签；小队模式没有页签，按小队工种换算。
  // 预取与打开必须用同一个值——否则缓存键对不上（预取白拉一遍），
  // 曲线还会跟着上一个残留的岗位页签取错口径。
  const personRole: TabKey =
    activeGroupDetail && view === "teams"
      ? WORK_GROUP_ROLE_TAB[activeGroupDetail.summary.kind]
      : tab;

  // 深链带了 groupId，却解析不到对应小队（已被删除 / 链接失效）。
  // 此前是静默回落到列表，从旧链接或收藏进来的人会以为自己点错了位置。
  // 只在小组数据确实就绪时才判定「不存在」——未就绪（未建表）不能当成删除，否则误报。
  const groupIdNotFound =
    view === "teams" &&
    Boolean(selectedGroupId) &&
    Boolean(resolvedWorkGroupViews?.ready) &&
    !activeGroupDetail;

  const openDiagnosisByReportId = useCallback(async (reportId: string) => {
    if (openingReportId) return;
    setOpeningReportId(reportId);
    try {
      const response = await fetch(
        `/api/admin/collaboration/work-video?reportId=${encodeURIComponent(reportId)}`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        videoId?: string;
        video?: CollaborationDiagnosisDetail["video"] | null;
        snapshot?: CollaborationDiagnosisDetail["snapshot"] | null;
        reviewReadiness?: CollaborationDiagnosisDetail["reviewReadiness"] | null;
        topicKind?: CollaborationDiagnosisDetail["topicKind"];
        contentQuality?: CollaborationDiagnosisDetail["contentQuality"];
        error?: string;
      };
      if (!response.ok || !payload.videoId) {
        toast.error(payload.error || "没能打开视频诊断");
        return;
      }
      if (payload.video) {
        setDiagnosisDetail({
          video: payload.video,
          snapshot: payload.snapshot ?? null,
          reviewReadiness: payload.reviewReadiness ?? null,
          topicKind: payload.topicKind ?? null,
          contentQuality: payload.contentQuality ?? null,
        });
      } else {
        toast.error("没拿到这件作品的详细诊断数据");
      }
    } catch {
      toast.error("刚才没能打开视频诊断，重试一下");
    } finally {
      setOpeningReportId(null);
    }
  }, [openingReportId]);

  const handleSelectPerson = useCallback((id: string | null) => {
    setSelectedPersonId(id);
    const search = buildCollaborationSearchParams({
      year,
      month,
      view,
      tab: view === "roles" ? tab : undefined,
      groupId: view === "teams" ? selectedGroupId : undefined,
      personId: id, sort: sortKey, dir: sortDir,
    });
    if (id) {
      // 打开档案压入一个历史节点：浏览器「后退」＝关抽屉，符合「就地展开」的心智，
      // 不与既有页签的 replaceState 冲突（页签仍不留历史节点）。
      window.history.pushState(null, "", `${COLLABORATION_BASE_PATH}?${search}`);
      personEntryPushedRef.current = true;
      return;
    }
    // 关闭时若当前节点是本页压入的：用 back() 消费掉它，避免留下「按后退又弹出来」的幽灵节点；
    // 深链直开没有可退的上一节点，才退回改写地址，防止把用户带离本页。
    if (personEntryPushedRef.current) {
      personEntryPushedRef.current = false;
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", `${COLLABORATION_BASE_PATH}?${search}`);
  }, [year, month, view, tab, selectedGroupId, sortKey, sortDir]);

  // 地址栏是小队详情与档案抽屉的唯一真相：浏览器前进/后退时从 URL 恢复状态，保留月份与视图上下文。
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const nextGroupId = params.get("groupId")?.trim() || null;
      const nextView = resolveCollaborationView(params.get("view"), nextGroupId);
      const nextPersonId = params.get("personId")?.trim() || null;
      const rawTab = params.get("tab");
      setView(nextView);
      setSelectedGroupId(nextView === "teams" ? nextGroupId : null);
      setSelectedPersonId(nextPersonId);
      syncSortFromParams(params);
      if (rawTab && ["talents", "operators", "writers", "editors"].includes(rawTab)) {
        setTab(rawTab as TabKey);
      }
      if (!nextPersonId) personEntryPushedRef.current = false;
      if (!nextGroupId || nextView !== "teams") groupEntryPushedRef.current = false;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [syncSortFromParams]);

  const handleDiagnosisLifecycleChanged = useCallback(() => {
    // 诊断抽屉内发生生命周期变动（如删稿/恢复）：通知档案卡静默重新拉取最新数据，避免脏读
    setPersonCardRefreshKey((prev) => prev + 1);
    setDiagnosisDetail(null);
  }, []);

  const handleTabChange = (nextTab: TabKey) => {
    setTab(nextTab);
    setView("roles");
    setSelectedGroupId(null);
    resetSort();
    groupEntryPushedRef.current = false;
    // 数据首屏已全备（运营/达人/文案/剪辑/小队），切页签只镜像地址栏：
    // 用 history.replaceState 而非 router.replace，避免每次切换触发一次多余的服务端重渲染 + 地址栏滞后。
    // 带上 personId：地址栏任何时候都与界面一致，不留「链接丢参数、抽屉还开着」的错位。
    window.history.replaceState(null, "", `${COLLABORATION_BASE_PATH}?${buildCollaborationSearchParams({ year, month, view: "roles", tab: nextTab, personId: selectedPersonId })}`);
  };

  const handleViewChange = (nextView: "roles" | "teams") => {
    setView(nextView);
    resetSort();
    if (nextView === "roles") {
      setSelectedGroupId(null);
      groupEntryPushedRef.current = false;
    }
    window.history.replaceState(null, "", `${COLLABORATION_BASE_PATH}?${buildCollaborationSearchParams({ year, month, view: nextView, tab, personId: selectedPersonId })}`);
  };

  const handleSegmentChange = (next: CollaborationSegment) => {
    if (next === "teams") handleViewChange("teams");
    else handleTabChange(next);
  };

  // 评级规则入口就近放在「良优率」列头旁
  const rulesEntry = useMemo(
    () => (
      <RatingRulesDialog
        evaluationStandards={evaluationStandards}
        trigger={
          <button
            type="button"
            aria-label="作品评级规则"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex size-4 items-center justify-center rounded-md text-[#A8A29E] hover:text-[#141413] transition-colors duration-150 cursor-pointer"
          >
            <HelpCircle className="size-3" aria-hidden />
          </button>
        }
      />
    ),
    [evaluationStandards],
  );

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    resetSort();
    window.history.pushState(null, "", `${COLLABORATION_BASE_PATH}?${buildCollaborationSearchParams({ year, month, view: "teams", groupId, personId: selectedPersonId })}`);
    groupEntryPushedRef.current = true;
  };

  const handleBackToGroupList = () => {
    setSelectedGroupId(null);
    resetSort();
    if (groupEntryPushedRef.current && !personEntryPushedRef.current) {
      groupEntryPushedRef.current = false;
      window.history.back();
      return;
    }
    groupEntryPushedRef.current = false;
    window.history.replaceState(null, "", `${COLLABORATION_BASE_PATH}?${buildCollaborationSearchParams({ year, month, view: "teams", personId: selectedPersonId })}`);
  };

  const buildMonthUrl = (targetYear: number, targetMonth: number) => {
    if (view === "teams") {
      return buildCollaborationUrl({ year: targetYear, month: targetMonth, view: "teams", groupId: selectedGroupId, sort: sortKey, dir: sortDir });
    }
    return buildCollaborationUrl({ year: targetYear, month: targetMonth, view: "roles", tab, sort: sortKey, dir: sortDir });
  };

  const handleMonthChange = (val: string | null) => {
    if (!val) return;
    const [y, m] = val.split("-");
    router.push(buildMonthUrl(Number(y), Number(m)));
  };

  const stepMonth = (delta: -1 | 1) => {
    const target = stepCollaborationMonth(year, month, delta);
    if (target) router.push(buildMonthUrl(target.year, target.month));
  };

  // 全局键盘快捷翻月（DOET #2）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (manageDrawerOpen || Boolean(selectedPersonId) || Boolean(diagnosisDetail)) return;
      const target = e.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepMonth(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepMonth(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 月份快捷键在状态变更时更新闭包
  }, [year, month, view, tab, selectedGroupId, manageDrawerOpen, selectedPersonId, diagnosisDetail]);

  return (
    <CollaborationDiagnosisContext.Provider
      value={{ openDiagnosisByReportId, openingReportId }}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h1 className="font-serif text-[20px] sm:text-[28px] leading-[1.20] tracking-tight text-[#141413]">
          {headline}
        </h1>
        <HealthBar summary={summary} year={year} month={month} canEdit={isOwnerOrTeamAdmin} />
      </header>
      <div className="space-y-3">
      <CollaborationWorkbenchToolbar
        monthOptions={monthOptions}
        currentMonthValue={currentMonthValue}
        segment={view === "teams" ? "teams" : tab}
        loadFailed={loadFailed}
        canManageWorkGroups={canManageWorkGroups}
        hasActiveGroupDetail={Boolean(activeGroupDetail)}
        resolvedWorkGroupViews={resolvedWorkGroupViews}
        talents={talents}
        operators={operators}
        writerStaff={writerStaff}
        writerCandidates={writerCandidates}
        editorStaff={editorStaff}
        onMonthChange={handleMonthChange}
        onSegmentChange={handleSegmentChange}
        onLeaderboardOpen={setLeaderboardDialogOpen}
        onOpenManageDrawer={() => {
          setManageDrawerFocusGroupId(null);
          setManageDrawerOpen(true);
        }}
      />
      <CollaborationWorkbenchContent
        year={year} month={month} view={view} tab={tab}
        sortKey={sortKey} sortDir={sortDir} onSortChange={handleSortChange}
        activeGroupDetail={activeGroupDetail}
        groupIdNotFound={groupIdNotFound}
        resolvedWorkGroupViews={resolvedWorkGroupViews}
        canManageWorkGroups={canManageWorkGroups}
        canManageVideos={canManageVideos}
        currentRawGroups={currentRawGroups}
        currentRoster={currentRoster}
        actorTeamId={actorTeamId}
        evaluationStandards={evaluationStandards}
        manageDrawerOpen={manageDrawerOpen}
        manageDrawerFocusGroupId={manageDrawerFocusGroupId}
        selectedPersonId={selectedPersonId}
        personRole={personRole}
        personCardRefreshKey={personCardRefreshKey}
        diagnosisDetail={diagnosisDetail}
        openingReportId={openingReportId}
        leaderboardDialogOpen={leaderboardDialogOpen}
        rulesEntry={rulesEntry}
        talents={talents}
        operators={operators}
        writerStaff={writerStaff}
        editorStaff={editorStaff}
        writerCandidates={writerCandidates}
        isOwnerOrTeamAdmin={isOwnerOrTeamAdmin}
        currentUserId={currentUserId}
        restrictToSelf={restrictToSelf}
        loadFailed={loadFailed}
        onBackToGroupList={handleBackToGroupList}
        onOpenManageDrawer={(groupId) => {
          setManageDrawerFocusGroupId(groupId);
          setManageDrawerOpen(true);
        }}
        onSelectGroup={handleSelectGroup}
        onSelectPerson={handleSelectPerson}
        onLeaderboardChange={setLeaderboardDialogOpen}
        onCloseDiagnosis={() => setDiagnosisDetail(null)}
        onLifecycleChanged={handleDiagnosisLifecycleChanged}
        onCloseManageDrawer={() => {
          setManageDrawerOpen(false);
          setManageDrawerFocusGroupId(null);
        }}
        onGroupsChange={setCurrentRawGroups}
        onRosterChange={setCurrentRoster}
      />
      </div>
    </CollaborationDiagnosisContext.Provider>
  );
}
