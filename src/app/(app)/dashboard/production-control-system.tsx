"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Filter,
  History,
  LayoutDashboard,
  Layers,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  Trophy,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  getMyTodaySopStatusAction,
  getSopMatrixAction,
  reviewSopCheckpointAction,
  submitSopCheckpointAction,
} from "@/app/actions/sop";
import { cn } from "@/lib/utils";
import type { SopCheckpoint, SopCheckpointStatus, SopMemberStatus, SopReviewScores } from "@/types";
import type { ExemptionGrantLike, ExemptionProfileLike } from "@/lib/豁免";
import { groupDashboardAlerts, type DashboardAlertLike } from "./alert-groups";
import { VideoSubmitPanel } from "./video-submit-panel";
import type { TodaySubmissionReportLike } from "./video-submit-panel-state";
import { 申请豁免弹窗 } from "./申请豁免弹窗";
import { initDashboardStore, setDashboardAccount, setDashboardDate } from "@/lib/dashboard-store";

const STATUS_THEME: Record<
  SopCheckpointStatus,
  { label: string; color: string; bg: string; dot: string; cell: string }
> = {
  IDLE: {
    label: "待处理",
    color: "text-zinc-400",
    bg: "bg-zinc-50",
    dot: "bg-zinc-300",
    cell: "bg-transparent border-zinc-100 text-zinc-200",
  },
  PENDING: {
    label: "执行中",
    color: "text-[#92400E]",
    bg: "bg-[#FEF9C3]",
    dot: "bg-[#CA8A04] shadow-[0_0_8px_rgba(202,138,4,0.3)]",
    cell: "bg-[#FEF9C3] border-[#FDE68A] text-[#92400E]",
  },
  SUBMITTED: {
    label: "已提交",
    color: "text-[#444CE7]",
    bg: "bg-[#E0E9FF]",
    dot: "bg-[#444CE7]",
    cell: "bg-[#E0E9FF] border-[#C7D7FE] text-[#444CE7]",
  },
  APPROVED: {
    label: "已通过",
    color: "text-[#067647]",
    bg: "bg-[#D1FADF]",
    dot: "bg-[#067647] shadow-[0_0_8px_rgba(6,118,71,0.3)]",
    cell: "bg-[#D1FADF] border-[#ABEFC6] text-[#067647]",
  },
  REJECTED: {
    label: "需修正",
    color: "text-[#B42318]",
    bg: "bg-[#FEE4E2]",
    dot: "bg-[#B42318] shadow-[0_0_8px_rgba(180,35,24,0.3)]",
    cell: "bg-[#FEE4E2] border-[#FECDCA] text-[#B42318]",
  },
  OVERDUE: {
    label: "延期",
    color: "text-zinc-500",
    bg: "bg-zinc-100",
    dot: "bg-zinc-900",
    cell: "bg-zinc-100 border-zinc-200 text-zinc-900",
  },
};

const MATRIX_CHECKPOINTS: Array<{ id: SopCheckpoint; label: string; icon: typeof LayoutDashboard }> = [
  { id: "DATA_REPORT", label: "数据报表", icon: LayoutDashboard },
  { id: "MORNING_REVIEW", label: "早会复盘", icon: Layers },
  { id: "TOPIC", label: "选题策划", icon: Target },
  { id: "SCRIPT", label: "脚本创作", icon: FileText },
  { id: "VIDEO", label: "成片审核", icon: Video },
];

const PRODUCTION_CHECKPOINTS = MATRIX_CHECKPOINTS.filter((checkpoint) =>
  ["TOPIC", "SCRIPT", "VIDEO"].includes(checkpoint.id),
);

const REVIEW_DIMENSIONS: Array<{ key: keyof SopReviewScores; label: string; short: string }> = [
  { key: "HOOK", label: "开头感染力", short: "开头 (HOOK)" },
  { key: "VIEWPOINT", label: "观点质量", short: "逻辑 (POV)" },
  { key: "COMPLIANCE", label: "合规红线", short: "合规" },
  { key: "PERFORMANCE_HOOK", label: "绩效钩子", short: "绩效钩子" },
  { key: "YESTERDAY_REVIEW", label: "昨日绩效回顾", short: "昨日回顾" },
  { key: "CTA", label: "导粉话术", short: "转化 (CTA)" },
];

type WorkspaceTab = "FLOW" | "REVIEW" | "MATRIX";

function severityTone(severity: string) {
  return severity === "critical"
    ? "border-[#FECDCA] bg-[#FEE4E2] text-[#B42318]"
    : "border-[#FDE68A] bg-[#FEF9C3] text-[#92400E]";
}

function StatusBadge({ status, minimal = false }: { status: SopCheckpointStatus; minimal?: boolean }) {
  const theme = STATUS_THEME[status] ?? STATUS_THEME.IDLE;
  if (minimal) return <div className={cn("h-1.5 w-1.5 rounded-full", theme.dot)} />;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-0.5 text-[10px] font-bold tracking-tight",
        theme.bg,
        theme.color,
      )}
    >
      <div className={cn("h-1 w-1 rounded-full", theme.dot)} />
      {theme.label}
    </div>
  );
}

function getLatestSubmission(member: SopMemberStatus, checkpoint?: SopCheckpoint) {
  const submissions = checkpoint
    ? member.submissions.filter((submission) => submission.checkpoint === checkpoint)
    : member.submissions;
  return submissions.slice().sort((left, right) => right.submitted_at.localeCompare(left.submitted_at))[0] ?? null;
}

function checkpointLabel(checkpoint: SopCheckpoint) {
  return MATRIX_CHECKPOINTS.find((item) => item.id === checkpoint)?.label ?? checkpoint;
}

