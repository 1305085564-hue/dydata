"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CollaborationWorkbenchToolbar } from "./collaboration-workbench-toolbar";
import { CollaborationWorkbenchContent } from "./collaboration-workbench-content";
import type { WriterCandidateRow } from "./writer-tab";
import { generateMonthOptions, WORK_GROUP_ROLE_TAB, type TabKey } from "@/lib/collaboration/domain/workbench-state";
import { getShanghaiYearMonth } from "@/lib/loaders/shared";

import {
  type OperatorRow,
  type StaffRow,
  type SummaryData,
  type TalentRow,
  type WorkGroupViews,
  type WorkGroupRow,
  type WorkGroupRosterMember,
  type WorkGroupSummaryRow,
} from "./types";
import {
  buildCollaborationSearchParams,
  buildCollaborationUrl,
  COLLABORATION_BASE_PATH,
  pickActiveGroupDetail,
} from "@/lib/collaboration/work-group-navigation";
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
  workGroupViews?: WorkGroupViews;
  workGroupRawGroups?: WorkGroupRow[];
  workGroupRoster?: WorkGroupRosterMember[];
  canManageWorkGroups?: boolean;
  actorTeamId?: string | null;
  summary: SummaryData | null;
  operators: OperatorRow[];
  talents: TalentRow[];
  writerStaff: StaffRow[];
  editorStaff: StaffRow[];
  isOwnerOrTeamAdmin: boolean;
  canManageVideos: boolean;
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
  workGroupViews,
  workGroupRawGroups = [],
  workGroupRoster = [],
  canManageWorkGroups = false,
  actorTeamId = null,
  summary,
  operators,
  talents,
  writerStaff,
  editorStaff,
  isOwnerOrTeamAdmin,
  canManageVideos,
  loadFailed = false,
  writerCandidates = [],
}: CollaborationWorkbenchProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const [view, setView] = useState<"roles" | "teams">(defaultView);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(defaultGroupId);
  const [manageDrawerOpen, setManageDrawerOpen] = useState(false);
  const [manageDrawerFocusGroupId, setManageDrawerFocusGroupId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
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
  const shanghaiNow = getShanghaiYearMonth();
  const isCurrentMonth = year === shanghaiNow.year && month === shanghaiNow.month;

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    setView(defaultView);
  }, [defaultView]);

  useEffect(() => {
    setSelectedGroupId(defaultGroupId);
  }, [defaultGroupId]);

  const resolvedWorkGroupViews = useMemo(() => {
    if (!workGroupViews) return undefined;
    const groups: WorkGroupSummaryRow[] = currentRawGroups.map((rg) => {
      const existing = workGroupViews.groups.find((g) => g.id === rg.id);
      const memberCount = currentRoster.filter((m) =>
        rg.kind === "operator" ? m.operatorGroupId === rg.id : m.peerGroupId === rg.id,
      ).length;
      if (existing) {
        return { ...existing, name: rg.name, kind: rg.kind, memberCount };
      }
      return {
        id: rg.id,
        name: rg.name,
        kind: rg.kind,
        teamId: rg.teamId,
        memberCount,
        // 本地新建小队还没有服务端统计，给全零/— 的空绩效
        aggregate: {
          reportCount: 0,
          snapshotCount: 0,
          totalPlay: 0,
          avgPlay: 0,
          followerConversionRate: null,
          interactionRate: null,
          likeRate: null,
          favoriteRate: null,
        },
        contentQuality: null,
      };
    });

    const details = workGroupViews.details.map((detail) => {
      const groupSummary = groups.find((g) => g.id === detail.summary.id);
      if (!groupSummary) return detail;
      return {
        ...detail,
        summary: groupSummary,
      };
    });
    // 本地刚建、服务端 details 里还没有的小队补一条空名单 detail，
    // 否则点进详情会因为找不到而进不去（要等下次刷新）
    const knownDetailIds = new Set(workGroupViews.details.map((detail) => detail.summary.id));
    for (const group of groups) {
      if (knownDetailIds.has(group.id)) continue;
      details.push({ summary: group, members: [] });
    }

    return {
      ready: workGroupViews.ready,
      groups,
      details,
    };
  }, [workGroupViews, currentRawGroups, currentRoster]);

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
        error?: string;
      };
      if (!response.ok || !payload.videoId) {
        toast.error(payload.error || "暂时无法打开视频诊断");
        return;
      }
      if (payload.video) {
        setDiagnosisDetail({
          video: payload.video,
          snapshot: payload.snapshot ?? null,
          reviewReadiness: payload.reviewReadiness ?? null,
          topicKind: payload.topicKind ?? null,
        });
      } else {
        toast.error("未能获取该作品的详细诊断数据");
      }
    } catch {
      toast.error("网络异常，暂时无法打开视频诊断");
    } finally {
      setOpeningReportId(null);
    }
  }, [openingReportId]);

  const handleSelectPerson = useCallback((id: string | null) => {
    setSelectedPersonId(id);
  }, []);

  const handleDiagnosisLifecycleChanged = useCallback(() => {
    // 诊断抽屉内发生生命周期变动（如删稿/恢复）：通知档案卡静默重新拉取最新数据，避免脏读
    setPersonCardRefreshKey((prev) => prev + 1);
    setDiagnosisDetail(null);
  }, []);

  const handleTabChange = (nextTab: TabKey) => {
    setTab(nextTab);
    // 数据首屏已全备（运营/达人/文案/剪辑/小队），切页签只镜像地址栏：
    // 用 history.replaceState 而非 router.replace，避免每次切换触发一次多余的服务端重渲染 + 地址栏滞后。
    window.history.replaceState(null, "", `${COLLABORATION_BASE_PATH}?${buildCollaborationSearchParams({ year, month, view: "roles", tab: nextTab })}`);
  };

  const handleViewChange = (nextView: "roles" | "teams") => {
    setView(nextView);
    window.history.replaceState(null, "", `${COLLABORATION_BASE_PATH}?${buildCollaborationSearchParams({ year, month, view: nextView, tab })}`);
  };

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    window.history.replaceState(null, "", `${COLLABORATION_BASE_PATH}?${buildCollaborationSearchParams({ year, month, view: "teams", groupId })}`);
  };

  const handleBackToGroupList = () => {
    setSelectedGroupId(null);
    window.history.replaceState(null, "", `${COLLABORATION_BASE_PATH}?${buildCollaborationSearchParams({ year, month, view: "teams" })}`);
  };

  const buildMonthUrl = (targetYear: number, targetMonth: number) => {
    if (view === "teams") {
      return buildCollaborationUrl({ year: targetYear, month: targetMonth, view: "teams", groupId: selectedGroupId });
    }
    return buildCollaborationUrl({ year: targetYear, month: targetMonth, view: "roles", tab });
  };

  const handleMonthChange = (val: string | null) => {
    if (!val) return;
    const [y, m] = val.split("-");
    router.push(buildMonthUrl(Number(y), Number(m)));
  };

  const handlePrevMonth = () => {
    let prevY = year;
    let prevM = month - 1;
    if (prevM < 1) {
      prevM = 12;
      prevY--;
    }
    if (prevY < 2026 || (prevY === 2026 && prevM < 7)) return;
    router.push(buildMonthUrl(prevY, prevM));
  };

  const handleNextMonth = () => {
    const now = getShanghaiYearMonth();
    let nextY = year;
    let nextM = month + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY++;
    }
    const currentY = now.year;
    const currentM = now.month;
    if (nextY > currentY || (nextY === currentY && nextM > currentM)) return;
    router.push(buildMonthUrl(nextY, nextM));
  };

  // 全局键盘快捷翻月（DOET #2）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (manageDrawerOpen || Boolean(selectedPersonId) || Boolean(diagnosisDetail)) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevMonth();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextMonth();
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
      <CollaborationWorkbenchToolbar
        year={year}
        month={month}
        monthOptions={monthOptions}
        currentMonthValue={currentMonthValue}
        isCurrentMonth={isCurrentMonth}
        view={view}
        tab={tab}
        summary={summary}
        isOwnerOrTeamAdmin={isOwnerOrTeamAdmin}
        loadFailed={loadFailed}
        canManageWorkGroups={canManageWorkGroups}
        hasActiveGroupDetail={Boolean(activeGroupDetail)}
        resolvedWorkGroupViews={resolvedWorkGroupViews}
        talents={talents}
        operators={operators}
        writerStaff={writerStaff}
        editorStaff={editorStaff}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onMonthChange={handleMonthChange}
        onViewChange={handleViewChange}
        onTabChange={handleTabChange}
        onLeaderboardOpen={setLeaderboardDialogOpen}
        onOpenManageDrawer={() => {
          setManageDrawerFocusGroupId(null);
          setManageDrawerOpen(true);
        }}
      />
      <CollaborationWorkbenchContent
        year={year}
        month={month}
        view={view}
        tab={tab}
        activeGroupDetail={activeGroupDetail}
        groupIdNotFound={groupIdNotFound}
        resolvedWorkGroupViews={resolvedWorkGroupViews}
        canManageWorkGroups={canManageWorkGroups}
        canManageVideos={canManageVideos}
        currentRawGroups={currentRawGroups}
        currentRoster={currentRoster}
        actorTeamId={actorTeamId}
        manageDrawerOpen={manageDrawerOpen}
        manageDrawerFocusGroupId={manageDrawerFocusGroupId}
        selectedPersonId={selectedPersonId}
        personRole={personRole}
        personCardRefreshKey={personCardRefreshKey}
        diagnosisDetail={diagnosisDetail}
        openingReportId={openingReportId}
        leaderboardDialogOpen={leaderboardDialogOpen}
        summary={summary}
        talents={talents}
        operators={operators}
        writerStaff={writerStaff}
        editorStaff={editorStaff}
        writerCandidates={writerCandidates}
        isOwnerOrTeamAdmin={isOwnerOrTeamAdmin}
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
    </CollaborationDiagnosisContext.Provider>
  );
}
