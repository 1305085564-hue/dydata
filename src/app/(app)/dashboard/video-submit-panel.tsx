"use client";


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, FilePenLine, History, Lock, PencilLine, ShieldAlert, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { SubmissionCalendar } from "@/components/submission/submission-calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { Video, VideoTagReviewDimension } from "@/types";
import {
  getExemptionDatesForMonth,
  getExemptionStateForDate,
  type ExemptionGrantLike,
  type ExemptionProfileLike,
} from "@/lib/豁免";
import { DashboardForm, type DashboardReportData } from "./dashboard-form";
import {
  getDashboardMetricGridClass,
  getDashboardStatusClass,
} from "./dashboard-visuals";
import { HistoryList } from "./history-list";
import { VideoSubmitForm } from "./video-submit-form";
import {
  getTodaySubmissionSummary,
  resolveSubmissionDayStatus,
  resolveSubmitPanelMode,
  type SubmitPanelRequestedMode,
  type TodaySubmissionReportLike,
} from "./video-submit-panel-state";

import { cn } from "@/lib/utils";
import { CheckpointTracker, type CheckpointStatus } from "./checkpoint-tracker";

type MonthReport = Omit<TodaySubmissionReportLike, "account_id"> & {
  id: string;
  account_id: string;
};

type AsyncActivityData = {
  historyReports: MonthReport[];
  isActivityLoading: boolean;
};

