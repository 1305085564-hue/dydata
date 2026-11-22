"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { Video } from "@/types";
import { getExemptionStateForDate, getAllExemptionDates } from "@/lib/豁免";
import {
  getDashboardSubmittedDates,
  getTodaySubmissionSummary,
  collectDashboardReportRows,
  mergeDashboardReports,
  resolveSubmissionDayStatus,
  resolveSubmitPanelMode,
  type SubmitPanelRequestedMode,
  type TodaySubmissionReportLike,
} from "@/lib/dashboard-submission-state";
import { fetchDashboardActivity, fetchVideoSubmissionEditDetail } from "@/lib/video-submit/data/activity";
import { resolvePanelHeaderStatus } from "@/lib/dashboard-panel-header";
import { useMonthFulfillment } from "./use-month-fulfillment";
import { useReviewNoticeDismissal } from "./use-review-notice-dismissal";
import { withdrawMyPendingExemptions } from "@/lib/withdraw-requests-client";
import {
  resolvePanelRequestedMode,
  resolvePanelSubmittedState,
} from "@/lib/video-submit/domain/panel-state";
import type {
  AsyncActivityData,
  EditDetailLoadState,
  VideoSubmitPanelV2Props,
} from "@/lib/video-submit/domain/types";
import { useVideoSubmitPanelNavigation } from "./video-submit-panel-navigation";
import { VideoSubmitPanelBody } from "@/app/(app)/dashboard/video-submit-panel-body";
import { VideoSubmitPanelToolbar } from "@/components/video-submit/video-submit-panel-toolbar";
import { VideoSubmitPanelHistoryDialog } from "@/components/video-submit/video-submit-panel-history-dialog";
import { VideoSubmitPanelExemptionDialog } from "@/components/video-submit/video-submit-panel-exemption-dialog";
import { getPublishedDateKey } from "@/lib/date-semantics";
import { clearBrowserAppealSuccessSession, hasBrowserAppealSuccessSession } from "@/lib/video-submit/domain/appeal-success-session";
import type { FormProgress } from "@/lib/video-submit/domain/submit-gaps";
import type { LastSubmittedReportPreferences } from "@/lib/video-submit-preferences";

export { fetchDashboardActivity, fetchVideoSubmissionEditDetail } from "@/lib/video-submit/data/activity";

