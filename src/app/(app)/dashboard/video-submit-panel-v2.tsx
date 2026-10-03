"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { Video, VideoTagReviewDimension } from "@/types";
import { getExemptionStateForDate, getAllExemptionDates } from "@/lib/豁免";
import {
  getDashboardSubmittedDates,
  getTodaySubmissionSummary,
  mergeDashboardReports,
  resolveSubmissionDayStatus,
  resolveSubmitPanelMode,
  type SubmitPanelRequestedMode,
  type TodaySubmissionReportLike,
} from "@/lib/dashboard-submission-state";
import { fetchDashboardActivity, fetchVideoSubmissionEditDetail } from "@/lib/video-submit/data/activity";
import {
  resolvePanelDateSelection,
  resolvePanelRequestedMode,
  resolvePanelSubmittedState,
} from "@/lib/video-submit/domain/panel-state";
import type {
  AsyncActivityData,
  EditDetailLoadState,
  MonthReport,
  VideoSubmitPanelV2Props,
} from "@/lib/video-submit/domain/types";
import { VideoSubmitPanelBody } from "@/components/video-submit/video-submit-panel-body";
import { VideoSubmitPanelToolbar } from "@/components/video-submit/video-submit-panel-toolbar";
import { VideoSubmitPanelHistoryDialog } from "@/components/video-submit/video-submit-panel-history-dialog";
import { VideoSubmitPanelExemptionDialog } from "@/components/video-submit/video-submit-panel-exemption-dialog";

export { fetchDashboardActivity, fetchVideoSubmissionEditDetail } from "@/lib/video-submit/data/activity";







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
        toast.error("补交数据续交失败，请打开填报页重试");
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
        requestedMode: resolvePanelRequestedMode(activeBizDate, today, requestedMode),
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
      const nextState = resolvePanelSubmittedState();
      setSubmittedViewActive(nextState.submittedViewActive);
      setRequestedMode(nextState.requestedMode);
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
      const nextState = resolvePanelDateSelection(date, today, Boolean(activityData), Boolean(activityError));
      setRequestedMode(nextState.requestedMode);
      setSubmittedViewActive(nextState.submittedViewActive);
      if (nextState.shouldLoadActivity) {
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
      <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-5.5">
        <VideoSubmitPanelToolbar
          primaryMode={primaryMode}
          isCalendarOpen={isCalendarOpen}
          setIsCalendarOpen={setIsCalendarOpen}
          calendarPopoverRef={calendarPopoverRef}
          activeBizDate={activeBizDate}
          today={today}
          submittedDatesIncludingActivity={submittedDatesIncludingActivity}
          allExemptionDateBuckets={allExemptionDateBuckets}
          localPendingExemptionDates={localPendingExemptionDates}
          selectBizDate={selectBizDate}
          setIsExemptionDialogOpen={setIsExemptionDialogOpen}
          setIsHistoryOpen={setIsHistoryOpen}
        />
        <VideoSubmitPanelBody
          formAnchorRef={formAnchorRef}
          shouldShowForm={shouldShowForm}
          isExemptionPending={isExemptionPending}
          dismissedPendingExemption={dismissedPendingExemption}
          userExemptionReviewNotice={userExemptionReviewNotice}
          dismissedReviewNotice={dismissedReviewNotice}
          handleDismissReviewNotice={handleDismissReviewNotice}
          dismissPendingExemption={dismissPendingExemption}
          isPrimarySummaryMode={isPrimarySummaryMode}
          shouldShowBlockedStateCard={shouldShowBlockedStateCard}
          activeBizDate={activeBizDate}
          today={today}
          submittedViewActive={submittedViewActive}
          setSubmittedViewActive={setSubmittedViewActive}
          primarySummary={primarySummary!}
          handleGoToTopics={handleGoToTopics}
          activeDateStatus={activeDateStatus}
          activeExemptionState={activeExemptionState}
          shouldShowActivityErrorCard={shouldShowActivityErrorCard}
          loadActivity={loadActivity}
          shouldShowActivityLoadingCard={shouldShowActivityLoadingCard}
          shouldShowHistoricalSubmittedCard={shouldShowHistoricalSubmittedCard}
          activeDateReport={activeDateReport}
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
        />
      </div>

      <VideoSubmitPanelHistoryDialog
        isHistoryOpen={isHistoryOpen}
        setIsHistoryOpen={setIsHistoryOpen}
        viewingReport={viewingReport}
        setViewingReport={setViewingReport}
        accountDisplayNameMap={accountDisplayNameMap}
        loadActivity={loadActivity}
        activityError={activityError}
        isActivityLoading={isActivityLoading}
        historyReports={historyReports}
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
        loadActivity={loadActivity}
      />


    </>
  );
}