const formatDateTime = (isoString: string | null | undefined) => {
  if (!isoString) return "暂无";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm}`;
  } catch {
    return isoString;
  }
};

interface VideoSubmitPanelProps {
  accounts: { id: string; name: string; display_name: string; content_direction: string | null }[];
  userId: string;
  userDisplayName: string;
  today: string;
  todayReports: TodaySubmissionReportLike[];
  monthReports: MonthReport[];
  history: MonthReport[];
  accountIds: string[];
  ownContentDirections: string[];
  accountDisplayNameMap: Record<string, string>;
  hasPendingExemption?: boolean;
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
  embeddedChrome?: boolean;
  selectedAccountId?: string;
  onSelectedAccountChange?: (accountId: string) => void;
  activeBizDate?: string;
  onActiveBizDateChange?: (date: string) => void;
}

function toDashboardReportData(report: MonthReport): DashboardReportData {
  return {
    id: report.id,
    account_id: report.account_id,
    title: report.title ?? "",
    report_date: report.report_date,
    play_count: report.play_count,
    completion_rate: report.completion_rate,
    avg_play_duration: report.avg_play_duration,
    bounce_rate_2s: report.bounce_rate_2s,
    completion_rate_5s: report.completion_rate_5s,
    likes: report.likes ?? 0,
    comments: report.comments ?? 0,
    shares: report.shares ?? 0,
    favorites: report.favorites ?? 0,
    follower_gain: report.follower_gain ?? 0,
    follower_convert: report.follower_convert ?? null,
    content: report.content ?? null,
    published_at: report.published_at,
    uploaded_at: report.uploaded_at ?? "",
  };
}

function toOverrideReport(summaryOverride: TodaySubmissionReportLike): MonthReport | null {
  if (!summaryOverride.account_id) return null;

  return {
    id: `override-${summaryOverride.account_id}-${summaryOverride.report_date}`,
    account_id: summaryOverride.account_id,
    title: summaryOverride.title,
    content: summaryOverride.content ?? null,
    report_date: summaryOverride.report_date,
    play_count: summaryOverride.play_count,
    likes: summaryOverride.likes,
    comments: summaryOverride.comments,
    shares: summaryOverride.shares,
    favorites: summaryOverride.favorites,
    follower_gain: summaryOverride.follower_gain,
    follower_convert: summaryOverride.follower_convert,
    completion_rate: summaryOverride.completion_rate,
    avg_play_duration: summaryOverride.avg_play_duration,
    bounce_rate_2s: summaryOverride.bounce_rate_2s,
    completion_rate_5s: summaryOverride.completion_rate_5s,
    published_at: summaryOverride.published_at,
    uploaded_at: summaryOverride.uploaded_at,
  };
}

export function VideoSubmitPanel({
  accounts,
  userId,
  today,
  todayReports,
  monthReports,
  history,
  accountDisplayNameMap,
  hasPendingExemption = false,
  userExemptionProfile,
  userExemptionGrants,
  embeddedChrome = false,
  selectedAccountId: controlledSelectedAccountId,
  onSelectedAccountChange,
  activeBizDate: controlledActiveBizDate,
  onActiveBizDateChange,
}: VideoSubmitPanelProps) {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const handleGoToGrowth = useCallback(() => {
    setIsRedirecting(true);
    setTimeout(() => {
      router.push("/growth");
    }, 800);
  }, [router]);
  const formAnchorRef = useRef<HTMLDivElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [internalSelectedAccountId, setInternalSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [requestedMode, setRequestedMode] = useState<SubmitPanelRequestedMode>(null);
  const [internalActiveBizDate, setInternalActiveBizDate] = useState(today);
  const [activeCheckpointId, setActiveCheckpointId] = useState(1);
  const [isDataViewOpen, setIsDataViewOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isExempting, setIsExempting] = useState(false);
  const [watchConclusion, setWatchConclusion] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<MonthReport | null>(null);
  const [submittedViewActive, setSubmittedViewActive] = useState(false);
  const [reportOverrides, setReportOverrides] = useState<Record<string, TodaySubmissionReportLike>>({});
  const [pendingBackfillDate, setPendingBackfillDate] = useState<string | null>(null);
  const [pendingFocusDate, setPendingFocusDate] = useState<string | null>(null);
  const [activityData, setActivityData] = useState<AsyncActivityData | null>(null);
  const [dismissedPendingExemption, setDismissedPendingExemption] = useState(() => {
    try {
      const raw = window.localStorage.getItem("dydata:dismissed-pending-exemption");
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.date === today;
      }
    } catch {}
    return false;
  });
  const selectedAccountId = controlledSelectedAccountId ?? internalSelectedAccountId;
  const activeBizDate = controlledActiveBizDate ?? internalActiveBizDate;
  const violationSubmitHref = selectedAccountId
    ? `/violations/submit?account_id=${encodeURIComponent(selectedAccountId)}&prefill=1`
    : "/violations/submit";
  const setSelectedAccountId = useCallback(
    (accountId: string) => {
      setInternalSelectedAccountId(accountId);
      onSelectedAccountChange?.(accountId);
    },
    [onSelectedAccountChange],
  );
  const setActiveBizDate = useCallback(
    (date: string) => {
      setInternalActiveBizDate(date);
      onActiveBizDateChange?.(date);
    },
    [onActiveBizDateChange],
  );


  useEffect(() => {
    if ((!isDataViewOpen && !isHistoryOpen) || activityData) return;
    fetch("/api/dashboard/activity")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.monthReports) && Array.isArray(data.history)) {
          setActivityData({
            monthSubmittedDates: Array.isArray(data.monthSubmittedDates) ? data.monthSubmittedDates : [],
            monthReports: data.monthReports,
            history: data.history,
          });
        }
      })
      .catch(() => {});
  }, [activityData, isDataViewOpen, isHistoryOpen]);

  useEffect(() => {
    if (!hasPendingExemption) {
      setDismissedPendingExemption(false);
      try {
        window.localStorage.removeItem("dydata:dismissed-pending-exemption");
      } catch {}
    }
  }, [hasPendingExemption]);

  useEffect(() => {
    if (!embeddedChrome) return;

    function handleExternalAction(event: Event) {
      const action = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (action === "data-view") setIsDataViewOpen(true);
      if (action === "history") setIsHistoryOpen(true);
    }

    window.addEventListener("dydata-dashboard-action", handleExternalAction);
    return () => window.removeEventListener("dydata-dashboard-action", handleExternalAction);
  }, [embeddedChrome]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId],
  );

  const mergedTodayReports = useMemo(() => {
    const overrideEntries = Object.values(reportOverrides).filter((report) => report.report_date === today);
    const filteredBase = todayReports.filter(
      (report) =>
        !overrideEntries.some(
          (override) => override.account_id === report.account_id && override.report_date === report.report_date,
        ),
    );
    return [...overrideEntries, ...filteredBase];
  }, [reportOverrides, today, todayReports]);

  const mergedMonthReports = useMemo(() => {
    const overrideReports = Object.values(reportOverrides)
      .map((report) => toOverrideReport(report))
      .filter((report): report is MonthReport => Boolean(report));
    const overrideKeys = new Set(overrideReports.map((report) => `${report.account_id}-${report.report_date}`));

    return [
      ...overrideReports,
      ...(activityData?.monthReports ?? monthReports).filter(
        (report) => !overrideKeys.has(`${report.account_id}-${report.report_date}`),
      ),
    ];
  }, [activityData?.monthReports, monthReports, reportOverrides]);

  const selectedSummary = useMemo(
    () => (selectedAccount ? getTodaySubmissionSummary(mergedTodayReports, selectedAccount.id) : null),
    [mergedTodayReports, selectedAccount],
  );

  const [isLate, setIsLate] = useState(false);
  useEffect(() => {
    const check = () => {
      const now = new Date();
      setIsLate(now.getHours() > 11 || (now.getHours() === 11 && now.getMinutes() >= 15));
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, []);

  const checkpoints = useMemo(() => {
    const isDataReported = mergedTodayReports.some((report) => report.account_id === selectedAccountId);
    const dataStatus: CheckpointStatus = isDataReported ? "done" : isLate ? "late" : "pending";

    return [
      { id: 1, name: "数据上报", time: "11:00", status: dataStatus },
      { id: 2, name: "早盘早会", time: "11:15", status: "idle" as CheckpointStatus, isPlaceholder: true },
      { id: 3, name: "选题第一关", time: "15:00", status: "idle" as CheckpointStatus, isPlaceholder: true },
      { id: 4, name: "文案第二关", time: "18:00", status: "idle" as CheckpointStatus, isPlaceholder: true },
      { id: 5, name: "审片发布", time: "20:00", status: "idle" as CheckpointStatus, isPlaceholder: true },
    ];
  }, [mergedTodayReports, selectedAccountId, isLate]);

  const monthExemptionDates = useMemo(
    () => getExemptionDatesForMonth(userExemptionProfile, today, userExemptionGrants),
    [today, userExemptionGrants, userExemptionProfile],
  );


  const activeDateReport = useMemo(
    () =>
      mergedMonthReports
        .filter((report) => report.report_date === activeBizDate && report.account_id === selectedAccountId)
        .sort((left, right) => (right.uploaded_at ?? "").localeCompare(left.uploaded_at ?? ""))[0] ?? null,
    [activeBizDate, mergedMonthReports, selectedAccountId],
  );

  const submittedDates = useMemo(
    () =>
      Array.from(
        new Set(
          mergedMonthReports
            .filter((report) => report.account_id === selectedAccountId)
            .map((report) => report.report_date)
            .filter(Boolean),
        ),
      ),
    [mergedMonthReports, selectedAccountId],
  );
  const historyReports = activityData?.history ?? history;
  const isActivityLoading = (isDataViewOpen || isHistoryOpen) && !activityData;

  const isTodayFlow = activeBizDate === today;
  const primarySummary = isTodayFlow ? selectedSummary : null;
  const primaryRequestedMode = isTodayFlow ? requestedMode : "backfill";
  const primaryMode = resolveSubmitPanelMode({
    summary: primarySummary,
    requestedMode: primaryRequestedMode,
  });
  const isPrimarySummaryMode = primaryMode === "summary";
  const activeExemptionState = useMemo(
    () => getExemptionStateForDate(userExemptionProfile, activeBizDate, userExemptionGrants),
    [activeBizDate, userExemptionGrants, userExemptionProfile],
  );
  const activeDateStatus = useMemo(
    () =>
      resolveSubmissionDayStatus({
        date: activeBizDate,
        today,
        report: activeDateReport,
        exemption: activeExemptionState,
      }),
    [activeBizDate, activeDateReport, activeExemptionState, today],
  );
  const shouldShowBlockedStateCard = activeDateStatus.state === "waive" || activeDateStatus.state === "leave";
  const isPermanentExemption = activeExemptionState.isExempt && activeExemptionState.type === "permanent";
  const shouldHideFormForExemption = shouldShowBlockedStateCard && !isPermanentExemption;
  useEffect(() => {
    if (!pendingBackfillDate || isDataViewOpen) return;
    if (activeBizDate !== pendingBackfillDate || primaryMode !== "backfill") return;

    const timeoutId = window.setTimeout(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formAnchorRef.current
        ?.querySelector<HTMLElement>("input, textarea, button, [tabindex]")
        ?.focus({ preventScroll: true });
      setPendingBackfillDate(null);
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [activeBizDate, isDataViewOpen, pendingBackfillDate, primaryMode]);

  useEffect(() => {
    if (!pendingFocusDate || isDataViewOpen) return;
    if (activeBizDate !== pendingFocusDate) return;

    const timeoutId = window.setTimeout(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formAnchorRef.current
        ?.querySelector<HTMLElement>("input, textarea, button, [tabindex]")
        ?.focus({ preventScroll: true });
      setPendingFocusDate(null);
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [activeBizDate, isDataViewOpen, pendingFocusDate]);


  function selectBizDate(date: string) {
    if (!date) return;
    setActiveBizDate(date);
    setRequestedMode(null);
  }

  function openDatePicker() {
    if (dateInputRef.current?.showPicker) {
      dateInputRef.current.showPicker();
      return;
    }

    dateInputRef.current?.focus();
  }

  function handleSubmitted(
    _video: Video,
    _aiTags: Array<{
      tag_dimension: VideoTagReviewDimension;
      tag_value: string;
      confidence: number | null;
      reason: string | null;
    }>,
    summaryOverride?: TodaySubmissionReportLike | null,
  ) {
    if (summaryOverride?.account_id) {
      setReportOverrides((current) => ({
        ...current,
        [`${summaryOverride.account_id}-${summaryOverride.report_date}`]: summaryOverride,
      }));
      setActiveBizDate(summaryOverride.report_date);
    }

    setSubmittedViewActive(true);
    setRequestedMode(null);
    setIsDataViewOpen(false);
  }

  function dismissPendingExemption() {
    setDismissedPendingExemption(true);
    try {
      window.localStorage.setItem("dydata:dismissed-pending-exemption", JSON.stringify({ date: today }));
    } catch {}
  }

  function openBackfillForDate(date: string) {
    setActiveBizDate(date);
    setRequestedMode("backfill");
    setIsDataViewOpen(false);
    setPendingBackfillDate(date);
    setPendingFocusDate(date);
  }

  function getReportForDate(date: string) {
    return (
      mergedMonthReports
        .filter((report) => report.report_date === date && report.account_id === selectedAccountId)
        .sort((left, right) => (right.uploaded_at ?? "").localeCompare(left.uploaded_at ?? ""))[0] ?? null
    );
  }

  function openSubmittedDate(date: string) {
    setActiveBizDate(date);
    setIsDataViewOpen(false);
    setPendingFocusDate(date);

    if (date === today && selectedSummary) {
      setRequestedMode("editToday");
      return;
    }

    const matchedReport = getReportForDate(date);
    if (matchedReport) {
      setRequestedMode(null);
      setEditingReport(matchedReport);
    }
  }

  function jumpFromDataView(date: string) {
    const dateReport = getReportForDate(date);
    const dateExemptionState = getExemptionStateForDate(
      userExemptionProfile,
      date,
      userExemptionGrants,
    );
    const dateStatus = resolveSubmissionDayStatus({
      date,
      today,
      report: date === today ? selectedSummary : dateReport,
      exemption: dateExemptionState,
    });

    if (dateStatus.state === "submitted") {
      openSubmittedDate(date);
      return;
    }

    if (dateStatus.canBackfill) {
      openBackfillForDate(date);
      return;
    }

    setActiveBizDate(date);
    setRequestedMode(null);
    setIsDataViewOpen(false);
    setPendingFocusDate(date);
  }

  function handleHistoryReportOpen(report: {
    id: string;
    account_id: string;
    report_date: string;
    title: string | null;
    play_count: number | null;
    completion_rate: string | null;
    avg_play_duration: string | null;
    bounce_rate_2s: string | null;
    completion_rate_5s: string | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    favorites: number | null;
    follower_gain: number | null;
    follower_convert: number | null;
    content: string | null;
    published_at: string | null;
    uploaded_at: string | null;
  }) {
    setSelectedAccountId(report.account_id);
    setActiveBizDate(report.report_date);
    setRequestedMode(null);
    setIsHistoryOpen(false);
    setPendingFocusDate(report.report_date);
    setEditingReport(report);
  }

  const handleApplyExemption = useCallback(async (date: string) => {
    if (!selectedAccountId) {
      toast.error("未选择有效账号");
      return;
    }
    setIsExempting(true);
    try {
      const response = await fetch("/api/exemptions/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccountId,
          exemption_type: "single",
          start_date: date,
          end_date: null,
          reason: "当日未产出/漏交补报申请",
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "豁免申请失败，请稍后重试");
      }

      toast.success("豁免申请提交成功，请等待管理员审批");
      setIsDataViewOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "豁免申请发生异常");
    } finally {
      setIsExempting(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (!selectedAccountId) return;
    setWatchConclusion(null);
    fetch(`/api/dashboard/watch-overview?account_id=${selectedAccountId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.conclusion) {
          setWatchConclusion(data.conclusion);
        }
      })
      .catch((err) => console.error("Failed to fetch watch overview", err));
  }, [selectedAccountId]);

  if (!accounts.length) {
    return (
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="px-6 py-5 text-[13px] text-stone-500">
          当前没有可提交的数据账号，请联系管理员分配账号后再继续操作。
        </div>
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-5"
      >
        <Card className={cn(
          "mx-auto overflow-hidden",
          embeddedChrome
            ? "max-w-3xl rounded-none border-none bg-transparent shadow-none"
            : "max-w-6xl rounded-2xl border border-stone-200 bg-white",
        )}>
          {!embeddedChrome ? (
          <CardHeader className="space-y-0 border-b border-stone-200 bg-[var(--color-bg)] p-0">
            <div className="space-y-4 px-6 py-6 sm:px-8 sm:py-6">
              <div className="flex items-center justify-between">
                <h2 className="text-[24px] font-medium tracking-tight text-stone-900">今日提交</h2>
                {watchConclusion && (
                  <div className="text-[13px] text-stone-500 max-w-sm text-right">
                    {watchConclusion}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-stone-200 bg-[var(--color-bg)] px-4 py-4">
                <div className={cn("mb-5 flex flex-col gap-3 border-b border-stone-200 pb-5 sm:flex-row sm:items-end sm:justify-between", embeddedChrome && "hidden")}>
                  <div className="space-y-1">
                    <div className="text-[12px] font-medium uppercase tracking-[0.22em] text-stone-500">今天</div>
                    <button
                      type="button"
                      onClick={openDatePicker}
                      className="group inline-flex items-center gap-2 rounded-lg px-0 py-1 text-left transition-opacity duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:opacity-80"
                      aria-label="选择填报日期"
                    >
                      <span className="text-[24px] font-medium tabular-nums tracking-tight text-stone-900">
                        {activeBizDate}
                      </span>
                      <CalendarDays className="size-5 stroke-[1.5] text-[#D97757]" />
                    </button>
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={activeBizDate}
                      max={today}
                      onChange={(event) => selectBizDate(event.target.value)}
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <div className="text-[12px] font-medium text-stone-500">
                      {activeBizDate === today ? "今日填报" : "历史补填"}
                    </div>
                    <a href={violationSubmitHref}>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 border-stone-200 bg-white px-3 text-[12px] font-medium text-stone-700 hover:bg-stone-50"
                      >
                        <ShieldAlert className="size-4 stroke-[1.5] text-[#D99E55]" />
                        收录违规
                      </Button>
                    </a>
                  </div>
                </div>
                <CheckpointTracker
                  checkpoints={checkpoints}
                  activeId={activeCheckpointId}
                  onCheckpointClick={(id) => {
                    setActiveCheckpointId(id);
                  }}
                />
              </div>
            </div>
          </CardHeader>
          ) : null}

          <CardContent
            className={cn(
              "min-h-[520px] space-y-6",
              embeddedChrome
                ? "bg-transparent px-0 pb-0 pt-0"
                : "bg-white px-5 py-6 sm:px-8 sm:py-8",
            )}
          >
            <div ref={formAnchorRef} tabIndex={-1} className="outline-none" />
            {activeCheckpointId === 1 ? (
              <>
            {hasPendingExemption && !dismissedPendingExemption && (
              <div className="rounded-2xl border border-stone-200 border-l-[2px] border-l-[#D99E55] bg-stone-50 p-4 text-[13px] text-stone-700">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D99E55] bg-white px-2.5 py-1 text-[12px] font-medium text-[#D99E55]">
                        <Clock className="size-3.5 stroke-[1.5]" />
                        申请审批中
                      </span>
                    </div>
                    <p className="text-[12px] leading-[1.7] text-stone-500">
                      你的豁免申请正在等待管理员审批，审批结果将在这里更新。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={dismissPendingExemption}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 text-[12px] font-medium text-stone-500 transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-stone-300 hover:bg-stone-50 hover:text-stone-700 active:translate-y-0 focus-visible:ring-1 focus-visible:ring-stone-900/5"
                  >
                    <X className="size-3.5 stroke-[1.5]" />
                    关闭
                  </button>
                </div>
              </div>
            )}

            {primarySummary && isPrimarySummaryMode && !submittedViewActive ? (
              <motion.div 
                initial={{ scale: 0.96, opacity: 0, backgroundColor: "#6FAA7D0A" }}
                animate={{ scale: 1, opacity: 1, backgroundColor: "#FAFAF9" }}
                transition={{ 
                  scale: { type: "spring", stiffness: 300, damping: 24 },
                  opacity: { duration: 0.2 },
                  backgroundColor: { duration: 1.5, delay: 0.2 }
                }}
                className="relative overflow-hidden rounded-2xl border border-stone-200/80 bg-gradient-to-br from-white to-stone-50/50 p-6 text-[13px] text-stone-700 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)] animate-[fadeIn_0.5s_ease-out]"
              >
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between relative z-10">
                  <div className="space-y-4 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#6FAA7D]/30 bg-[#6FAA7D]/5 px-2.5 py-1 text-[12px] font-medium text-[#6FAA7D]">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-[#6FAA7D]/60 animate-ping opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#6FAA7D]" />
                        </span>
                        今日数据已提交
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-[14px] font-semibold text-stone-800">
                        {primarySummary.title?.trim() || "未填写视频标题"}
                      </div>
                      <div className="text-[12px] leading-[1.7] text-stone-400" suppressHydrationWarning>
                        提交时间：{formatDateTime(primarySummary.uploadedAt)}
                        <span className="mx-2 text-stone-300">·</span>
                        发布时间：{formatDateTime(primarySummary.publishedAt)}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div className="rounded-2xl border border-stone-200/40 bg-stone-50/50 p-4 transition-all hover:bg-stone-50/80">
                        <div className="text-[11.5px] font-medium uppercase tracking-wider text-stone-400">播放量</div>
                        <div className="mt-1.5 text-[20px] font-semibold tracking-tight tabular-nums text-stone-800 font-mono">
                          {primarySummary.playCount !== null && primarySummary.playCount !== undefined 
                            ? Number(primarySummary.playCount).toLocaleString("zh-CN") 
                            : "--"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-stone-200/40 bg-stone-50/50 p-4 transition-all hover:bg-stone-50/80">
                        <div className="text-[11.5px] font-medium uppercase tracking-wider text-stone-400">互动总量</div>
                        <div className="mt-1.5 text-[20px] font-semibold tracking-tight tabular-nums text-stone-800 font-mono">
                          {((primarySummary.likes ?? 0) +
                            (primarySummary.comments ?? 0) +
                            (primarySummary.shares ?? 0) +
                            (primarySummary.favorites ?? 0)).toLocaleString("zh-CN")}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-stone-200/40 bg-stone-50/50 p-4 transition-all hover:bg-stone-50/80">
                        <div className="text-[11.5px] font-medium uppercase tracking-wider text-stone-400">涨粉</div>
                        <div className="mt-1.5 text-[20px] font-semibold tracking-tight tabular-nums text-stone-800 font-mono">
                          {primarySummary.followerGain !== null && primarySummary.followerGain !== undefined 
                            ? Number(primarySummary.followerGain).toLocaleString("zh-CN") 
                            : "--"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-stone-200/40 bg-stone-50/50 p-4 transition-all hover:bg-stone-50/80">
                        <div className="text-[11.5px] font-medium uppercase tracking-wider text-stone-400">完播率</div>
                        <div className="mt-1.5 text-[20px] font-semibold tracking-tight tabular-nums text-stone-800 font-mono">
                          {primarySummary.completionRate ?? "--"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-3 lg:w-[200px]">
                    <Button
                      type="button"
                      className="h-10 w-full rounded-xl bg-[#D97757] hover:bg-[#C96442] text-white text-[13px] font-medium transition-all duration-150 flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                      onClick={handleGoToGrowth}
                    >
                      去查看我的成长与大盘数据 🚀
                    </Button>
                    <a href={violationSubmitHref} className="w-full">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full rounded-xl border-stone-200 bg-white text-[13px] font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-700 transition-colors duration-150"
                      >
                        <ShieldAlert className="size-4 stroke-[1.5] text-[#D99E55]" />
                        收录违规
                      </Button>
                    </a>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl border-stone-200 bg-white text-[13px] font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-700 transition-colors duration-150"
                      onClick={() => setRequestedMode("editToday")}
                    >
                      <PencilLine className="size-4 stroke-[1.5]" />
                      修改今日数据
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : null}



            {selectedAccount && shouldShowBlockedStateCard ? (
              <div
                className={cn(
                  "rounded-2xl border p-4 text-[13px] sm:p-5",
                  activeDateStatus.state === "waive"
                    ? "border-stone-200 border-l-[2px] border-l-[#6FAA7D] bg-white text-stone-700"
                    : "border-stone-200 border-l-[2px] border-l-[#D99E55] bg-stone-50 text-stone-700",
                )}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <span className={getDashboardStatusClass(activeDateStatus.tone)}>
                      <FilePenLine className="size-4 stroke-[1.5]" />
                      {activeBizDate === today ? `今日${activeDateStatus.label}` : `${activeDateStatus.label}状态`}
                    </span>
                    <div className="space-y-1">
                      <div className="text-[18px] font-medium text-stone-700">
                        {activeBizDate} 已标记为{activeDateStatus.label}
                      </div>
                      <p className="text-[13px] leading-[1.7] text-stone-500">
                        {activeDateStatus.description}
                      </p>
                    </div>
                    {activeExemptionState.reason ? (
                      <p className="text-[13px] leading-[1.7] text-stone-500">
                        原因：{activeExemptionState.reason}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {selectedAccount && !shouldHideFormForExemption && (!isPrimarySummaryMode || activeBizDate !== today || submittedViewActive) ? (
              <VideoSubmitForm
                key={`form-${selectedAccount.id}-${activeBizDate}`}
                account={selectedAccount}
                userId={userId}
                today={today}
                mode={primaryMode}
                initialSummary={submittedViewActive ? null : (primaryMode === "backfill" ? null : primarySummary)}
                initialBizDate={activeBizDate}
                submittedViewActive={submittedViewActive}
                onSubmitted={handleSubmitted}
                onCancel={() => {
                  setSubmittedViewActive(false);
                  setRequestedMode(null);
                }}
                onRequestEdit={() => {
                  setSubmittedViewActive(false);
                  if (activeDateReport) {
                    setEditingReport(activeDateReport);
                  }
                }}
              />
            ) : null}
              </>
            ) : (
              <motion.div
                key={`checkpoint-placeholder-${activeCheckpointId}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50 px-6 py-20 text-center"
              >
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500">
                  <Lock className="size-10 stroke-[1.5]" />
                </div>
                <h4 className="text-[18px] font-medium tracking-tight text-stone-900">
                  卡点 {activeCheckpointId} 记录模块
                </h4>
                <p className="mt-2 max-w-xs text-[12px] font-medium uppercase leading-relaxed tracking-widest text-stone-500">
                  目前暂为线下执行环节
                  <br />
                  <span className="text-stone-700">Phase 2: 全量数据实时同步开发中</span>
                </p>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={isDataViewOpen} onOpenChange={setIsDataViewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>数据查看</DialogTitle>
          </DialogHeader>

          {isActivityLoading ? (
            <div className="flex h-40 items-center justify-center text-[13px] text-stone-500">
              加载填报记录...
            </div>
          ) : (
          <div className="space-y-4">
            <SubmissionCalendar
              today={today}
              submittedDates={submittedDates}
              waiveDates={monthExemptionDates.waiveDates}
              leaveDates={monthExemptionDates.leaveDates}
              selectedDate={activeBizDate}
              onDateSelect={(date) => jumpFromDataView(date)}
            />

            {false ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-stone-500">
                    每日详情
                  </p>
                  <h3 className="text-[18px] font-medium tracking-tight text-stone-900">
                    {activeBizDate} 的提交情况
                  </h3>
                  <p className="text-[13px] leading-6 text-stone-500">
                    选择日期后，可查看当日状态；免交和请假会独立展示，不再落入未交/漏交逻辑。
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={getDashboardStatusClass(activeDateStatus.tone)}
                >
                  {activeDateStatus.label}
                </Badge>
              </div>

              {activeDateStatus.state === "submitted" && activeDateReport ? (
                <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div>
                        <p className="text-[12px] text-stone-500">
                          {accounts.find((account) => account.id === activeDateReport.account_id)?.display_name ?? "当前账号"}
                        </p>
                        <h4 className="text-[18px] font-medium text-stone-900">
                          {activeDateReport.title?.trim() || "未填写视频标题"}
                        </h4>
                        <p className="mt-1 text-[12px] text-stone-500">
                          提交时间：{activeDateReport.uploaded_at || "暂无"}
                        </p>
                      </div>

                      <div className={getDashboardMetricGridClass("secondary")}>
                        <div className="dashboard-metric-card">
                          <div className="text-[12px] text-stone-500">播放量</div>
                          <div className="text-[13px] font-medium text-stone-700 tabular-nums">
                            {activeDateReport.play_count?.toLocaleString("zh-CN") ?? "--"}
                          </div>
                        </div>
                        <div className="dashboard-metric-card">
                          <div className="text-[12px] text-stone-500">互动总量</div>
                          <div className="text-[13px] font-medium text-stone-700 tabular-nums">
                            {(activeDateReport.likes ?? 0) +
                              (activeDateReport.comments ?? 0) +
                              (activeDateReport.shares ?? 0) +
                              (activeDateReport.favorites ?? 0)}
                          </div>
                        </div>
                        <div className="dashboard-metric-card">
                          <div className="text-[12px] text-stone-500">涨粉</div>
                          <div className="text-[13px] font-medium text-stone-700 tabular-nums">{activeDateReport.follower_gain ?? "--"}</div>
                        </div>
                        <div className="dashboard-metric-card">
                          <div className="text-[12px] text-stone-500">完播率</div>
                          <div className="text-[13px] font-medium text-stone-700 tabular-nums">{activeDateReport.completion_rate ?? "--"}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 lg:w-[180px]">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 bg-white"
                        onClick={() => setEditingReport(activeDateReport)}
                      >
                        <PencilLine className="size-4 stroke-[1.5]" />
                        查看并修改
                      </Button>
                    </div>
                  </div>
                </div>
              ) : shouldShowBlockedStateCard ? (
                <div
                  className={cn(
                    "mt-4 rounded-2xl border p-4",
                    activeDateStatus.state === "waive"
                      ? "border-stone-200 border-l-[2px] border-l-[#6FAA7D] bg-white"
                      : "border-stone-200 border-l-[2px] border-l-[#D99E55] bg-stone-50",
                  )}
                >
                  <div className="space-y-2">
                    <p
                      className={cn(
                        "text-[13px] font-medium",
                        activeDateStatus.state === "waive" ? "text-[#6FAA7D]" : "text-[#D99E55]",
                      )}
                    >
                      这一天已标记为{activeDateStatus.label}
                    </p>
                    <p
                      className={cn(
                        "text-[13px] leading-[1.7]",
                        activeDateStatus.state === "waive" ? "text-stone-500" : "text-stone-500",
                      )}
                    >
                      {activeDateStatus.description}
                    </p>
                    {activeExemptionState.reason ? (
                      <p className="text-[13px] text-stone-500">原因：{activeExemptionState.reason}</p>
                    ) : null}
                  </div>
                </div>
              ) : activeDateStatus.state === "future" ? (
                <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="space-y-1">
                    <p className="text-[13px] font-medium text-stone-700">这一天还未到</p>
                    <p className="text-[13px] leading-[1.7] text-stone-500">{activeDateStatus.description}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-stone-200 border-l-[2px] border-l-[#C9604D] bg-stone-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <p className="text-[13px] font-medium text-[#C9604D]">
                        {activeDateStatus.state === "unsubmitted" ? "今天还没有提交数据" : "这一天漏交了数据"}
                      </p>
                      <p className="text-[13px] leading-[1.7] text-stone-500">
                        {activeDateStatus.description} 点击按钮后，将关闭当前弹窗，并把主页主表单切换到 {activeBizDate} 的补交模式。
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 border-[#C9604D] text-[#C9604D] hover:bg-[#C9604D]/5"
                        disabled={isExempting}
                        onClick={() => handleApplyExemption(activeBizDate)}
                      >
                        <ShieldAlert className="size-4 stroke-[1.5]" />
                        {isExempting ? "提交中..." : "申请豁免"}
                      </Button>
                      <Button
                        type="button"
                        className="h-11"
                        onClick={() => openBackfillForDate(activeBizDate)}
                      >
                        <PencilLine className="size-4 stroke-[1.5]" />
                        去补交这一天
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            ) : null}
          </div>
          )}
        </DialogContent>
      </Dialog>


      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>历史记录</DialogTitle>
          </DialogHeader>
          {isActivityLoading ? (
            <div className="flex h-40 items-center justify-center text-[13px] text-stone-500">
              加载历史记录...
            </div>
          ) : !historyReports || historyReports.length === 0 ? (
            <EmptyState
              icon={History}
              title="暂无历史记录"
              description="完成提交或补交后，这里会显示最近 30 条记录。"
            />
          ) : (
            <HistoryList
              history={historyReports.map((report) => ({
                ...report,
                content: report.content ?? null,
                follower_convert: report.follower_convert ?? null,
              }))}
              accounts={accounts.map((account) => ({ id: account.id, name: account.display_name }))}
              accountDisplayNameMap={accountDisplayNameMap}
              today={today}
              onReportOpen={(report) => {
                if (!report.report_date) return;
                handleHistoryReportOpen({
                  ...report,
                  report_date: report.report_date,
                  content: report.content ?? null,
                  follower_convert: report.follower_convert ?? null,
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editingReport !== null} onOpenChange={(open) => !open && setEditingReport(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>查看并修改当日数据</DialogTitle>
          </DialogHeader>
          {editingReport ? (
            <DashboardForm
              accounts={accounts.map((account) => ({ id: account.id, name: account.display_name }))}
              defaultAccountId={editingReport.account_id}
              today={today}
              existingData={toDashboardReportData(editingReport)}
              actionBarMode="inline"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {isRedirecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/85 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#D97757] to-[#C9503B] text-white shadow-md shadow-[#D97757]/20 animate-bounce">
                <Zap className="size-6 stroke-[2] fill-current" />
              </div>
              <div className="space-y-1">
                <h4 className="text-[14px] font-semibold text-stone-900">数据同步中</h4>
                <p className="text-[12px] text-stone-500">正在前往成长大盘...</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
