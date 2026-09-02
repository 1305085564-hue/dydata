"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Compass, FilePenLine, History, PencilLine, ShieldAlert, X, Check } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ZenFinishedIllustration } from "@/components/editorial/editorial-illustrations";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { Video, VideoTagReviewDimension } from "@/types";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import {
  getExemptionStateForDate,
  getAllExemptionDates,
  type ExemptionGrantLike,
  type ExemptionProfileLike,
} from "@/lib/豁免";
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
  WorkbenchNoticeBar,
  buildExemptionReviewNoticeItem,
} from "./components/workbench-notice-bar";
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
  if (!Array.isArray(payload.history)) {
    throw new Error("活动记录格式无效");
  }

  return {
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
    <div className="flex min-h-40 flex-col items-center justify-center gap-2.5 text-center">
      <ShieldAlert className="size-5 text-[#C0685C]" aria-hidden="true" />
      <p className="text-[13px] font-medium text-[#292524]">手稿记录暂未就绪</p>
      <p className="max-w-sm text-[12px] text-[#78716C]">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-1">
        重新载入
      </Button>
    </div>
  );
}



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
  accountDisplayNameMap: Record<string, string>;
  hasPendingExemption?: boolean;
  pendingExemptionDates?: string[];
  userExemptionReviewNotice?: DashboardPageData["userExemptionReviewNotice"];
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
  embeddedChrome?: boolean;
  selectedAccountId?: string;
  onSelectedAccountChange?: (accountId: string) => void;
  activeBizDate?: string;
  onActiveBizDateChange?: (date: string) => void;
  initialTopicId?: string | null;
  initialTopicTitle?: string | null;
}

/**
 * VideoSubmitPanel V2 - Claude 设计系统改造版
 * 保留所有 Antigravity 业务逻辑，用 Claude 设计系统重写 UI
 */