function DashboardWorkspaceHeader({
  today,
  activeBizDate,
  onDateChange,
  activeTab,
  onTabChange,
  onDashboardAction,
  hasPendingExemption,
  submittedDates,
  userRole,
  alertCount,
}: {
  today: string;
  activeBizDate: string;
  onDateChange: (date: string) => void;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onDashboardAction: (key: string) => void;
  hasPendingExemption: boolean;
  submittedDates: string[];
  userRole: "member" | "admin" | "owner";
  alertCount: number;
}) {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const utilityActions = [
    { key: "data-view", label: "数据查看", icon: Eye },
    { key: "trend-view", label: "趋势查看", icon: TrendingUp },
    { key: "leaderboard", label: "排行榜", icon: Trophy },
    { key: "history", label: "历史记录", icon: History },
  ];

  const tabs: Array<{ key: WorkspaceTab; label: string }> = [
    { key: "FLOW", label: "今日流程" },
    ...(userRole !== "member" ? [{ key: "REVIEW" as WorkspaceTab, label: "审核中心" }] : []),
    ...(userRole !== "member" ? [{ key: "MATRIX" as WorkspaceTab, label: "全域矩阵" }] : []),
  ];

  function openDatePicker() {
    if (dateInputRef.current?.showPicker) {
      dateInputRef.current.showPicker();
      return;
    }

    dateInputRef.current?.focus();
  }

  return (
    <div className="mx-auto mb-6 max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-400">
            <Activity size={14} className="text-zinc-900" /> Live Workflow
          </div>
          <h2 className="text-3xl font-black tracking-tight text-zinc-900">今日生产流程</h2>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <div className="text-left sm:text-right">
            <span className="block text-[10px] font-black uppercase tracking-tighter text-zinc-400">Today</span>
            <button
              type="button"
              onClick={openDatePicker}
              className="group inline-flex items-center justify-end gap-1.5 rounded-2xl py-1 text-xl font-black tabular-nums text-rose-500 transition-all hover:opacity-80 sm:text-2xl"
              aria-label="选择填报日期"
            >
              <span>{activeBizDate}</span>
              <CalendarDays className="size-3.5 text-rose-400 transition-transform group-hover:-translate-y-0.5" />
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={activeBizDate}
              max={today}
              onChange={(event) => {
                if (event.target.value) onDateChange(event.target.value);
              }}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="数据快捷入口">
          {utilityActions.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.key}
                type="button"
                onClick={() => onDashboardAction(action.key)}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2.5 text-[11px] font-black text-zinc-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
              >
                <Icon size={13} />
                {action.label}
              </button>
            );
          })}
          <QuickExemptionButton
            hasPending={hasPendingExemption}
            today={today}
            submittedDates={submittedDates}
            initialSelectedDates={[today]}
          />
        </div>

        <nav className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1 shadow-sm lg:w-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={cn(
                "relative min-w-24 shrink-0 rounded-xl px-4 py-1.5 text-[12px] font-black transition-all",
                activeTab === tab.key
                  ? "bg-zinc-900 text-white shadow-lg"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900",
              )}
            >
              {tab.label}
              {tab.key === "REVIEW" && alertCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B42318] px-1 text-[9px] font-black text-white">
                  {alertCount > 9 ? "9+" : alertCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function matrixRate(rows: SopMemberStatus[]) {
  const total = rows.length * MATRIX_CHECKPOINTS.length;
  if (total === 0) return "0.0";
  const approved = rows.reduce(
    (sum, row) => sum + MATRIX_CHECKPOINTS.filter((checkpoint) => row.statuses[checkpoint.id] === "APPROVED").length,
    0,
  );
  return ((approved / total) * 100).toFixed(1);
}

function AlertCenter({
  groups,
  expanded,
  expandedUsers,
  onToggleExpanded,
  onToggleUser,
  onDismissAlert,
}: {
  groups: ReturnType<typeof groupDashboardAlerts>;
  expanded: boolean;
  expandedUsers: Set<string>;
  onToggleExpanded: () => void;
  onToggleUser: (userKey: string) => void;
  onDismissAlert: (id: string) => void;
}) {
  const alertCount = groups.reduce((sum, group) => sum + group.count, 0);
  const criticalUserCount = groups.filter((group) => group.criticalCount > 0).length;

  if (alertCount === 0) return null;

  return (
    <div className="mx-auto mb-6 max-w-6xl">
      <div className="overflow-hidden rounded-2xl border border-[#FECDCA] bg-white shadow-sm">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex w-full items-center justify-between gap-4 bg-[#FEE4E2] px-4 py-3 text-left transition-colors hover:bg-[#FECDCA]/70"
          aria-expanded={expanded}
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-[#B42318]" />
            <span className="text-[11px] font-black uppercase tracking-widest text-[#B42318]">异常告警</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-[#B42318] shadow-sm">
              {groups.length} 人异常
            </span>
            {criticalUserCount > 0 && (
              <span className="hidden rounded-full bg-[#B42318] px-2 py-0.5 text-[10px] font-black text-white sm:inline-flex">
                {criticalUserCount} 人严重
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] font-black text-[#B42318]">
            共 {alertCount} 项
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </button>

        {expanded && (
          <div className="divide-y divide-zinc-100">
            {groups.map((group) => {
              const userExpanded = expandedUsers.has(group.userKey);

              return (
                <div key={group.userKey} className="bg-white">
                  <button
                    type="button"
                    onClick={() => onToggleUser(group.userKey)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
                    aria-expanded={userExpanded}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-black text-zinc-900">{group.userName}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {group.criticalCount > 0 && (
                          <span className="rounded-md border border-[#FECDCA] bg-[#FEE4E2] px-1.5 py-0.5 text-[10px] font-black text-[#B42318]">
                            严重 {group.criticalCount}
                          </span>
                        )}
                        {group.warningCount > 0 && (
                          <span className="rounded-md border border-[#FDE68A] bg-[#FEF9C3] px-1.5 py-0.5 text-[10px] font-black text-[#92400E]">
                            提醒 {group.warningCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-black text-white">
                        {group.count} 项
                      </span>
                      {userExpanded ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </div>
                  </button>

                  {userExpanded && (
                    <div className="space-y-2 bg-zinc-50 px-4 pb-4">
                      {group.alerts.map((alert) => (
                        <div key={alert.id} className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {alert.checkpointLabel && (
                                <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-black", severityTone(alert.severity))}>
                                  {alert.checkpointLabel}
                                </span>
                              )}
                              <span className="text-[12px] font-bold text-zinc-700">{alert.message}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onDismissAlert(alert.id)}
                            className="shrink-0 rounded-md p-1 text-zinc-300 hover:bg-zinc-100 hover:text-zinc-600"
                            aria-label="关闭这条告警"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface ProductionControlSystemProps {
  initialMine: SopMemberStatus | null;
  initialMatrix: SopMemberStatus[];
  today: string;
  userDisplayName: string;
  userRole: "member" | "admin" | "owner";
  accounts: { id: string; name: string; display_name: string; content_direction: string | null }[];
  userId: string;
  todayReports: TodaySubmissionReportLike[];
  monthReports: Array<Omit<TodaySubmissionReportLike, "account_id"> & { id: string; account_id: string }>;
  history: Array<Omit<TodaySubmissionReportLike, "account_id"> & { id: string; account_id: string }>;
  accountIds: string[];
  ownContentDirections: string[];
  accountDisplayNameMap: Record<string, string>;
  hasPendingExemption?: boolean;
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
}

export function ProductionControlSystem({
  initialMine,
  initialMatrix,
  today,
  userDisplayName,
  userRole,
  accounts,
  userId,
  todayReports,
  monthReports,
  history,
  accountIds,
  ownContentDirections,
  accountDisplayNameMap,
  hasPendingExemption = false,
  userExemptionProfile,
  userExemptionGrants,
}: ProductionControlSystemProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("FLOW");
  const [activeCheckpoint, setActiveCheckpoint] = useState<SopCheckpoint>("DATA_REPORT");
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [activeBizDate, setActiveBizDate] = useState(today);
  const pendingDashboardActionRef = useRef<string | null>(null);
  const [mine, setMine] = useState(initialMine);
  const [matrix, setMatrix] = useState(initialMatrix);
  const [isPending, startTransition] = useTransition();
  const [alerts, setAlerts] = useState<DashboardAlertLike[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [expandedAlertUsers, setExpandedAlertUsers] = useState<Set<string>>(new Set());
  const submittedDates = useMemo(
    () =>
      Array.from(
        new Set(
          todayReports
            .map((report) => report.report_date)
            .filter((date): date is string => Boolean(date)),
        ),
      ),
    [todayReports],
  );

  // Initialize global dashboard store and listen for NavBar account/date changes
  useEffect(() => {
    initDashboardStore({
      accounts,
      selectedAccountId,
      activeBizDate,
    });

    function handleExternalAction(event: Event) {
      const detail = (event as CustomEvent<{ key?: string; accountId?: string; date?: string }>).detail;
      if (detail?.key === "set-account" && detail.accountId) {
        setSelectedAccountId(detail.accountId);
        setActiveBizDate(today);
        setDashboardAccount(detail.accountId);
      }
      if (detail?.key === "set-date" && detail.date) {
        setActiveBizDate(detail.date);
        setDashboardDate(detail.date);
      }
    }

    window.addEventListener("dydata-dashboard-action", handleExternalAction);
    return () => window.removeEventListener("dydata-dashboard-action", handleExternalAction);
  }, [accounts, selectedAccountId, activeBizDate, today]);

  const refreshSop = (nextMine?: SopMemberStatus) => {
    if (nextMine) setMine(nextMine);

    startTransition(async () => {
      const isAdminOrOwner = userRole === "admin" || userRole === "owner";

      // owner/admin 的 queue 和 matrix 数据相同，只请求一次
      const sharedPromise = isAdminOrOwner
        ? getSopMatrixAction({ statusDate: today })
        : Promise.resolve({ data: null });

      const [mineResult, sharedResult] = await Promise.all([
        getMyTodaySopStatusAction({ statusDate: today }),
        sharedPromise,
      ]);

      if (mineResult.data) setMine(mineResult.data);

      if (isAdminOrOwner && sharedResult.data) {
        setMatrix(sharedResult.data);
      }
    });
  };

  const openReviewTarget = () => {
    setActiveTab("REVIEW");
  };

  const dispatchDashboardAction = (key: string) => {
    window.dispatchEvent(new CustomEvent("dydata-dashboard-action", { detail: { key } }));
  };

  const openDashboardTool = (key: string) => {
    if (activeTab === "FLOW" && activeCheckpoint === "DATA_REPORT") {
      dispatchDashboardAction(key);
      return;
    }

    pendingDashboardActionRef.current = key;
    setActiveTab("FLOW");
    setActiveCheckpoint("DATA_REPORT");
  };

  useEffect(() => {
    if (!pendingDashboardActionRef.current || activeTab !== "FLOW" || activeCheckpoint !== "DATA_REPORT") return;

    const action = pendingDashboardActionRef.current;
    pendingDashboardActionRef.current = null;
    dispatchDashboardAction(action);
  }, [activeCheckpoint, activeTab]);

  useEffect(() => {
    let active = true;
    const fetchAlerts = async () => {
      try {
        const res = await fetch(`/api/sop/alerts?statusDate=${today}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.ok) setAlerts(data.alerts ?? []);
      } catch {}
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => { active = false; clearInterval(interval); };
  }, [today]);

  const dismissAlert = (id: string) => setDismissedAlerts((prev) => new Set(prev).add(id));
  const visibleAlerts = alerts.filter((a) => !dismissedAlerts.has(a.id));
  const alertGroups = useMemo(() => groupDashboardAlerts(visibleAlerts), [visibleAlerts]);
  const toggleAlertUser = (userKey: string) => {
    setExpandedAlertUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userKey)) next.delete(userKey);
      else next.add(userKey);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#F9F9FB] text-zinc-900 antialiased">
      <main className="animate-in fade-in p-4 duration-500 lg:p-8">
        <DashboardWorkspaceHeader
          today={today}
          activeBizDate={activeBizDate}
          onDateChange={(date) => {
            setActiveBizDate(date);
            setDashboardDate(date);
          }}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onDashboardAction={openDashboardTool}
          hasPendingExemption={hasPendingExemption}
          submittedDates={submittedDates}
          userRole={userRole}
          alertCount={alertGroups.length}
        />

        <AlertCenter
          groups={alertGroups}
          expanded={alertsExpanded}
          expandedUsers={expandedAlertUsers}
          onToggleExpanded={() => setAlertsExpanded((prev) => !prev)}
          onToggleUser={toggleAlertUser}
          onDismissAlert={dismissAlert}
        />

        {activeTab === "FLOW" && (
          <WorkflowDashboard
            mine={mine}
            today={today}
            hasTodayReport={todayReports.length > 0}
            isPending={isPending}
            activeCheckpoint={activeCheckpoint}
            onCheckpointChange={setActiveCheckpoint}
            onSubmitted={refreshSop}
            dataReport={
              <DataReportStage
                key={`${selectedAccountId}-${activeBizDate}`}
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                onSelectedAccountChange={setSelectedAccountId}
                activeBizDate={activeBizDate}
                onActiveBizDateChange={setActiveBizDate}
                userId={userId}
                userDisplayName={userDisplayName}
                today={today}
                todayReports={todayReports}
                monthReports={monthReports}
                history={history}
                accountIds={accountIds}
                ownContentDirections={ownContentDirections}
                accountDisplayNameMap={accountDisplayNameMap}
                hasPendingExemption={hasPendingExemption}
                userExemptionProfile={userExemptionProfile}
                userExemptionGrants={userExemptionGrants}
              />
            }
          />
        )}
        {activeTab === "REVIEW" && (
          userRole === "admin" || userRole === "owner" ? (
            <LeaderDashboard today={today} userRole={userRole} />
          ) : (
            null
          )
        )}
        {activeTab === "MATRIX" && (userRole === "admin" || userRole === "owner") && (
          <GlobalMatrix rows={matrix} onOpenTarget={openReviewTarget} />
        )}
      </main>
    </div>
  );
}

function WorkflowDashboard({
  mine,
  today,
  hasTodayReport,
  isPending,
  activeCheckpoint,
  onCheckpointChange,
  onSubmitted,
  dataReport,
}: {
  mine: SopMemberStatus | null;
  today: string;
  hasTodayReport: boolean;
  isPending: boolean;
  activeCheckpoint: SopCheckpoint;
  onCheckpointChange: (checkpoint: SopCheckpoint) => void;
  onSubmitted: (nextMine?: SopMemberStatus) => void;
  dataReport: React.ReactNode;
}) {
  const [topicText, setTopicText] = useState(() => getLatestSubmission(mine ?? emptyMember(today), "TOPIC")?.topic_text ?? "");
  const [scriptText, setScriptText] = useState(
    () => getLatestSubmission(mine ?? emptyMember(today), "SCRIPT")?.script_text ?? "",
  );
  const [videoUrl, setVideoUrl] = useState(() => getLatestSubmission(mine ?? emptyMember(today), "VIDEO")?.video_url ?? "");
  const [isSubmitting, startSubmit] = useTransition();
  const statuses = {
    ...(mine?.statuses ?? emptyStatuses()),
    DATA_REPORT: hasTodayReport ? ("APPROVED" as const) : (mine?.statuses.DATA_REPORT ?? "IDLE"),
  };
  const currentStep = Math.max(
    MATRIX_CHECKPOINTS.findIndex((checkpoint) => checkpoint.id === activeCheckpoint),
    0,
  );
  const scriptSubmission = mine ? getLatestSubmission(mine, "SCRIPT") : null;
  const activeStatus = statuses[activeCheckpoint];
  const stageTitle =
    activeCheckpoint === "DATA_REPORT"
      ? "数据报表上传"
      : activeCheckpoint === "TOPIC"
        ? "选题上报"
        : activeCheckpoint === "SCRIPT"
          ? "脚本内容录入"
          : activeCheckpoint === "VIDEO"
            ? "审片发布链接"
            : "早会复盘确认";

  const submitCheckpoint = (checkpoint: SopCheckpoint) => {
    startSubmit(async () => {
      const result = await submitSopCheckpointAction({
        checkpoint,
        statusDate: today,
        topicText: checkpoint === "TOPIC" ? topicText : undefined,
        scriptText: checkpoint === "SCRIPT" ? scriptText : undefined,
        videoUrl: checkpoint === "VIDEO" ? videoUrl : undefined,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("卡点已提交");

      // 立即用返回的最新状态更新 mine，UI 立刻变化；后台再静默刷新全局数据
      onSubmitted(result.data?.status);
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <div className="rounded-2xl bg-[#FAFAFB] p-6">
        <div className="relative flex justify-between px-2">
          <div className="absolute left-0 top-5 z-0 h-[2px] w-full bg-zinc-300" />
        {MATRIX_CHECKPOINTS.map((cp, idx) => {
          const Icon = cp.icon;
          const status = statuses[cp.id];
          const isActive = idx === currentStep;
          const isDone = status === "APPROVED";
          const isRejected = status === "REJECTED";
          const isOverdue = status === "OVERDUE";
          const isPendingStatus = status === "PENDING";
          const theme = STATUS_THEME[status];
          return (
            <button key={cp.id} onClick={() => onCheckpointChange(cp.id)} className="relative z-10 flex flex-col items-center">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-2xl border-2 transition-all duration-300",
                  isDone
                    ? "border-[#067647] bg-[#067647] text-white shadow-md"
                    : isRejected
                      ? "border-[#FECDCA] bg-[#FEE4E2] text-[#B42318] shadow-md animate-pulse"
                      : isOverdue
                        ? "border-[#B42318] bg-[#B42318] text-white shadow-lg animate-pulse"
                        : isActive
                          ? "scale-110 border-[#D97757] bg-[#D97757] text-white shadow-sm ring-4 ring-[#D97757]/10"
                          : isPendingStatus
                            ? "border-[#FDE68A] bg-[#FEF9C3] text-[#92400E]"
                            : "border-zinc-100 bg-white text-zinc-300",
                )}
              >
                {isDone ? <CheckCircle2 size={20} /> : isRejected ? <AlertCircle size={18} /> : <Icon size={18} />}
              </div>
              <span
                className={cn(
                  "mt-4 text-center text-[12px] font-black uppercase tracking-widest transition-colors",
                  isActive ? "text-zinc-900" : theme.color,
                )}
              >
                {cp.label}
              </span>
            </button>
          );
        })}
        </div>
      </div>

      {activeCheckpoint === "DATA_REPORT" ? (
        <>{dataReport}</>
      ) : activeCheckpoint === "MORNING_REVIEW" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-md">
          <StatusBadge status={statuses.MORNING_REVIEW} />
          <h3 className="mt-4 text-2xl font-black tracking-tight text-zinc-900">早会复盘</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-6 text-zinc-500">
            早会仍按线下执行，页面只记录状态。需要留痕时点击确认即可点亮节点。
          </p>
          <button
            onClick={() => submitCheckpoint("MORNING_REVIEW")}
            disabled={isSubmitting || isPending}
            className="mt-8 rounded-xl bg-zinc-900 px-10 py-3 text-[12px] font-black uppercase tracking-[0.1em] text-white shadow-xl disabled:opacity-50"
          >
            确认早会完成
          </button>
        </div>
      ) : (
      <div className="mt-10 grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-8">
          <div className="space-y-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-md sm:p-10">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <StatusBadge status={activeStatus} />
                <h3 className="text-2xl font-black tracking-tight text-zinc-900">{stageTitle}</h3>
              </div>
              <div className="text-[11px] font-black uppercase text-zinc-400">#{scriptSubmission?.id.slice(0, 8) ?? "DY-SOP"}</div>
            </div>

            <div className="grid gap-4">
              {activeCheckpoint === "TOPIC" || activeCheckpoint === "SCRIPT" ? (
                <textarea
                  value={topicText}
                  onChange={(event) => setTopicText(event.target.value)}
                  className={cn(
                    "w-full resize-none rounded-2xl border border-zinc-200 bg-white p-5 text-sm font-bold leading-relaxed text-zinc-800 tracking-wide transition-all placeholder:text-zinc-400 focus:border-zinc-950/30 focus:ring-1 focus:ring-zinc-950/10 focus:outline-none",
                    activeCheckpoint === "TOPIC" ? "h-56 text-lg" : "h-24",
                  )}
                  placeholder="写选题核心，例如：为什么说今天的反弹不是安全信号？"
                />
              ) : null}

              {activeCheckpoint === "SCRIPT" ? (
                <textarea
                  value={scriptText}
                  onChange={(event) => setScriptText(event.target.value)}
                  className="h-80 w-full resize-none rounded-2xl border border-zinc-200 bg-white p-8 text-lg font-medium italic leading-relaxed text-zinc-800 tracking-wide transition-all placeholder:text-zinc-400 focus:border-zinc-950/30 focus:ring-1 focus:ring-zinc-950/10 focus:outline-none"
                  placeholder="请在此输入 1000-1300 字的脚本详情..."
                />
              ) : null}

              {activeCheckpoint === "VIDEO" ? (
                <input
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 text-base font-bold text-zinc-800 tracking-wide transition-all placeholder:text-zinc-400 focus:border-zinc-950/30 focus:ring-1 focus:ring-zinc-950/10 focus:outline-none"
                  placeholder="粘贴抖音成片链接，审核中心可直接跳转"
                />
              ) : null}
            </div>

            <div className="flex flex-col justify-between gap-4 border-t border-zinc-100 pt-6 sm:flex-row sm:items-center">
              <div className="flex gap-3">
                {activeCheckpoint === "SCRIPT" ? (
                  <button
                    onClick={() => submitCheckpoint("TOPIC")}
                    disabled={isSubmitting || isPending}
                    className="rounded-xl border border-zinc-200 bg-zinc-100 px-5 py-2.5 text-[11px] font-black text-zinc-600 hover:bg-zinc-200 disabled:opacity-50"
                  >
                    同步选题修改
                  </button>
                ) : null}
              </div>
              <button
                  onClick={() => submitCheckpoint(activeCheckpoint)}
                  disabled={isSubmitting || isPending}
                className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-10 py-3 text-[12px] font-black uppercase tracking-[0.1em] text-white shadow-xl disabled:opacity-50"
                >
                确认提交 <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <div className="h-full rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
            <h4 className="mb-8 border-b border-zinc-100 pb-4 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">
              Notifications
            </h4>
            <div className="space-y-5">
              {PRODUCTION_CHECKPOINTS.map((checkpoint) => (
                <div key={checkpoint.id} className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-zinc-400">{checkpoint.label}</span>
                    <StatusBadge status={statuses[checkpoint.id]} minimal />
                  </div>
                  <p className="text-sm font-bold leading-snug text-zinc-700">
                    {STATUS_THEME[statuses[checkpoint.id]].label}
                    {mine?.currentBlocker === checkpoint.id ? " · 当前阻塞节点" : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function DataReportStage({
  accounts,
  selectedAccountId,
  onSelectedAccountChange,
  activeBizDate,
  onActiveBizDateChange,
  userId,
  userDisplayName,
  today,
  todayReports,
  monthReports,
  history,
  accountIds,
  ownContentDirections,
  accountDisplayNameMap,
  hasPendingExemption,
  userExemptionProfile,
  userExemptionGrants,
}: {
  accounts: { id: string; name: string; display_name: string; content_direction: string | null }[];
  selectedAccountId: string;
  onSelectedAccountChange: (accountId: string) => void;
  activeBizDate: string;
  onActiveBizDateChange: (date: string) => void;
  userId: string;
  userDisplayName: string;
  today: string;
  todayReports: TodaySubmissionReportLike[];
  monthReports: Array<Omit<TodaySubmissionReportLike, "account_id"> & { id: string; account_id: string }>;
  history: Array<Omit<TodaySubmissionReportLike, "account_id"> & { id: string; account_id: string }>;
  accountIds: string[];
  ownContentDirections: string[];
  accountDisplayNameMap: Record<string, string>;
  hasPendingExemption: boolean;
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
}) {
  return (
    <div>
      <VideoSubmitPanel
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectedAccountChange={onSelectedAccountChange}
        activeBizDate={activeBizDate}
        onActiveBizDateChange={onActiveBizDateChange}
        userId={userId}
        userDisplayName={userDisplayName}
        today={today}
        todayReports={todayReports}
        monthReports={monthReports}
        history={history}
        accountIds={accountIds}
        ownContentDirections={ownContentDirections}
        accountDisplayNameMap={accountDisplayNameMap}
        hasPendingExemption={hasPendingExemption}
        userExemptionProfile={userExemptionProfile}
        userExemptionGrants={userExemptionGrants}
        embeddedChrome
      />
    </div>
  );
}

function QuickExemptionButton({
  hasPending,
  today,
  submittedDates,
  initialSelectedDates,
}: {
  hasPending: boolean;
  today: string;
  submittedDates: string[];
  initialSelectedDates: string[];
}) {
  return (
    <申请豁免弹窗
      hasPending={hasPending}
      today={today}
      submittedDates={submittedDates}
      initialSelectedDates={initialSelectedDates}
      triggerClassName="!h-8 !min-h-0 rounded-xl border border-zinc-200 bg-white px-2.5 text-[11px] font-black text-zinc-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-white hover:text-zinc-900"
      triggerVariant="button"
      triggerTitle={hasPending ? "审批中" : "申请豁免"}
    />
  );
}

function GlobalMatrix({
  rows,
  onOpenTarget,
}: {
  rows: SopMemberStatus[];
  onOpenTarget: (memberId: string, checkpoint: SopCheckpoint) => void;
}) {
  const riskCount = rows.filter(
    (row) => row.isOverdue || Object.values(row.statuses).some((status) => status === "REJECTED" || status === "OVERDUE"),
  ).length;

  return (
    <div className="space-y-12">
      <div className="flex flex-col justify-between gap-6 px-2 lg:flex-row lg:items-end">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#ABEFC6] bg-[#D1FADF] px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#067647]">
            <Activity size={14} /> Global Efficiency Index
          </div>
          <h2 className="text-4xl font-black tracking-tighter text-zinc-900">全域生产矩阵</h2>
        </div>
        <div className="flex items-center gap-5 rounded-2xl border-2 border-zinc-200 bg-white px-8 py-3 shadow-lg">
          <div className="text-center">
            <span className="mb-1 block text-[10px] font-black uppercase text-zinc-400">产出率</span>
            <span className="text-2xl font-black italic text-zinc-900">{matrixRate(rows)}%</span>
          </div>
          <div className="mx-2 h-8 w-px bg-zinc-200" />
          <div className="text-center">
            <span className="mb-1 block text-[10px] font-black uppercase text-[#B42318]">风险节点</span>
            <span className="text-2xl font-black italic text-[#B42318] underline underline-offset-4">
              {String(riskCount).padStart(2, "0")}
            </span>
          </div>
          <button className="ml-4 rounded-xl bg-zinc-900 p-2 text-white shadow-lg hover:scale-110">
            <Filter size={18} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                <th className="sticky left-0 z-20 border-r border-zinc-100 bg-zinc-50 p-8 text-[11px] font-black uppercase tracking-[0.2em]">
                  Influencer
                </th>
              {MATRIX_CHECKPOINTS.map((cp) => (
                  <th
                    key={cp.id}
                    className="border-r border-zinc-100 p-8 text-center text-[11px] font-black uppercase tracking-[0.2em]"
                  >
                    {cp.label}
                  </th>
                ))}
                <th className="p-8 text-right text-[11px] font-black uppercase tracking-[0.2em]">Metrics</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const hasRisk =
                  row.isOverdue || Object.values(row.statuses).some((status) => status === "REJECTED" || status === "OVERDUE");
                const approvedCount = MATRIX_CHECKPOINTS.filter((checkpoint) => row.statuses[checkpoint.id] === "APPROVED").length;
                return (
                  <tr key={row.userId} className="group border-b border-zinc-50 transition-colors last:border-none hover:bg-zinc-50">
                    <td className="sticky left-0 z-10 border-r border-zinc-100 bg-white p-8 group-hover:bg-zinc-50">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            hasRisk
                              ? "animate-pulse bg-[#B42318] shadow-[0_0_10px_rgba(180,35,24,0.4)]"
                              : "bg-[#067647]",
                          )}
                        />
                        <span className="text-base font-black tracking-tight text-zinc-800">{row.userName || `达人 ${idx + 1}`}</span>
                      </div>
                    </td>
                    {MATRIX_CHECKPOINTS.map((checkpoint) => {
                      const status = row.statuses[checkpoint.id];
                      const Icon =
                        status === "APPROVED"
                          ? CheckCircle2
                          : status === "REJECTED" || status === "OVERDUE"
                            ? AlertCircle
                            : status === "SUBMITTED" || status === "PENDING"
                              ? Activity
                              : null;
                      return (
                        <td key={checkpoint.id} className="border-r border-zinc-50 p-4">
                          <div className="flex justify-center">
                            <button
                              onClick={() => onOpenTarget(row.userId, checkpoint.id)}
                              className={cn(
                                "flex h-12 w-12 items-center justify-center rounded-2xl border-2 transition-transform hover:scale-110",
                                STATUS_THEME[status].cell,
                              )}
                            >
                              {Icon ? <Icon size={20} /> : <div className="h-2 w-2 rounded-full bg-zinc-200" />}
                            </button>
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-8 text-right font-black italic tabular-nums text-zinc-900">
                      {approvedCount}.{row.submissions.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── 组长看板 ── */

function LeaderDashboard({ today, userRole }: { today: string; userRole: "admin" | "owner" }) {
  const [board, setBoard] = useState<{
    members: SopMemberStatus[];
    pendingReviews: Array<{ id: string; user_id: string; checkpoint: string; topic_text: string | null; script_text: string | null; video_url: string | null; review_status: string }>;
    summary: { memberCount: number; dataReportSubmittedCount: number; averagePlayCount: number; averageLikes: number; pendingReviewCount: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; user_id: string; checkpoint: string; topic_text: string | null; script_text: string | null; video_url: string | null } | null>(null);

  const cancelledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBoard = useCallback(async () => {
    // 取消上一个正在进行的请求
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    cancelledRef.current = false;

    let retries = 0;
    const maxRetries = 3;
    const delays = [1000, 2000, 3000];

    const attempt = async (): Promise<void> => {
      if (cancelledRef.current) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/sop/leader-board?statusDate=${today}`, {
          signal: abortControllerRef.current?.signal,
        });
        if (cancelledRef.current) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelledRef.current) return;
        if (data.ok) {
          setBoard(data);
          setError(null);
          return;
        }
        if (data.error) {
          throw new Error(data.error);
        }
      } catch (err) {
        if (cancelledRef.current) return;
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "加载失败";
        if (retries < maxRetries) {
          retries++;
          await new Promise((r) => setTimeout(r, delays[retries - 1]));
          if (cancelledRef.current) return;
          return attempt();
        }
        setError(message);
        setBoard(null);
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    };

    await attempt();
  }, [today]);

  useEffect(() => {
    fetchBoard();
    return () => {
      cancelledRef.current = true;
      abortControllerRef.current?.abort();
    };
  }, [fetchBoard]);

  if (loading && !board) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!board && error) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center">
        <p className="text-sm font-bold text-red-500">加载失败：{error}</p>
        <button
          onClick={() => fetchBoard()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-black text-zinc-500 hover:bg-zinc-50"
        >
          <RefreshCw size={12} /> 重新加载
        </button>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  const overdueMembers = board.members.filter((m) => m.isOverdue || Object.values(m.statuses).some((s) => s === "OVERDUE"));
  const pendingSubmissions = board.pendingReviews;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black tracking-tight text-zinc-900">组长看板</h2>
        <button onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-black text-zinc-500 hover:bg-zinc-50">
          <RefreshCw size={12} /> 刷新
        </button>
      </div>

      {(overdueMembers.length > 0 || pendingSubmissions.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {overdueMembers.length > 0 && (
            <div className="rounded-2xl border border-[#FECDCA] bg-[#FEE4E2] p-5">
              <div className="mb-3 flex items-center gap-2">
                <AlertCircle size={16} className="text-[#B42318]" />
                <span className="text-[11px] font-black uppercase tracking-widest text-[#B42318]">超时未交</span>
              </div>
              {overdueMembers.map((m) => (
                <div key={m.userId} className="text-[13px] font-bold text-[#B42318]">{m.userName}</div>
              ))}
            </div>
          )}
          {pendingSubmissions.length > 0 && (
            <div className="rounded-2xl border border-[#FDE68A] bg-[#FEF9C3] p-5">
              <div className="mb-3 flex items-center gap-2">
                <Activity size={16} className="text-[#92400E]" />
                <span className="text-[11px] font-black uppercase tracking-widest text-[#92400E]">待审核</span>
              </div>
              {pendingSubmissions.slice(0, 5).map((s) => {
                const member = board.members.find((m) => m.userId === s.user_id);
                return (
                  <div key={s.id} className="text-[13px] font-bold text-[#92400E]">
                    {member?.userName ?? "未知"} · {checkpointLabel(s.checkpoint as SopCheckpoint)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                <th className="p-5 text-[11px] font-black uppercase tracking-[0.15em]">组员</th>
                {MATRIX_CHECKPOINTS.map((cp) => (
                  <th key={cp.id} className="p-5 text-center text-[11px] font-black uppercase tracking-[0.15em]">{cp.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.members.map((member) => (
                <tr key={member.userId} className="border-b border-zinc-50 last:border-none hover:bg-zinc-50/50">
                  <td className="p-5 text-[13px] font-black text-zinc-800">{member.userName}</td>
                  {MATRIX_CHECKPOINTS.map((cp) => (
                    <td key={cp.id} className="p-4 text-center">
                      <div className="flex justify-center">
                        <StatusBadge status={member.statuses[cp.id]} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
              {board.members.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-sm font-bold text-zinc-400">暂无组员数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pendingSubmissions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-black tracking-tight text-zinc-900">审核队列</h3>
          <div className="space-y-3">
            {pendingSubmissions.map((s) => {
              const member = board.members.find((m) => m.userId === s.user_id);
              const contentPreview = s.checkpoint === "TOPIC" ? s.topic_text : s.checkpoint === "SCRIPT" ? s.script_text : s.video_url;
              return (
                <div key={s.id} className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-[13px] font-black text-zinc-900">{member?.userName ?? "未知"}</span>
                      <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-black text-zinc-500">{checkpointLabel(s.checkpoint as SopCheckpoint)}</span>
                    </div>
                    <p className="mt-1 truncate text-[12px] text-zinc-500">{contentPreview || "无内容"}</p>
                  </div>
                  <button onClick={() => setSelected(s)} className="shrink-0 rounded-xl bg-zinc-900 px-5 py-2 text-[11px] font-black text-white hover:scale-[1.02]">
                    审核
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <LeaderReport today={today} userRole={userRole} />

      {selected && <ReviewDetailModal submission={selected} onClose={() => setSelected(null)} onReviewed={() => { setSelected(null); window.location.reload(); }} />}
    </div>
  );
}

function ReviewDetailModal({
  submission,
  onClose,
  onReviewed,
}: {
  submission: { id: string; user_id: string; checkpoint: string; topic_text: string | null; script_text: string | null; video_url: string | null };
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [scores, setScores] = useState<SopReviewScores>({ HOOK: 8, VIEWPOINT: 8, COMPLIANCE: 8, PERFORMANCE_HOOK: 8, YESTERDAY_REVIEW: 8, CTA: 8 });
  const [rejectionReason, setRejectionReason] = useState("");
  const [isReviewing, startReview] = useTransition();
  const avg = Object.values(scores).reduce((s, v) => s + v, 0) / REVIEW_DIMENSIONS.length;

  const submit = (forceReject = false) => {
    startReview(async () => {
      const nextScores = forceReject && avg >= 6 ? { HOOK: 5, VIEWPOINT: 5, COMPLIANCE: 5, PERFORMANCE_HOOK: 5, YESTERDAY_REVIEW: 5, CTA: 5 } : scores;
      const result = await reviewSopCheckpointAction({
        submissionId: submission.id,
        scores: nextScores,
        rejectionReason: forceReject || avg < 6 ? rejectionReason || "请按组长反馈修改" : rejectionReason || undefined,
      });
      if (result.error) { toast.error(result.error); return; }
      toast.success(forceReject || avg < 6 ? "已打回" : "已通过");
      onReviewed();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-100 px-8 py-5">
          <h3 className="text-lg font-black tracking-tight text-zinc-900">
            {checkpointLabel(submission.checkpoint as SopCheckpoint)}审核
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-900"><X size={20} /></button>
        </div>

        <div className="space-y-6 p-8">
          {submission.checkpoint === "TOPIC" && (
            <div className="rounded-r-xl border-l-4 border-zinc-900 bg-zinc-50 p-5">
              <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">选题内容</div>
              <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed text-zinc-800">{submission.topic_text || "未填写"}</p>
            </div>
          )}
          {submission.checkpoint === "SCRIPT" && (
            <div className="space-y-4">
              {submission.topic_text && (
                <div className="rounded-r-xl border-l-4 border-zinc-300 bg-zinc-50 p-4">
                  <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">选题</div>
                  <p className="text-sm font-bold text-zinc-700">{submission.topic_text}</p>
                </div>
              )}
              <div className="rounded-r-xl border-l-4 border-zinc-900 bg-zinc-50 p-5">
                <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">脚本文案</div>
                <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed text-zinc-800">{submission.script_text || "未填写"}</p>
              </div>
            </div>
          )}
          {submission.checkpoint === "VIDEO" && (
            <div className="space-y-4">
              {submission.script_text && (
                <div className="rounded-r-xl border-l-4 border-zinc-300 bg-zinc-50 p-4">
                  <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">脚本文案</div>
                  <p className="line-clamp-3 text-sm font-bold text-zinc-700">{submission.script_text}</p>
                </div>
              )}
              {submission.video_url && (
                <a href={submission.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-black text-white hover:scale-[1.02]">
                  打开视频链接 <ArrowUpRight size={16} />
                </a>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-100 p-8">
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            {REVIEW_DIMENSIONS.map((d) => (
              <div key={d.key} className="space-y-2">
                <div className="flex items-end justify-between text-[11px] font-black uppercase text-zinc-400">
                  <span>{d.short}</span>
                  <span className="italic text-zinc-900">{scores[d.key]} / 10</span>
                </div>
                <input type="range" min={0} max={10} value={scores[d.key]}
                  onChange={(e) => setScores((prev) => ({ ...prev, [d.key]: Number(e.target.value) }))}
                  className="w-full accent-zinc-900" />
              </div>
            ))}
          </div>

          <div className="mb-4 flex gap-2">
            {[6, 7, 8].map((s) => (
              <button key={s} onClick={() => setScores({ HOOK: s, VIEWPOINT: s, COMPLIANCE: s, PERFORMANCE_HOOK: s, YESTERDAY_REVIEW: s, CTA: s })}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[10px] font-black text-zinc-500 hover:bg-zinc-100">
                一键 {s} 分
              </button>
            ))}
          </div>

          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="mb-4 h-20 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[12px] text-zinc-600 focus:border-zinc-900 focus:bg-white focus:outline-none"
            placeholder="打回时必须填写原因..."
          />

          <div className="flex justify-end gap-3">
            <button onClick={() => submit(true)} disabled={isReviewing}
              className="rounded-xl border-2 border-zinc-200 px-6 py-2.5 text-[11px] font-black uppercase text-zinc-500 hover:bg-[#FEE4E2] hover:text-[#B42318] disabled:opacity-50">
              打回
            </button>
            <button onClick={() => submit(false)} disabled={isReviewing}
              className="rounded-xl bg-zinc-900 px-8 py-2.5 text-[11px] font-black uppercase text-white shadow-xl hover:scale-[1.03] disabled:opacity-50">
              通过
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 组长日报 ── */

function LeaderReport({ today, userRole }: { today: string; userRole: "admin" | "owner" }) {
  const [fields, setFields] = useState({ topic: "", opening: "", script: "", video: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"draft" | "submitted" | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/leader-report?statusDate=${today}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !data.ok) return;
        const myReport = data.reports?.[0]?.report ?? data.reports?.[0] ?? null;
        if (myReport) {
          setFields({
            topic: myReport.topic_feedback ?? "",
            opening: myReport.opening_feedback ?? "",
            script: myReport.script_feedback ?? "",
            video: myReport.video_feedback ?? "",
          });
        }
      } catch {} finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [today]);

  const save = async (isDraft: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/leader-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusDate: today, topicFeedback: fields.topic, openingFeedback: fields.opening, scriptFeedback: fields.script, videoFeedback: fields.video, isDraft }),
      });
      const data = await res.json();
      if (!data.ok) { toast.error(data.error ?? "保存失败"); return; }
      setSaved(isDraft ? "draft" : "submitted");
      toast.success(isDraft ? "草稿已保存" : "日报已提交");
    } catch { toast.error("网络错误"); } finally { setSaving(false); }
  };

  if (loading) return null;

  const feedbackFields = [
    { key: "topic" as const, label: "选题反馈", desc: "今日组内选题方向亮点/问题" },
    { key: "opening" as const, label: "开头反馈", desc: "哪条开头写得好/有问题" },
    { key: "script" as const, label: "脚本文案反馈", desc: "组内整体写作水平观察" },
    { key: "video" as const, label: "视频反馈", desc: "成片质量观察、案例" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black tracking-tight text-zinc-900">今日日报</h3>
        {saved && <span className={cn("text-[11px] font-black", saved === "submitted" ? "text-[#067647]" : "text-[#92400E]")}>{saved === "submitted" ? "已提交" : "草稿已保存"}</span>}
      </div>

      <div className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6">
        {feedbackFields.map((f) => (
          <div key={f.key}>
            <label className="mb-1.5 block text-[11px] font-black uppercase tracking-widest text-zinc-400">{f.label}</label>
            <p className="mb-2 text-[10px] text-zinc-400">{f.desc}</p>
            <textarea
              value={fields[f.key]}
              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="h-24 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-bold leading-relaxed text-zinc-800 transition-all placeholder:text-zinc-300 focus:border-zinc-300 focus:bg-white focus:outline-none"
              placeholder={`填写${f.label}...`}
            />
          </div>
        ))}

        <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
          <button onClick={() => save(true)} disabled={saving}
            className="rounded-xl border border-zinc-200 bg-white px-6 py-2.5 text-[11px] font-black text-zinc-500 hover:bg-zinc-50 disabled:opacity-50">
            保存草稿
          </button>
          <button onClick={() => save(false)} disabled={saving}
            className="rounded-xl bg-zinc-900 px-8 py-2.5 text-[11px] font-black text-white shadow-xl hover:scale-[1.03] disabled:opacity-50">
            正式提交
          </button>
        </div>
      </div>

      {userRole === "owner" && <OwnerReportList today={today} />}
    </div>
  );
}

function OwnerReportList({ today }: { today: string }) {
  const [groups, setGroups] = useState<Array<{
    groupId: string; groupName: string; leaderName: string | null; status: string;
    report: { topic_feedback: string | null; opening_feedback: string | null; script_feedback: string | null; video_feedback: string | null; submitted_at: string | null } | null;
  }>>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/leader-report?statusDate=${today}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.ok) setGroups(data.reports ?? []);
      } catch {} finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [today]);

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  if (loading || groups.length === 0) return null;

  const statusLabel = (status: string) => status === "SUBMITTED" ? "已提交" : status === "DRAFT" ? "草稿" : "未提交";
  const statusColor = (status: string) => status === "SUBMITTED" ? "text-[#067647]" : status === "DRAFT" ? "text-[#92400E]" : "text-[#B42318]";

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-black tracking-tight text-zinc-900">组长日报一览</h3>
      {groups.map((g) => (
        <div key={g.groupId} className="rounded-2xl border border-zinc-200 bg-white">
          <button onClick={() => toggle(g.groupId)} className="flex w-full items-center justify-between p-5 text-left">
            <div>
              <span className="text-[13px] font-black text-zinc-900">{g.groupName}</span>
              {g.leaderName && <span className="ml-2 text-[12px] text-zinc-400">· {g.leaderName}</span>}
            </div>
            <div className="flex items-center gap-3">
              <span className={cn("text-[11px] font-black", statusColor(g.status))}>{statusLabel(g.status)}</span>
              {expanded.has(g.groupId) ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
            </div>
          </button>
          {expanded.has(g.groupId) && g.report && (
            <div className="space-y-4 border-t border-zinc-100 px-5 pb-5 pt-4">
              {[
                { label: "选题", text: g.report.topic_feedback },
                { label: "开头", text: g.report.opening_feedback },
                { label: "脚本文案", text: g.report.script_feedback },
                { label: "视频", text: g.report.video_feedback },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">{item.label}</div>
                  <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed text-zinc-700">{item.text || "未填写"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function emptyStatuses(): Record<SopCheckpoint, SopCheckpointStatus> {
  return {
    DATA_REPORT: "IDLE",
    MORNING_REVIEW: "IDLE",
    TOPIC: "IDLE",
    SCRIPT: "IDLE",
    VIDEO: "IDLE",
  };
}

function emptyMember(today: string): SopMemberStatus {
  return {
    userId: "",
    userName: "",
    teamId: null,
    groupId: null,
    statusDate: today,
    statuses: emptyStatuses(),
    currentBlocker: "DATA_REPORT",
    isOverdue: false,
    submissions: [],
  };
}
