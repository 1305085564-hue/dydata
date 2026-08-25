"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FilePenLine, History, PencilLine, ShieldAlert, X } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { Video, VideoTagReviewDimension } from "@/types";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import {
  getExemptionStateForDate,
  getExemptionDatesForMonth,
  type ExemptionGrantLike,
  type ExemptionProfileLike,
} from "@/lib/豁免";
import {
  getDashboardStatusClass,
} from "./dashboard-visuals";
import { HistoryList } from "./history-list";
import { HistoryReportEditForm, type HistoryReportEditData } from "./history-report-edit-form";
import { VideoSubmitFormV2 } from "./video-submit-form-v2";
import {
  getVideoSubmissionEditDetailError,
  type VideoSubmissionEditDetail,
} from "./video-submit-form-state";
import { ExemptionDialogV2 } from "./redesign/exemption-dialog-v2";
import { SubmissionCalendar } from "@/components/submission/submission-calendar";
import { submitExemptionRequest } from "./actions";
import {
  getDashboardSubmittedDates,
  getTodaySubmissionSummary,
  mergeDashboardReports,
  resolveSubmissionDayStatus,
  resolveSubmitPanelMode,
  type SubmitPanelRequestedMode,
  type TodaySubmissionReportLike,
} from "./video-submit-panel-state";

import { cn } from "@/lib/utils";

type MonthReport = Omit<TodaySubmissionReportLike, "account_id"> & {
  id: string;
  account_id: string;
};

type AsyncActivityData = {
  monthSubmittedDates: string[];
  monthReports: MonthReport[];
  history: MonthReport[];
};

type ActivityRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type EditDetailLoadState =
  | { status: "idle" | "loading"; detail: null; error: null }
  | { status: "ready"; detail: VideoSubmissionEditDetail; error: null }
  | { status: "error"; detail: null; error: string };

export async function fetchDashboardActivity(
  request: ActivityRequest = fetch,
): Promise<AsyncActivityData> {
  const response = await request("/api/dashboard/activity");
  const payload = (await response.json()) as Partial<AsyncActivityData> & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "活动记录加载失败");
  }
  if (!Array.isArray(payload.monthReports) || !Array.isArray(payload.history)) {
    throw new Error("活动记录格式无效");
  }

  return {
    monthSubmittedDates: Array.isArray(payload.monthSubmittedDates) ? payload.monthSubmittedDates : [],
    monthReports: payload.monthReports,
    history: payload.history,
  };
}

export async function fetchVideoSubmissionEditDetail(
  input: { accountId: string; bizDate: string },
  request: ActivityRequest = fetch,
): Promise<VideoSubmissionEditDetail> {
  const params = new URLSearchParams({ account_id: input.accountId, biz_date: input.bizDate });
  const response = await request(`/api/video-submit/edit-detail?${params.toString()}`);
  const payload = (await response.json()) as { detail?: unknown; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "加载原视频详情失败");
  }
  const error = getVideoSubmissionEditDetailError(payload.detail, input);
  if (error) throw new Error(error);
  return payload.detail as VideoSubmissionEditDetail;
}

function DashboardActivityError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
      <ShieldAlert className="size-5 text-[#C9604D]" aria-hidden="true" />
      <p className="text-[13px] font-medium text-[#292524]">记录加载失败</p>
      <p className="max-w-sm text-[12px] text-[#78716C]">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        重新加载
      </Button>
    </div>
  );
}