export function VideoSubmitPanelV2({
  accounts,
  userId,
  userDisplayName,
  today,
  todayReports,
  monthSubmittedDates = [],
  monthReports,
  history,
  accountDisplayNameMap,
  hasPendingExemption = false,
  pendingExemptionDates = [],
  userExemptionReviewNotice = null,
  userExemptionProfile,
  userExemptionGrants,
  selectedAccountId: controlledSelectedAccountId,
  onSelectedAccountChange,
  activeBizDate: controlledActiveBizDate,
  onActiveBizDateChange,
  initialTopicId = null,
  initialTopicTitle = null,
}: VideoSubmitPanelV2Props) {
  const router = useRouter();
  const handleGoToGrowth = useCallback(() => {
    router.push("/growth");
  }, [router]);
  const handleGoToTopics = useCallback(() => {
    router.push("/topics");
  }, [router]);

  const formAnchorRef = useRef<HTMLDivElement | null>(null);
  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [requestedMode, setRequestedMode] = useState<SubmitPanelRequestedMode>(null);
  const [internalSelectedAccountId, setInternalSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [internalActiveBizDate, setInternalActiveBizDate] = useState(today);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<MonthReport | null>(null);
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
  const [localPendingExemptionDates, setLocalPendingExemptionDates] = useState(pendingExemptionDates);
  const [dismissedPendingExemption, setDismissedPendingExemption] = useState(false);

  useEffect(() => {
    let nextDismissed = false;
    try {
      const raw = window.localStorage.getItem("dydata:dismissed-pending-exemption");
      if (raw) {
        const parsed = JSON.parse(raw);
        nextDismissed = parsed.date === today;
      }
    } catch {}
    const timeoutId = window.setTimeout(
      () => setDismissedPendingExemption(nextDismissed),
      0,
    );
    return () => window.clearTimeout(timeoutId);
  }, [today]);

  const [dismissedReviewNotice, setDismissedReviewNotice] = useState(false);
  useEffect(() => {
    if (!userExemptionReviewNotice) return;
    let nextDismissed = false;
    try {
      const key = `dydata:notice:${userExemptionReviewNotice.id || userExemptionReviewNotice.created_at || "review"}`;
      nextDismissed = window.sessionStorage.getItem(key) === "dismissed";
    } catch {}
    const timeoutId = window.setTimeout(() => setDismissedReviewNotice(nextDismissed), 0);
    return () => window.clearTimeout(timeoutId);
  }, [userExemptionReviewNotice]);

  const handleDismissReviewNotice = useCallback(() => {
    if (!userExemptionReviewNotice) return;
    setDismissedReviewNotice(true);
    try {
      const key = `dydata:notice:${userExemptionReviewNotice.id || userExemptionReviewNotice.created_at || "review"}`;
      window.sessionStorage.setItem(key, "dismissed");
    } catch {}
  }, [userExemptionReviewNotice]);

  const selectedAccountId = controlledSelectedAccountId ?? internalSelectedAccountId;
  const activeBizDate = controlledActiveBizDate ?? internalActiveBizDate;

  const setSelectedAccountId = useCallback(
    (id: string) => {
      setInternalSelectedAccountId(id);
      onSelectedAccountChange?.(id);
    },
    [onSelectedAccountChange],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- props 更新时同步本地待审批标记（提交豁免后本地乐观置真）
    setLocalHasPendingExemption(hasPendingExemption);
    setLocalPendingExemptionDates(pendingExemptionDates);
  }, [hasPendingExemption, pendingExemptionDates]);
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
    if ((!isHistoryOpen && !isCalendarOpen && !isExemptionDialogOpen) || activityData || activityError) return;
    const timeoutId = window.setTimeout(() => {
      void loadActivity();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activityData, activityError, isCalendarOpen, isExemptionDialogOpen, isHistoryOpen, loadActivity]);

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
        initialReports: [...monthReports, ...history],
        activityReports: [...(activityData?.history ?? [])],
        overrides: Object.values(reportOverrides),
      }),
    [activityData?.history, history, monthReports, reportOverrides],
  );

  const submittedDatesIncludingActivity = useMemo(
    () =>
      Array.from(
        new Set([
          ...monthSubmittedDates,
          ...getDashboardSubmittedDates(allReportsIncludingOverrides),
        ]),
      ).sort(),
    [allReportsIncludingOverrides, monthSubmittedDates],
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
  const allExemptionDateBuckets = useMemo(
    () => getAllExemptionDates(userExemptionProfile, userExemptionGrants),
    [userExemptionGrants, userExemptionProfile],
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
        requestedMode: requestedMode ?? (activeBizDate === today ? null : "backfill"),
        report: activeDateReport,
        activeDateStatus,
      }),
    [activeBizDate, activeDateReport, activeDateStatus, primarySummary, requestedMode, today],
  );

  useEffect(() => {
    if (primaryMode !== "editToday" || !selectedAccount) {
      const timeoutId = window.setTimeout(
        () => setEditDetailLoadState({ status: "idle", detail: null, error: null }),
        0,
      );
      return () => window.clearTimeout(timeoutId);
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
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
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeBizDate, editDetailRequestVersion, primaryMode, selectedAccount]);

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
  const isEditing = primaryMode === "editToday";
  const shouldShowHistoricalSubmittedCard =
    activeBizDate < today &&
    activeDateStatus.state === "submitted" &&
    Boolean(activeDateReport) &&
    !isEditing;
  const shouldShowEditDetailLoading = isEditing && editDetailLoadState.status === "loading";
  const shouldShowEditDetailError = isEditing && editDetailLoadState.status === "error";
  const isExemptionPending = localHasPendingExemption;
  const shouldShowForm =
    Boolean(selectedAccount) &&
    !shouldHideFormForExemption &&
    !shouldShowActivityLoadingCard &&
    !shouldShowActivityErrorCard &&
    !shouldShowHistoricalSubmittedCard &&
    (!isEditing || editDetailLoadState.status === "ready") &&
    (!isPrimarySummaryMode || activeBizDate !== today || submittedViewActive || isEditing);

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
      <div className="w-full space-y-3 sm:space-y-4">
        {/* 新版控制栏：创作立卷 · 表达纪事 */}
        <div className="rounded-2xl border border-[#ECE7DE] bg-gradient-to-br from-white via-white to-[#FAF8F4] px-4 py-3 sm:px-6 sm:py-3.5 shadow-card-ring">
          <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* 左侧：标题和描述 */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D97757]" />
                <h1 className="font-serif text-2xl font-[580] text-[#1C1917] tracking-tighter">
                  创作立卷 · 表达纪事
                </h1>
              </div>
              <p className="text-[12px] sm:text-[12.5px] text-[#78716C] leading-relaxed">
                从容记录每一次真实表达 · 数据沉淀与成长复盘
              </p>
            </div>

            {/* 右侧：控制区 */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              {/* 日期选择 Popover */}
              <div className="relative inline-flex items-center" ref={calendarPopoverRef}>
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen((prev) => !prev)}
                  className={cn(
                    "inline-flex items-center gap-1.5 sm:gap-2 h-7 rounded-md border border-[#ECE7DE] bg-[#F5F3EE] px-2.5 text-[12px] sm:text-[13px] font-medium text-[#292524] transition-all hover:bg-[#ECE7DE] active:scale-[0.99] active:duration-120 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 cursor-pointer",
                    isCalendarOpen && "border-[#78716C] bg-[#ECE7DE]"
                  )}
                  aria-expanded={isCalendarOpen}
                  aria-label="切换填报日期"
                >
                  <CalendarDays className="size-3.5 text-[#78716C]" />
                  <span className="tabular-nums">{activeBizDate}</span>
                </button>

                {isCalendarOpen && (
                  <div className="absolute left-0 top-full mt-2 z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150">
                    <div className="w-[290px] sm:w-[320px] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-[#E5E0D6] bg-white p-3.5 sm:p-5 shadow-claude-float ring-1 ring-[#1C1917]/5">
                      <SubmissionCalendar
                        today={today}
                        submittedDates={submittedDatesIncludingActivity}
                        waiveDates={allExemptionDateBuckets.waiveDates}
                        leaveDates={allExemptionDateBuckets.leaveDates}
                        pendingDates={localPendingExemptionDates}
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

              {/* 停笔调养申请按钮 */}
              <Button
                type="button"
                variant="secondary"
                size="m"
                onClick={() => setIsExemptionDialogOpen(true)}
                title="可申请停笔调养；已在审批中的日期会被锁定"
              >
                <FilePenLine className="size-3.5 mr-1 text-[#78716C]" />
                停笔调养
              </Button>

              {/* 历史手稿按钮 */}
              <Button
                type="button"
                variant="secondary"
                size="m"
                onClick={() => setIsHistoryOpen(true)}
              >
                <History className="size-3.5 mr-1 text-[#78716C]" />
                历史手稿
              </Button>
            </div>
          </div>
        </div>

        {/* 主内容区 */}
        <Card className="rounded-2xl">
          <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-6" ref={formAnchorRef}>
            {/* 待审批豁免与审批结果提示区 (仅在表单未挂载时在此展示；表单挂载时由表单内的 WorkbenchNoticeCapsule 统一内联) */}
            {!shouldShowForm &&
              ((isExemptionPending && !dismissedPendingExemption) ||
                (userExemptionReviewNotice && !dismissedReviewNotice)) && (
                <WorkbenchNoticeBar
                  notices={[
                    ...(userExemptionReviewNotice && !dismissedReviewNotice
                      ? [
                          buildExemptionReviewNoticeItem(
                            userExemptionReviewNotice,
                            handleDismissReviewNotice,
                          ),
                        ]
                      : []),
                    ...(isExemptionPending && !dismissedPendingExemption
                      ? [
                          {
                            id: "pending-exemption",
                            type: "exemption_pending" as const,
                            statusTone: "amber" as const,
                            title: "特殊豁免申请审批中",
                            description: "· 正在等待管理员审批",
                            onDismiss: dismissPendingExemption,
                          },
                        ]
                      : []),
                  ]}
                />
              )}

            {/* 已提交概览卡片（禅意归档态 · 微气垫底色消灭白卡套娃） */}
            {isPrimarySummaryMode && activeBizDate === today && !submittedViewActive ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 sm:mb-6 rounded-xl bg-gradient-to-br from-[#FAF8F4] via-white to-[#F5F3EE]/40 border border-[#ECE7DE] p-4 sm:p-6"
              >
                <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-center lg:justify-between">
                  {/* 左侧：禅意线描插图 + 温润寄语 */}
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="shrink-0 hidden xs:block sm:block">
                      <ZenFinishedIllustration size={72} />
                    </div>
                    <div className="space-y-1 sm:space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6FAA7D]/15 px-2.5 py-0.5 text-[11px] sm:text-[11.5px] font-medium text-[#6FAA7D]">
                          <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
                          今日已归档
                        </span>
                        <span className="text-[12px] sm:text-[12.5px] font-medium text-[#78716C]">
                          已完成今日记录
                        </span>
                      </div>
                      <h3 className="font-serif not-italic tracking-tight text-[17px] sm:text-[19px] font-[580] text-[#1C1917]">
                        万事俱备，静候佳音
                      </h3>
                      <p className="text-[12px] sm:text-[13px] text-[#78716C]">
                        今日作品已妥善入库，数据已同步至总览。
                      </p>
                    </div>
                  </div>

                  {/* 右侧：3 核心指标 + 操作 */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 shrink-0">
                    {/* 指标三联 */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                      <div className="rounded-xl bg-[#F5F3EE] px-2 py-2 sm:px-3.5 sm:py-2.5 min-w-0 text-center">
                        <div className="text-[11px] font-medium text-[#78716C] truncate">播放量</div>
                        <div className="mt-0.5 sm:mt-1 text-[14.5px] sm:text-[16px] font-[580] tabular-nums text-[#1C1917] truncate">
                          {primarySummary.playCount !== null
                            ? primarySummary.playCount >= 10000
                              ? `${(primarySummary.playCount / 10000).toFixed(1)}万`
                              : primarySummary.playCount.toLocaleString()
                            : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#F5F3EE] px-2 py-2 sm:px-3.5 sm:py-2.5 min-w-0 text-center">
                        <div className="text-[11px] font-medium text-[#78716C] truncate">点赞量</div>
                        <div className="mt-0.5 sm:mt-1 text-[14.5px] sm:text-[16px] font-[580] tabular-nums text-[#1C1917] truncate">
                          {primarySummary.likes !== null
                            ? primarySummary.likes >= 10000
                              ? `${(primarySummary.likes / 10000).toFixed(1)}万`
                              : primarySummary.likes.toLocaleString()
                            : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#F5F3EE] px-2 py-2 sm:px-3.5 sm:py-2.5 min-w-0 text-center">
                        <div className="text-[11px] font-medium text-[#78716C] truncate">完播率</div>
                        <div className="mt-0.5 sm:mt-1 text-[14.5px] sm:text-[16px] font-[580] tabular-nums text-[#1C1917] truncate">
                          {primarySummary.completionRate ?? "—"}
                        </div>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex flex-col gap-2 shrink-0 w-full sm:w-[140px]">
                      <Button
                        type="button"
                        size="m"
                        className="w-full"
                        onClick={handleGoToTopics}
                      >
                        <Compass className="size-3.5 mr-1" />
                        <span>挑选明日选题</span>
                      </Button>
                      <div className="flex items-center gap-1.5 w-full">
                        <Button
                          type="button"
                          variant="secondary"
                          size="s"
                          className="flex-1"
                          onClick={() => setRequestedMode("editToday")}
                        >
                          <PencilLine className="size-3 mr-1" />
                          微调
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="s"
                          className="flex-1 text-[#78716C] hover:text-[#1C1917]"
                          onClick={handleGoToGrowth}
                        >
                          复盘
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}

            {/* 豁免/请假状态卡片 */}
            {selectedAccount && shouldShowBlockedStateCard ? (
              <div className="mb-6 rounded-xl border border-[#ECE7DE] bg-white p-4 sm:p-5 shadow-2xs">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full",
                        activeDateStatus.state === "waive"
                          ? "bg-[#6FAA7D]/10 text-[#6FAA7D]"
                          : "bg-[#B98A54]/10 text-[#B98A54]",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          activeDateStatus.state === "waive" ? "bg-[#6FAA7D]" : "bg-[#B98A54]",
                        )}
                      />
                    </span>
                    <span className="text-[12.5px] font-medium text-[#292524]">
                      {activeBizDate === today ? `今日${activeDateStatus.label}` : `${activeDateStatus.label}状态`}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-base font-medium text-[#1C1917]">
                      {activeBizDate} · 停笔调养 ({activeDateStatus.label})
                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#78716C]">
                      {activeDateStatus.description}
                    </p>
                    {activeExemptionState.reason && (
                      <p className="mt-1 text-[13px] text-[#78716C]">
                        事由：{activeExemptionState.reason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {shouldShowActivityErrorCard ? (
              <div className="py-8">
                <DashboardActivityError
                  message={activeDateStatus.errorMessage ?? "历史记录加载稍有阻滞，请重试后再补交。"}
                  onRetry={() => void loadActivity()}
                />
              </div>
            ) : null}

            {shouldShowActivityLoadingCard ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-[#ECE7DE] bg-white p-3 text-[13px] text-[#78716C]">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#B98A54]/10 text-[#B98A54]">
                  <span className="size-1.5 rounded-full bg-[#B98A54] animate-pulse" />
                </span>
                <span className="font-medium text-[#292524]">正在核对历史纪事</span>
                <span className="text-[#78716C]">· 正在确认 {activeBizDate} 是否已有日报，核对完成前暂不开放补交</span>
              </div>
            ) : null}

            {shouldShowHistoricalSubmittedCard && activeDateReport ? (
              <div className="mb-6 rounded-xl border border-[#ECE7DE] bg-white p-4 sm:p-5 shadow-2xs">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 shrink-0 rounded-full bg-[#6FAA7D]" />
                      <span className="text-[12.5px] font-medium text-[#292524]">已立卷手稿 · {activeDateReport.report_date}</span>
                    </div>
                    <p className="text-[14px] font-medium text-[#1C1917]">
                      {activeDateReport.title || "未命名手稿"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="default"
                    className="h-7 rounded-md border border-[#ECE7DE] bg-[#F5F3EE] hover:bg-[#ECE7DE] text-[12px] font-medium text-[#292524] shadow-2xs transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
                    onClick={() => setRequestedMode("editToday")}
                  >
                    查看并修改
                  </Button>
                </div>
              </div>
            ) : null}

            {shouldShowEditDetailLoading ? (
              <div className="py-14 flex flex-col items-center justify-center text-center space-y-3">
                <div className="relative flex h-10 w-10 items-center justify-center">
                  <span className="size-2 rounded-full bg-[#D97757] motion-safe:animate-ping" />
                  <span className="absolute size-2 rounded-full bg-[#D97757]" />
                </div>
                <div className="space-y-1">
                  <p className="text-[13.5px] font-medium text-[#292524]">正在调阅作品原稿档案</p>
                  <p className="text-[12px] text-[#78716C]">正在核对旧视频、24小时指标与创作伙伴信息...</p>
                </div>
              </div>
            ) : null}

            {shouldShowEditDetailError ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <EmptyState
                  title={
                    editDetailLoadState.error?.includes("没有可编辑")
                      ? "未寻得该日期的视频底稿"
                      : "作品底稿载入暂缓"
                  }
                  description={
                    editDetailLoadState.error?.includes("没有可编辑")
                      ? "该归属日未收录可编辑的原视频手稿，您可返回概览或切换其他日期。"
                      : (editDetailLoadState.error || "数据调阅稍有滞碍，原视频与指标底稿暂未就绪。")
                  }
                  action={
                    !editDetailLoadState.error?.includes("没有可编辑")
                      ? {
                          label: "重新载入",
                          onClick: () => setEditDetailRequestVersion((v) => v + 1),
                        }
                      : {
                          label: "返回概览",
                          onClick: () => setRequestedMode(null),
                        }
                  }
                />
                {!editDetailLoadState.error?.includes("没有可编辑") && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRequestedMode(null)}
                    className="mt-2 text-xs text-[#78716C] hover:text-[#292524]"
                  >
                    返回概览
                  </Button>
                )}
              </div>
            ) : null}

            {/* 表单区域 */}
            {shouldShowForm && selectedAccount ? (
              <VideoSubmitFormV2
                key={`form-${selectedAccount.id}-${activeBizDate}-${initialTopicId ?? "no-topic"}`}
                account={selectedAccount}
                userId={userId}
                userDisplayName={userDisplayName}
                today={today}
                mode={primaryMode}
                initialSummary={submittedViewActive ? null : (primaryMode === "backfill" ? null : primarySummary)}
                editDetail={editDetailLoadState.status === "ready" ? editDetailLoadState.detail : null}
                initialBizDate={activeBizDate}
                initialTopicId={initialTopicId}
                initialTopicTitle={initialTopicTitle}
                submittedViewActive={submittedViewActive}
                userExemptionReviewNotice={userExemptionReviewNotice}
                isExemptionPending={isExemptionPending && !dismissedPendingExemption}
                onDismissPendingExemption={dismissPendingExemption}
                onSubmitted={handleSubmitted}
                onCancel={() => {
                  setSubmittedViewActive(false);
                  setRequestedMode(null);
                }}
                onRequestEdit={() => {
                  setSubmittedViewActive(false);
                  setRequestedMode("editToday");
                }}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* 历史手稿纪事列表弹窗（内嵌右侧极速微调抽屉） */}
      <Dialog
        open={isHistoryOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (viewingReport) {
              setViewingReport(null);
            } else {
              setIsHistoryOpen(false);
            }
          } else {
            setIsHistoryOpen(true);
          }
        }}
      >
        <DialogContent
          className={cn(
            "fixed inset-0 m-auto z-50 flex flex-col overflow-hidden h-fit max-h-[85dvh] w-[calc(100%-2rem)] rounded-2xl bg-white shadow-claude-dialog p-0 !top-0 !left-0 !translate-x-0 !translate-y-0 transition-[max-width] duration-200",
            viewingReport
              ? "sm:max-w-2xl md:max-w-[680px]"
              : "sm:max-w-4xl md:max-w-[920px]",
          )}
        >
          <div className="flex flex-col flex-1 min-h-0 p-5 sm:p-6">
            {viewingReport ? (
              <>
                <DialogHeader className="shrink-0 pb-3 border-b border-[#ECE7DE]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="s"
                        onClick={() => setViewingReport(null)}
                      >
                        ← 返回手稿列表
                      </Button>
                      <span className="text-[#ECE7DE]">|</span>
                      <DialogTitle className="text-base font-[580] text-[#1C1917] tracking-tight">
                        修改历史手稿 · <span className="tabular-nums">{viewingReport.report_date}</span>
                      </DialogTitle>
                    </div>
                  </div>
                </DialogHeader>
                <DialogBody className="flex-1 min-h-0 overflow-y-auto pt-4">
                  <HistoryReportEditForm
                    key={`history-edit-${viewingReport.id}-${viewingReport.uploaded_at ?? viewingReport.report_date}`}
                    report={viewingReport as HistoryReportEditData}
                    accountDisplayName={accountDisplayNameMap[viewingReport.account_id] ?? viewingReport.account_id}
                    onSaved={() => {
                      setViewingReport(null);
                      void loadActivity();
                    }}
                  />
                </DialogBody>
              </>
            ) : (
              <>
                <DialogHeader className="shrink-0 pb-3">
                  <DialogTitle className="text-base font-[580] text-[#1C1917] tracking-tight">
                    历史手稿纪事
                  </DialogTitle>
                </DialogHeader>

                <DialogBody className="flex-1 min-h-0 overflow-y-auto">
                  {activityError ? (
                    <DashboardActivityError message={activityError} onRetry={() => void loadActivity()} />
                  ) : isActivityLoading ? (
                    <div className="flex h-40 items-center justify-center text-[13px] text-[#78716C]">
                      加载历史记录...
                    </div>
                  ) : !historyReports || historyReports.length === 0 ? (
                    <EmptyState
                      title="历史手稿静待立卷"
                      description="完成创作立卷或补交后，这里将收录最近 30 份纪事手稿。"
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
                        setViewingReport({
                          ...report,
                          report_date: report.report_date,
                          content: report.content ?? null,
                          follower_convert: report.follower_convert ?? null,
                        });
                      }}
                    />
                  )}
                </DialogBody>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 申请豁免弹窗 */}
      {isExemptionDialogOpen && (
        <ExemptionDialogV2
          isOpen={isExemptionDialogOpen}
          onClose={() => setIsExemptionDialogOpen(false)}
          today={today}
          submittedDates={submittedDatesIncludingActivity}
          waiveDates={allExemptionDateBuckets.waiveDates}
          leaveDates={allExemptionDateBuckets.leaveDates}
          pendingDates={localPendingExemptionDates}
          onSubmitRequest={async (request) => {
            const result = await submitExemptionRequest(request);
            if (!result.error) {
              setLocalHasPendingExemption(true);
              setLocalPendingExemptionDates((current) =>
                Array.from(
                  new Set([...current, ...(result.submittedDates ?? [])]),
                ).sort(),
              );
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