/** 工作台提交面板。 */
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
  pendingExemptionItems = [],
  lastSubmissionPreferencesByAccount = {},
  absentDates = [],
  absentReasons = {},
  monthFulfillmentBasis,
  userExemptionReviewNotices = [],
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
  const searchParams = useSearchParams();
  const resumeAppealId = searchParams.get("resumeAppeal");
  const resumeAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!resumeAppealId || resumeAttemptedRef.current === resumeAppealId) return;
    resumeAttemptedRef.current = resumeAppealId;
    void (async () => {
      try {
        const response = await fetch("/api/admin/fulfillment/appeals/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appealId: resumeAppealId }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          toast.error(payload.error || "补交数据续交失败，请打开填报页重试");
          return;
        }
        toast.success("补交数据已自动提交");
        router.replace("/dashboard");
        router.refresh();
      } catch {
        toast.error("补交数据没能续交，请打开填报页重试");
      }
    })();
  }, [resumeAppealId, router]);
  const handleGoToTopics = useCallback(() => {
    router.push("/topics");
  }, [router]);

  const formAnchorRef = useRef<HTMLDivElement | null>(null);
  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [requestedMode, setRequestedMode] = useState<SubmitPanelRequestedMode>(null);
  const [internalSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [internalActiveBizDate, setInternalActiveBizDate] = useState(today);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [submittedEditTarget, setSubmittedEditTarget] = useState<{ reportId: string | null; reportDate: string } | null>(null);
  const initialSelectedAccountId = controlledSelectedAccountId ?? accounts[0]?.id ?? "";
  const [submittedViewActive, setSubmittedViewActive] = useState(() => hasBrowserAppealSuccessSession(initialSelectedAccountId, today));
  const [reportOverrides, setReportOverrides] = useState<Record<string, TodaySubmissionReportLike>>({});
  const [activityData, setActivityData] = useState<AsyncActivityData | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [editDetailLoadState, setEditDetailLoadState] = useState<EditDetailLoadState>({
    status: "idle",
    detail: null,
    error: null,
  });
  const [editDetailRequestVersion, setEditDetailRequestVersion] = useState(0);
  const [isExemptionDialogOpen, setIsExemptionDialogOpen] = useState(false);
  const [localHasPendingExemption, setLocalHasPendingExemption] = useState(hasPendingExemption);
  const [localPendingExemptionDates, setLocalPendingExemptionDates] = useState(pendingExemptionDates);
  const [localPendingExemptionItems, setLocalPendingExemptionItems] = useState(pendingExemptionItems);
  const [submittedPreferenceOverrides, setSubmittedPreferenceOverrides] = useState<Record<string, LastSubmittedReportPreferences>>({});
  const [dismissedPendingExemption, setDismissedPendingExemption] = useState(false);
  const [formProgress, setFormProgress] = useState<FormProgress | null>(null);

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

  const { dismissed: dismissedReviewNotice, dismiss: handleDismissReviewNotice } = useReviewNoticeDismissal(userExemptionReviewNotices);

  const selectedAccountId = controlledSelectedAccountId ?? internalSelectedAccountId;
  const activeBizDate = controlledActiveBizDate ?? internalActiveBizDate;

  useEffect(() => {
    setLocalHasPendingExemption(hasPendingExemption);
    setLocalPendingExemptionDates(pendingExemptionDates);
    setLocalPendingExemptionItems(pendingExemptionItems);
  }, [hasPendingExemption, pendingExemptionDates, pendingExemptionItems]);
  const setActiveBizDate = useCallback(
    (date: string) => {
      setInternalActiveBizDate(date);
      onActiveBizDateChange?.(date);
    },
    [onActiveBizDateChange],
  );

  const loadActivity = useCallback(async ({ append = false }: { append?: boolean } = {}) => {
    if (append && (activityLoadingMore || !activityData?.hasMore)) return;
    setActivityError(null);
    if (append) setActivityLoadingMore(true);
    try {
      const next = await fetchDashboardActivity(fetch, {
        page: append ? (activityData?.page ?? 1) + 1 : 1,
        pageSize: activityData?.pageSize ?? 30,
      });
      setActivityData((current) => append && current
        ? {
            ...next,
            history: [...current.history, ...next.history],
          }
        : next);
    } catch (cause) {
      if (!append) setActivityData(null);
      setActivityError(cause instanceof Error ? cause.message : "活动记录加载失败");
    } finally {
      if (append) setActivityLoadingMore(false);
    }
  }, [activityData, activityLoadingMore]);

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

  const allReportRowsIncludingOverrides = useMemo(
    () => collectDashboardReportRows({
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
      ...allReportsIncludingOverrides.filter((report) => getPublishedDateKey(report) === today),
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

  const activeDateReports = useMemo(() => {
    return allReportRowsIncludingOverrides.filter(
      (r) => r.account_id === selectedAccountId && getPublishedDateKey(r) === activeBizDate,
    );
  }, [activeBizDate, allReportRowsIncludingOverrides, selectedAccountId]);

  const activeDateReport = useMemo(() => {
    return activeDateReports.find((report) => report.id === selectedReportId)
      ?? activeDateReports[0]
      ?? null;
  }, [activeDateReports, selectedReportId]);

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
        requestedMode: resolvePanelRequestedMode(activeBizDate, today, requestedMode),
        report: activeDateReport,
        activeDateStatus,
      }),
    [activeBizDate, activeDateReport, activeDateStatus, primarySummary, requestedMode, today],
  );

  const headerStatus = useMemo(
    () =>
      resolvePanelHeaderStatus({
        activeBizDate,
        today,
        primaryMode,
        dayStatus: activeDateStatus,
        formProgress,
      }),
    [activeBizDate, activeDateStatus, formProgress, primaryMode, today],
  );

  // 同一状态只在一处说：请假事由并入页头副行，不再单起一行
  const headerExemptionReason = useMemo(
    () =>
      activeExemptionState.isExempt && activeExemptionState.category === "leave"
        ? activeExemptionState.reason?.trim() || null
        : null,
    [activeExemptionState.category, activeExemptionState.isExempt, activeExemptionState.reason],
  );

  const monthFulfillment = useMonthFulfillment({
    today,
    submittedDates: submittedDatesIncludingActivity,
    exemptionDateBuckets: allExemptionDateBuckets,
    pendingExemptionDates: localPendingExemptionDates,
    basis: monthFulfillmentBasis,
    profile: userExemptionProfile,
    grants: userExemptionGrants,
  });

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
      void fetchVideoSubmissionEditDetail({
        accountId: selectedAccount.id,
        bizDate: submittedEditTarget?.reportDate ?? activeDateReport?.report_date ?? activeBizDate,
        reportId: submittedEditTarget?.reportId ?? activeDateReport?.id ?? null,
      })
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
  }, [activeDateReport?.id, activeDateReport?.report_date, activeBizDate, editDetailRequestVersion, primaryMode, selectedAccount, submittedEditTarget?.reportDate, submittedEditTarget?.reportId]);

  const isPrimarySummaryMode = primaryMode === "summary" && primarySummary !== null;
  // 免交/请假日只由页头状态句说明，表单照常可交（与长期免交一致），不再隐藏成空白。
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
    !isEditing &&
    primaryMode !== "create";
  const shouldShowEditDetailLoading = isEditing && editDetailLoadState.status === "loading";
  const shouldShowEditDetailError = isEditing && editDetailLoadState.status === "error";
  const isExemptionPending = localHasPendingExemption;
  const shouldShowForm =
    Boolean(selectedAccount) &&
    !shouldShowActivityLoadingCard &&
    !shouldShowActivityErrorCard &&
    !shouldShowHistoricalSubmittedCard &&
    (!isEditing || editDetailLoadState.status === "ready") &&
    (!isPrimarySummaryMode || activeBizDate !== today || submittedViewActive || isEditing);

  const handleSubmitted = useCallback((
    video: Video | null,
    summaryOverride?: TodaySubmissionReportLike | null,
    submissionPreferences?: LastSubmittedReportPreferences & { accountId: string },
  ) => {
      const nextState = resolvePanelSubmittedState();
      setSubmittedViewActive(nextState.submittedViewActive);
      setRequestedMode(nextState.requestedMode);
      void loadActivity();
      setSubmittedEditTarget(null);
      if (submissionPreferences) {
        const { accountId, ...preferences } = submissionPreferences;
        setSubmittedPreferenceOverrides((current) => ({ ...current, [accountId]: preferences }));
      }

      if (summaryOverride) {
        const key = summaryOverride.id ?? `${summaryOverride.account_id}-${summaryOverride.report_date}`;
        setReportOverrides((current) => ({
          ...current,
          [key]: { ...summaryOverride, id: summaryOverride.id ?? null },
        }));
      }

      setTimeout(() => {
        formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    },
    [loadActivity],
  );

  const { selectBizDate, requestHistoryEdit } = useVideoSubmitPanelNavigation({
    activityAvailable: Boolean(activityData),
    activityFailed: Boolean(activityError),
    loadActivity,
    today,
    setActiveBizDate,
    setSelectedReportId,
    setSubmittedEditTarget,
    setSubmittedViewActive,
    setRequestedMode,
    setIsHistoryOpen,
    onSelectedAccountChange,
  });

  const dismissPendingExemption = useCallback(() => {
    setDismissedPendingExemption(true);
    try {
      window.localStorage.setItem("dydata:dismissed-pending-exemption", JSON.stringify({ date: today }));
    } catch {}
  }, [today]);

  // 撤回后以服务端为准：先本地清掉提示，再刷新让日历、角标、横幅与管理员侧一致
  const withdrawPendingExemption = useCallback(async () => {
    const result = await withdrawMyPendingExemptions();
    if (!result.ok) return void toast.error(result.error);
    setLocalHasPendingExemption(false);
    setLocalPendingExemptionDates([]);
    setLocalPendingExemptionItems([]);
    toast.success(result.message);
    router.refresh();
  }, [router]);

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
      <div className="space-y-5">
        <VideoSubmitPanelToolbar
          headerStatus={headerStatus}
          monthFulfillment={monthFulfillment}
          exemptionReason={headerExemptionReason}
          isCalendarOpen={isCalendarOpen}
          setIsCalendarOpen={setIsCalendarOpen}
          calendarPopoverRef={calendarPopoverRef}
          activeBizDate={activeBizDate}
          today={today}
          submittedDatesIncludingActivity={submittedDatesIncludingActivity}
          allExemptionDateBuckets={allExemptionDateBuckets}
          localPendingExemptionDates={localPendingExemptionDates}
          absentDates={absentDates}
          absentReasons={absentReasons}
          selectBizDate={selectBizDate}
          setIsExemptionDialogOpen={setIsExemptionDialogOpen}
          setIsHistoryOpen={setIsHistoryOpen}
        />
        <VideoSubmitPanelBody
          formAnchorRef={formAnchorRef}
          shouldShowForm={shouldShowForm}
          isExemptionPending={isExemptionPending}
          pendingExemptionItems={localPendingExemptionItems}
          lastSubmissionPreferences={submittedPreferenceOverrides[selectedAccountId] ?? lastSubmissionPreferencesByAccount[selectedAccountId] ?? null}
          dismissedPendingExemption={dismissedPendingExemption}
          userExemptionReviewNotices={userExemptionReviewNotices}
          dismissedReviewNotice={dismissedReviewNotice}
          handleDismissReviewNotice={handleDismissReviewNotice}
          dismissPendingExemption={dismissPendingExemption}
          onWithdrawPendingExemption={withdrawPendingExemption}
          isPrimarySummaryMode={isPrimarySummaryMode}
          activeBizDate={activeBizDate}
          today={today}
          submittedViewActive={submittedViewActive}
          setSubmittedViewActive={setSubmittedViewActive}
          primarySummary={primarySummary!}
          handleGoToTopics={handleGoToTopics}
          activeDateStatus={activeDateStatus}
          shouldShowActivityErrorCard={shouldShowActivityErrorCard}
          loadActivity={loadActivity}
          shouldShowActivityLoadingCard={shouldShowActivityLoadingCard}
          shouldShowHistoricalSubmittedCard={shouldShowHistoricalSubmittedCard}
          activeDateReport={activeDateReport}
          requestedEditBizDate={submittedEditTarget?.reportDate ?? null}
          onRequestEditSubmittedReport={setSubmittedEditTarget}
          onCreateAnother={() => {
            clearBrowserAppealSuccessSession(selectedAccountId, today);
            setSubmittedEditTarget(null);
            setSubmittedViewActive(false);
            setRequestedMode("createAnother");
          }}
          clearSubmittedEditTarget={() => setSubmittedEditTarget(null)}
          setRequestedMode={setRequestedMode}
          shouldShowEditDetailLoading={shouldShowEditDetailLoading}
          shouldShowEditDetailError={shouldShowEditDetailError}
          editDetailLoadState={editDetailLoadState}
          setEditDetailRequestVersion={setEditDetailRequestVersion}
          onActiveBizDateChange={onActiveBizDateChange}
          selectedAccount={selectedAccount}
          userId={userId}
          userDisplayName={userDisplayName}
          primaryMode={primaryMode}
          initialTopicId={initialTopicId}
          initialTopicTitle={initialTopicTitle}
          handleSubmitted={handleSubmitted}
          onFormProgressChange={setFormProgress}
          activeDateReports={activeDateReports}
          selectedReportId={selectedReportId}
          setSelectedReportId={setSelectedReportId}
          onViewHistory={() => {
            setSubmittedViewActive(false);
            setRequestedMode(null);
            setIsHistoryOpen(true);
          }}
          onViewVideo={(videoId) => {
            router.push(`/admin/content?videoId=${encodeURIComponent(videoId)}`, { scroll: false });
          }}
        />
      </div>

      <VideoSubmitPanelHistoryDialog
        isHistoryOpen={isHistoryOpen}
        setIsHistoryOpen={setIsHistoryOpen}
        accountDisplayNameMap={accountDisplayNameMap}
        loadActivity={loadActivity}
        activityError={activityError}
        isActivityLoading={isActivityLoading}
        isActivityLoadingMore={activityLoadingMore}
        hasMore={activityData?.hasMore === true}
        onLoadMore={() => void loadActivity({ append: true })}
        historyReports={historyReports}
        onRequestEdit={requestHistoryEdit}
      />

      <VideoSubmitPanelExemptionDialog
        isExemptionDialogOpen={isExemptionDialogOpen}
        setIsExemptionDialogOpen={setIsExemptionDialogOpen}
        today={today}
        submittedDatesIncludingActivity={submittedDatesIncludingActivity}
        allExemptionDateBuckets={allExemptionDateBuckets}
        localPendingExemptionDates={localPendingExemptionDates}
        setLocalHasPendingExemption={setLocalHasPendingExemption}
        setLocalPendingExemptionDates={setLocalPendingExemptionDates}
        setLocalPendingExemptionItems={setLocalPendingExemptionItems}
        loadActivity={loadActivity}
      />


    </>
  );
}