function ExemptionReviewNoticeCard({
  notice,
}: {
  notice: NonNullable<DashboardPageData["userExemptionReviewNotice"]>;
}) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      const key = `dydata:notice:${notice.request_id || notice.created_at || "review"}`;
      return window.sessionStorage.getItem(key) === "dismissed";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const isApproved = notice.request_status === "approved";
  const categoryText = notice.exemption_category === "leave" ? "请假" : "豁免";
  const dateText = notice.start_date === notice.end_date || !notice.end_date
    ? notice.start_date
    : `${notice.start_date} 至 ${notice.end_date}`;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      const key = `dydata:notice:${notice.request_id || notice.created_at || "review"}`;
      window.sessionStorage.setItem(key, "dismissed");
    } catch {}
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E5E0D6] bg-[#FBF9F5] px-3.5 py-2 text-[12.5px] transition-all">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            isApproved ? "bg-[#2E7D32]" : "bg-[#C9604D]",
          )}
        />
        <span className="font-medium text-[#292524]">
          {dateText} {categoryText}{isApproved ? "已通过" : "未通过"}
        </span>
        {notice.reason && (
          <span className="truncate text-[#78716C]">
            · {notice.reason}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 p-1 text-[#78716C] hover:text-[#1C1917] transition-colors rounded hover:bg-[#F5F3EE] cursor-pointer"
        aria-label="关闭提示"
      >
        <X className="size-3.5 stroke-[2]" />
      </button>
    </div>
  );
}

const formatDateTime = (isoString: string | null | undefined) => {
  if (!isoString) return "—";
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

interface VideoSubmitPanelV2Props {
  accounts: { id: string; name: string; display_name: string; content_direction: string | null }[];
  userId: string;
  userDisplayName: string;
  today: string;
  todayReports: TodaySubmissionReportLike[];
  monthSubmittedDates?: string[];
  monthReports: MonthReport[];
  history: MonthReport[];
  accountIds: string[];
  ownContentDirections: string[];
  accountDisplayNameMap: Record<string, string>;
  hasPendingExemption?: boolean;
  userExemptionReviewNotice?: DashboardPageData["userExemptionReviewNotice"];
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
  embeddedChrome?: boolean;
  selectedAccountId?: string;
  onSelectedAccountChange?: (accountId: string) => void;
  activeBizDate?: string;
  onActiveBizDateChange?: (date: string) => void;
}

/**
 * VideoSubmitPanel V2 - Claude 设计系统改造版
 * 保留所有 Antigravity 业务逻辑，用 Claude 设计系统重写 UI
 */
export function VideoSubmitPanelV2({
  accounts,
  userId,
  today,
  todayReports,
  monthSubmittedDates = [],
  monthReports,
  history,
  accountDisplayNameMap,
  hasPendingExemption = false,
  userExemptionReviewNotice = null,
  userExemptionProfile,
  userExemptionGrants,
  selectedAccountId: controlledSelectedAccountId,
  activeBizDate: controlledActiveBizDate,
  onActiveBizDateChange,
}: VideoSubmitPanelV2Props) {
  const router = useRouter();
  const handleGoToGrowth = useCallback(() => {
    router.push("/growth");
  }, [router]);

  const formAnchorRef = useRef<HTMLDivElement | null>(null);
  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [requestedMode, setRequestedMode] = useState<SubmitPanelRequestedMode>(null);
  const [internalActiveBizDate, setInternalActiveBizDate] = useState(today);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<MonthReport | null>(null);
  const [submittedViewActive, setSubmittedViewActive] = useState(false);
  const [reportOverrides, setReportOverrides] = useState<Record<string, TodaySubmissionReportLike>>({});
  const [activityData, setActivityData] = useState<AsyncActivityData | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [editDetailLoadState, setEditDetailLoadState] = useState<EditDetailLoadState>({
    status: "idle",
    detail: null,
    error: null,
  });
  const [editDetailRequestVersion, setEditDetailRequestVersion] = useState(0);
  const [isExemptionDialogOpen, setIsExemptionDialogOpen] = useState(false);
  const [localHasPendingExemption, setLocalHasPendingExemption] = useState(hasPendingExemption);
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

  const selectedAccountId = controlledSelectedAccountId ?? accounts[0]?.id ?? "";
  const activeBizDate = controlledActiveBizDate ?? internalActiveBizDate;

  useEffect(() => {
    setLocalHasPendingExemption(hasPendingExemption);
  }, [hasPendingExemption]);
  const setActiveBizDate = useCallback(
    (date: string) => {
      setInternalActiveBizDate(date);
      onActiveBizDateChange?.(date);
    },
    [onActiveBizDateChange],
  );

  const loadActivity = useCallback(async () => {
    setActivityError(null);
    try {
      setActivityData(await fetchDashboardActivity());
    } catch (cause) {
      setActivityData(null);
      setActivityError(cause instanceof Error ? cause.message : "活动记录加载失败");
    }
  }, []);

  useEffect(() => {
    if (!isHistoryOpen || activityData || activityError) return;
    const timeoutId = window.setTimeout(() => {
      void loadActivity();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activityData, activityError, isHistoryOpen, loadActivity]);

  useEffect(() => {
    if (localHasPendingExemption) return;
    try {
      window.localStorage.removeItem("dydata:dismissed-pending-exemption");
    } catch {}
    const timeoutId = window.setTimeout(() => {
      setDismissedPendingExemption(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [localHasPendingExemption]);

  const allReportsIncludingOverrides = useMemo(
    () =>
      mergeDashboardReports({
        initialReports: monthReports,
        activityReports: activityData?.monthReports ?? [],
        overrides: Object.values(reportOverrides),
      }),
    [activityData?.monthReports, monthReports, reportOverrides],
  );

  const submittedDatesIncludingActivity = useMemo(
    () =>
      Array.from(
        new Set([
          ...monthSubmittedDates,
          ...(activityData?.monthSubmittedDates ?? []),
          ...getDashboardSubmittedDates(allReportsIncludingOverrides),
        ]),
      ).sort(),
    [activityData?.monthSubmittedDates, allReportsIncludingOverrides, monthSubmittedDates],
  );

  const todayReportsIncludingOverrides = useMemo(
    () => [
      ...todayReports,
      ...allReportsIncludingOverrides.filter((report) => report.report_date === today),
    ],
    [allReportsIncludingOverrides, today, todayReports],
  );

  const selectedAccount = useMemo(
    () => accounts.find((acc) => acc.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  const primarySummary = useMemo(
    () => getTodaySubmissionSummary(todayReportsIncludingOverrides, selectedAccountId),
    [selectedAccountId, todayReportsIncludingOverrides],
  );

  const activeDateReport = useMemo(() => {
    return allReportsIncludingOverrides.find(
      (r) => r.account_id === selectedAccountId && r.report_date === activeBizDate,
    ) ?? null;
  }, [allReportsIncludingOverrides, selectedAccountId, activeBizDate]);

  const activeExemptionState = useMemo(
    () => getExemptionStateForDate(userExemptionProfile, activeBizDate, userExemptionGrants),
    [activeBizDate, userExemptionProfile, userExemptionGrants],
  );
  const exemptionDateBuckets = useMemo(
    () => getExemptionDatesForMonth(userExemptionProfile, today, userExemptionGrants),
    [today, userExemptionGrants, userExemptionProfile],
  );
  const activeDateStatus = useMemo(() => {
    return resolveSubmissionDayStatus({
      date: activeBizDate,
      today,
      report: activeBizDate === today ? primarySummary : activeDateReport,
      exemption: activeExemptionState,
      activity: activeBizDate < today && activityError
        ? { status: "error", message: activityError }
        : activityData
          ? { status: "ready" }
          : activeBizDate < today
            ? { status: "loading" }
            : null,
    });
  }, [activeBizDate, activeDateReport, activeExemptionState, activityData, activityError, primarySummary, today]);

  const primaryMode = useMemo(
    () =>
      resolveSubmitPanelMode({
        summary: activeBizDate === today ? primarySummary : null,
        requestedMode: activeBizDate === today ? requestedMode : "backfill",
        report: activeDateReport,
        activeDateStatus,
      }),
    [activeBizDate, activeDateReport, activeDateStatus, primarySummary, requestedMode, today],
  );

  useEffect(() => {
    if (primaryMode !== "editToday" || !selectedAccount || activeBizDate !== today) {
      setEditDetailLoadState({ status: "idle", detail: null, error: null });
      return;
    }

    let cancelled = false;
    setEditDetailLoadState({ status: "loading", detail: null, error: null });
    void fetchVideoSubmissionEditDetail({ accountId: selectedAccount.id, bizDate: activeBizDate })
      .then((detail) => {
        if (!cancelled) setEditDetailLoadState({ status: "ready", detail, error: null });
      })
      .catch((cause) => {
        if (!cancelled) {
          setEditDetailLoadState({
            status: "error",
            detail: null,
            error: cause instanceof Error ? cause.message : "加载原视频详情失败",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeBizDate, editDetailRequestVersion, primaryMode, selectedAccount, today]);

  const isPrimarySummaryMode = primaryMode === "summary" && primarySummary !== null;
  const shouldShowBlockedStateCard =
    (activeDateStatus.state === "waive" || activeDateStatus.state === "leave") &&
    !submittedViewActive;
  const isPermanentExemption = activeExemptionState.isExempt && activeExemptionState.type === "permanent";

  const shouldHideFormForExemption =
    shouldShowBlockedStateCard && !isPermanentExemption;
  const shouldShowActivityErrorCard = activeDateStatus.requiresActivityRetry;
  const shouldShowActivityLoadingCard =
    activeBizDate < today &&
    !activityData &&
    !activityError;
  const shouldShowHistoricalSubmittedCard =
    activeBizDate < today && activeDateStatus.state === "submitted" && Boolean(activeDateReport);
  const isTodayEdit = activeBizDate === today && primaryMode === "editToday" && Boolean(primarySummary);
  const shouldShowEditDetailLoading = isTodayEdit && editDetailLoadState.status === "loading";
  const shouldShowEditDetailError = isTodayEdit && editDetailLoadState.status === "error";
  const isExemptionPending = localHasPendingExemption;
  const shouldShowForm =
    Boolean(selectedAccount) &&
    !shouldHideFormForExemption &&
    !shouldShowActivityLoadingCard &&
    !shouldShowActivityErrorCard &&
    !shouldShowHistoricalSubmittedCard &&
    (!isTodayEdit || editDetailLoadState.status === "ready") &&
    (!isPrimarySummaryMode || activeBizDate !== today || submittedViewActive);

  const handleSubmitted = useCallback(
    (
      video: Video,
      aiTags: Array<{
        tag_dimension: VideoTagReviewDimension;
        tag_value: string;
        confidence: number | null;
        reason: string | null;
      }>,
      summaryOverride?: TodaySubmissionReportLike | null,
    ) => {
      setSubmittedViewActive(true);
      setRequestedMode(null);
      void loadActivity();

      if (summaryOverride) {
        const key = `${summaryOverride.account_id}-${summaryOverride.report_date}`;
        setReportOverrides((current) => ({
          ...current,
          [key]: summaryOverride,
        }));
      }

      setTimeout(() => {
        formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    },
    [loadActivity],
  );

  const selectBizDate = useCallback(
    (date: string) => {
      setActiveBizDate(date);
      setRequestedMode(null);
      setSubmittedViewActive(false);
      if (date < today && !activityData && !activityError) {
        void loadActivity();
      }
    },
    [activityData, activityError, loadActivity, setActiveBizDate, today],
  );

  const handleHistoryReportOpen = useCallback((report: MonthReport) => {
    setIsHistoryOpen(false);
    setEditingReport(report);
  }, []);

  const dismissPendingExemption = useCallback(() => {
    setDismissedPendingExemption(true);
    try {
      window.localStorage.setItem("dydata:dismissed-pending-exemption", JSON.stringify({ date: today }));
    } catch {}
  }, [today]);

  // 点击外部及 Esc 键收起日历 Popover
  useEffect(() => {
    if (!isCalendarOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        calendarPopoverRef.current &&
        !calendarPopoverRef.current.contains(event.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsCalendarOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCalendarOpen]);

  const isActivityLoading = !activityData && !activityError;
  const historyReports = activityData?.history ?? history;

  return (
    <>
      <div className="w-full space-y-6">
        {/* 新版控制栏：今日提交工作台 */}
        <div className="rounded-xl border border-[#E5E0D6] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* 左侧：标题和描述 */}
            <div>
              <h1 className="text-[20px] font-semibold text-[#1C1917] tracking-tight">
                今日提交工作台
              </h1>
              <p className="mt-1 text-[13px] text-[#78716C]">
                记录运营数据，提交今日内容
              </p>
            </div>

            {/* 右侧：控制区 */}
            <div className="flex flex-wrap items-center gap-3">
              {/* 日期选择 Popover */}
              <div className="relative inline-flex items-center" ref={calendarPopoverRef}>
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen((prev) => !prev)}
                  className={cn(
                    "inline-flex items-center gap-2 h-9 rounded-lg border border-[#E5E0D6] bg-white px-3 text-[13px] font-medium text-[#292524] shadow-sm transition-all hover:bg-[#F5F3EE] active:scale-[0.985] focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 cursor-pointer",
                    isCalendarOpen && "border-[#78716C] bg-[#F5F3EE]"
                  )}
                  aria-expanded={isCalendarOpen}
                  aria-label="切换填报日期"
                >
                  <CalendarDays className="size-4 text-[#78716C]" />
                  <span className="tabular-nums">{activeBizDate}</span>
                </button>

                {isCalendarOpen && (
                  <div className="absolute right-0 sm:right-auto sm:left-0 top-full mt-2 z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150">
                    <div className="w-[320px] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-[#E5E0D6] bg-white p-5 shadow-[0_12px_32px_-4px_rgba(28,25,23,0.08),0_2px_6px_rgba(0,0,0,0.02)]">
                      <SubmissionCalendar
                        today={today}
                        submittedDates={submittedDatesIncludingActivity}
                        waiveDates={exemptionDateBuckets.waiveDates}
                        leaveDates={exemptionDateBuckets.leaveDates}
                        pendingDates={localHasPendingExemption ? [today] : []}
                        selectedDate={activeBizDate}
                        onDateSelect={(date) => {
                          selectBizDate(date);
                          setIsCalendarOpen(false);
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 申请豁免按钮 */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!isExemptionPending) setIsExemptionDialogOpen(true);
                }}
                disabled={isExemptionPending}
                className={cn(
                  "h-9 rounded-lg",
                  isExemptionPending && "border-[#B98A54]/40 bg-[#B98A54]/10 text-[#B98A54]"
                )}
                title={isExemptionPending ? "已有申请审批中" : undefined}
              >
                <FilePenLine className="size-4 mr-1.5" />
                {isExemptionPending ? "审批中" : "申请豁免"}
              </Button>

              {/* 历史记录按钮 */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsHistoryOpen(true)}
                className="h-9 rounded-lg"
              >
                <History className="size-4 mr-1.5" />
                历史记录
              </Button>
            </div>
          </div>
        </div>

        {/* 待审批豁免提示横幅 */}
        {isExemptionPending && !dismissedPendingExemption && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-3 rounded-lg border border-[#E5E0D6] bg-[#FBF9F5] px-3.5 py-2 text-[12.5px] transition-all"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="size-1.5 shrink-0 rounded-full bg-[#B98A54] animate-pulse" />
              <span className="font-medium text-[#292524]">
                豁免申请审批中
              </span>
              <span className="truncate text-[#78716C]">
                · 正在等待管理员审批
              </span>
            </div>
            <button
              type="button"
              onClick={dismissPendingExemption}
              className="shrink-0 p-1 text-[#78716C] hover:text-[#1C1917] transition-colors rounded hover:bg-[#F5F3EE] cursor-pointer"
              aria-label="关闭提示"
            >
              <X className="size-3.5 stroke-[2]" />
            </button>
          </motion.div>
        )}

        {userExemptionReviewNotice ? (
          <ExemptionReviewNoticeCard notice={userExemptionReviewNotice} />
        ) : null}

        {/* 主内容区 */}
        <Card className="border-[#ECE7DE] shadow-sm">
          <CardContent className="p-6" ref={formAnchorRef}>
            {/* 已提交概览卡片 */}
            {isPrimarySummaryMode && activeBizDate === today && !submittedViewActive ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 rounded-xl border border-[#6FAA7D]/20 bg-[#6FAA7D]/10 p-6"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6FAA7D]/20 px-3 py-1 text-[12px] font-semibold text-[#6FAA7D]">
                        <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
                        已提交
                      </span>
                      <span className="text-[12px] text-[#78716C] tabular-nums">
                        {formatDateTime(primarySummary.uploadedAt)}
                      </span>
                    </div>

                    {/* 数据概览 */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-[#F5F3EE]/70 p-4">
                        <div className="text-[11.5px] font-medium uppercase tracking-wider text-[#78716C]">播放</div>
                        <div className="mt-1.5 text-[20px] font-semibold tracking-tight tabular-nums text-[#292524]">
                          {primarySummary.playCount !== null && primarySummary.playCount !== undefined
                            ? Number(primarySummary.playCount).toLocaleString("zh-CN")
                            : "--"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#F5F3EE]/70 p-4">
                        <div className="text-[11.5px] font-medium uppercase tracking-wider text-[#78716C]">涨粉</div>
                        <div className="mt-1.5 text-[20px] font-semibold tracking-tight tabular-nums text-[#292524]">
                          {primarySummary.followerGain !== null && primarySummary.followerGain !== undefined
                            ? Number(primarySummary.followerGain).toLocaleString("zh-CN")
                            : "--"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#F5F3EE]/70 p-4">
                        <div className="text-[11.5px] font-medium uppercase tracking-wider text-[#78716C]">完播率</div>
                        <div className="mt-1.5 text-[20px] font-semibold tracking-tight tabular-nums text-[#292524]">
                          {primarySummary.completionRate ?? "--"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-3 lg:w-[200px]">
                    <Button
                      type="button"
                      className="h-10 w-full rounded-xl bg-[#D97757] hover:bg-[#C46A4D] text-white text-[13px] font-medium transition-colors duration-100 shadow-sm active:scale-[0.985]"
                      onClick={handleGoToGrowth}
                    >
                      查看成长分析
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl border-[#E5E0D6] text-[13px] font-medium"
                      onClick={() => setRequestedMode("editToday")}
                    >
                      <PencilLine className="size-4 mr-1.5" />
                      修改今日数据
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : null}

            {/* 豁免/请假状态卡片 */}
            {selectedAccount && shouldShowBlockedStateCard ? (
              <div
                className={cn(
                  "mb-6 p-5 rounded-xl border-l-4",
                  activeDateStatus.state === "waive"
                    ? "border-l-[#6FAA7D] bg-[#6FAA7D]/10"
                    : "border-l-[#D99E55] bg-[#D99E55]/10",
                )}
              >
                <div className="space-y-3">
                  <span className={getDashboardStatusClass(activeDateStatus.tone)}>
                    <FilePenLine className="size-4" />
                    {activeBizDate === today ? `今日${activeDateStatus.label}` : `${activeDateStatus.label}状态`}
                  </span>
                  <div>
                    <div className="text-lg font-semibold text-[#1C1917]">
                      {activeBizDate} 已标记为{activeDateStatus.label}
                    </div>
                    <p className="mt-1 text-[13px] text-[#78716C]">
                      {activeDateStatus.description}
                    </p>
                    {activeExemptionState.reason && (
                      <p className="mt-1 text-[13px] text-[#78716C]">
                        原因：{activeExemptionState.reason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {shouldShowActivityErrorCard ? (
              <div className="mb-6 rounded-xl border border-[#C9604D]/20 bg-[#C9604D]/10 p-5">
                <DashboardActivityError
                  message={activeDateStatus.errorMessage ?? "历史记录加载失败，请先重试后再补交。"}
                  onRetry={() => void loadActivity()}
                />
              </div>
            ) : null}

            {shouldShowActivityLoadingCard ? (
              <div className="mb-6 rounded-xl border border-[#D99E55]/20 bg-[#D99E55]/10 p-5">
                <p className="text-[13px] font-semibold text-[#8A6A2F]">正在核对历史记录</p>
                <p className="mt-1 text-[13px] text-[#78716C]">
                  正在确认 {activeBizDate} 是否已有日报，核对完成前不会开放补交。
                </p>
              </div>
            ) : null}

            {shouldShowHistoricalSubmittedCard && activeDateReport ? (
              <div className="mb-6 rounded-xl border border-[#6FAA7D]/20 bg-[#6FAA7D]/10 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-[#3F7C51]">该日期已提交</p>
                    <p className="mt-1 text-[13px] text-[#78716C]">
                      {activeDateReport.title || "未命名日报"} · {activeDateReport.report_date}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl border-[#E5E0D6] text-[13px] font-medium"
                    onClick={() => setEditingReport(activeDateReport)}
                  >
                    查看并修改
                  </Button>
                </div>
              </div>
            ) : null}

            {shouldShowEditDetailLoading ? (
              <div className="mb-6 rounded-xl border border-[#D99E55]/30 bg-[#D99E55]/10 p-5">
                <p className="text-[13px] font-semibold text-[#8A6A2F]">
                  正在加载原视频完整详情
                </p>
                <p className="mt-1 text-[13px] text-[#78716C]">
                  正在核对旧视频、24小时指标、截图、标签、责任人与导粉话术；完成前不会开放保存。
                </p>
              </div>
            ) : null}

            {shouldShowEditDetailError ? (
              <div className="mb-6 rounded-xl border border-[#C9604D]/20 bg-[#C9604D]/10 p-5">
                <p className="text-[13px] font-semibold text-[#A5483D]">无法安全加载原视频详情</p>
                <p className="mt-1 text-[13px] text-[#78716C]">{editDetailLoadState.error}</p>
                <div className="mt-3 flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditDetailRequestVersion((value) => value + 1)}>
                    重新加载
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRequestedMode(null)}>
                    返回摘要
                  </Button>
                </div>
              </div>
            ) : null}

            {/* 表单区域 */}
            {shouldShowForm && selectedAccount ? (
              <VideoSubmitFormV2
                key={`form-${selectedAccount.id}-${activeBizDate}`}
                account={selectedAccount}
                userId={userId}
                today={today}
                mode={primaryMode}
                initialSummary={submittedViewActive ? null : (primaryMode === "backfill" ? null : primarySummary)}
                editDetail={editDetailLoadState.status === "ready" ? editDetailLoadState.detail : null}
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
          </CardContent>
        </Card>
      </div>

      {/* 历史记录弹窗 */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl rounded-2xl border-[#E5E0D6] bg-white shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold text-[#1C1917]">历史记录</DialogTitle>
          </DialogHeader>
          {activityError ? (
            <DashboardActivityError message={activityError} onRetry={() => void loadActivity()} />
          ) : isActivityLoading ? (
            <div className="flex h-40 items-center justify-center text-[13px] text-[#78716C]">
              加载历史记录...
            </div>
          ) : !historyReports || historyReports.length === 0 ? (
            <EmptyState
              icon={History}
              title="还没有历史记录"
              description="完成提交或补交后，这里会显示最近 30 条记录。"
            />
          ) : (
            <HistoryList
              history={historyReports.map((report) => ({
                ...report,
                content: report.content ?? null,
                follower_convert: report.follower_convert ?? null,
              }))}
              accountDisplayNameMap={accountDisplayNameMap}
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

      {/* 编辑历史记录弹窗 */}
      <Dialog open={editingReport !== null} onOpenChange={(open) => !open && setEditingReport(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-4 gap-3 sm:max-w-5xl rounded-2xl border-[#E5E0D6] bg-white shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold text-[#1C1917]">查看并修改日报数据</DialogTitle>
          </DialogHeader>
          {editingReport ? (
            <HistoryReportEditForm
              key={`history-edit-${editingReport.id}-${editingReport.uploaded_at ?? editingReport.report_date}`}
              report={editingReport as HistoryReportEditData}
              onSaved={() => {
                setEditingReport(null);
                void loadActivity();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 申请豁免弹窗 */}
      {isExemptionDialogOpen && (
        <ExemptionDialogV2
          isOpen={isExemptionDialogOpen}
          onClose={() => setIsExemptionDialogOpen(false)}
          today={today}
          submittedDates={submittedDatesIncludingActivity}
          activitySubmittedDates={activityData?.monthSubmittedDates ?? []}
          waiveDates={exemptionDateBuckets.waiveDates}
          leaveDates={exemptionDateBuckets.leaveDates}
          onSubmitRequest={async (request) => {
            const result = await submitExemptionRequest(request);
            if (!result.error) {
              setLocalHasPendingExemption(true);
              setIsExemptionDialogOpen(false);
              void loadActivity();
            }
            return result;
          }}
        />
      )}
    </>
  );
}
