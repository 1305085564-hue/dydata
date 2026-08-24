"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, FilePenLine, History, PencilLine, ShieldAlert, X } from "lucide-react";
import { motion } from "framer-motion";
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
  getExemptionStateForDate,
  type ExemptionGrantLike,
  type ExemptionProfileLike,
} from "@/lib/豁免";
import {
  getDashboardStatusClass,
} from "./dashboard-visuals";
import { HistoryList } from "./history-list";
import { HistoryReportEditForm, type HistoryReportEditData } from "./history-report-edit-form";
import { VideoSubmitFormV2 } from "./video-submit-form-v2";
import { ExemptionDialogV2 } from "./redesign/exemption-dialog-v2";
import {
  getTodaySubmissionSummary,
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

interface VideoSubmitPanelV2Props {
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

/**
 * VideoSubmitPanel V2 - Claude 设计系统改造版
 * 保留所有 Antigravity 业务逻辑，用 Claude 设计系统重写 UI
 */
export function VideoSubmitPanelV2({
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
  activeBizDate: controlledActiveBizDate,
  onActiveBizDateChange,
}: VideoSubmitPanelV2Props) {
  const router = useRouter();
  const handleGoToGrowth = useCallback(() => {
    router.push("/growth");
  }, [router]);

  const formAnchorRef = useRef<HTMLDivElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const internalSelectedAccountId = accounts[0]?.id ?? "";
  const [requestedMode, setRequestedMode] = useState<SubmitPanelRequestedMode>(null);
  const [internalActiveBizDate, setInternalActiveBizDate] = useState(today);
  const [isDataViewOpen, setIsDataViewOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [watchConclusion, setWatchConclusion] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<MonthReport | null>(null);
  const [submittedViewActive, setSubmittedViewActive] = useState(false);
  const [reportOverrides, setReportOverrides] = useState<Record<string, TodaySubmissionReportLike>>({});
  const [pendingBackfillDate, setPendingBackfillDate] = useState<string | null>(null);
  const [pendingFocusDate, setPendingFocusDate] = useState<string | null>(null);
  const [activityData, setActivityData] = useState<AsyncActivityData | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [isExemptionDialogOpen, setIsExemptionDialogOpen] = useState(false);
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
    if ((!isDataViewOpen && !isHistoryOpen) || activityData || activityError) return;
    const timeoutId = window.setTimeout(() => {
      void loadActivity();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activityData, activityError, isDataViewOpen, isHistoryOpen, loadActivity]);

  useEffect(() => {
    if (hasPendingExemption) return;
    try {
      window.localStorage.removeItem("dydata:dismissed-pending-exemption");
    } catch {}
    const timeoutId = window.setTimeout(() => {
      setDismissedPendingExemption(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [hasPendingExemption]);

  const allReportsIncludingOverrides = useMemo(() => {
    const result = [...monthReports];
    for (const override of Object.values(reportOverrides)) {
      const converted = toOverrideReport(override);
      if (!converted) continue;
      const existingIndex = result.findIndex(
        (r) => r.account_id === converted.account_id && r.report_date === converted.report_date,
      );
      if (existingIndex >= 0) {
        result[existingIndex] = converted;
      } else {
        result.push(converted);
      }
    }
    return result;
  }, [monthReports, reportOverrides]);

  const selectedAccount = useMemo(
    () => accounts.find((acc) => acc.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  const primarySummary = useMemo(
    () =>
      getTodaySubmissionSummary(
        activeBizDate,
        selectedAccountId,
        todayReports,
        allReportsIncludingOverrides,
      ),
    [activeBizDate, selectedAccountId, todayReports, allReportsIncludingOverrides],
  );

  const primaryMode = useMemo(
    () => resolveSubmitPanelMode(activeBizDate, today, requestedMode, primarySummary),
    [activeBizDate, today, requestedMode, primarySummary],
  );

  const isPrimarySummaryMode = primaryMode === "today" && primarySummary.submitted;
  const activeDateStatus = useMemo(() => {
    return resolveSubmissionDayStatus({
      bizDate: activeBizDate,
      today,
      summary: primarySummary,
    });
  }, [activeBizDate, today, primarySummary]);

  const activeExemptionState = useMemo(
    () => getExemptionStateForDate(activeBizDate, userExemptionProfile, userExemptionGrants),
    [activeBizDate, userExemptionProfile, userExemptionGrants],
  );

  const shouldShowBlockedStateCard =
    (activeDateStatus.state === "waive" || activeDateStatus.state === "leave") &&
    !submittedViewActive;

  const shouldHideFormForExemption =
    (activeDateStatus.state === "waive" || activeDateStatus.state === "leave") &&
    activeDateStatus.explicitBlock &&
    !submittedViewActive;

  const activeDateReport = useMemo(() => {
    return allReportsIncludingOverrides.find(
      (r) => r.account_id === selectedAccountId && r.report_date === activeBizDate,
    );
  }, [allReportsIncludingOverrides, selectedAccountId, activeBizDate]);

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
    [],
  );

  const handleAccountChange = useCallback(
    (accountId: string) => {
      if (controlledSelectedAccountId !== undefined) return;
      setRequestedMode(null);
      setSubmittedViewActive(false);
    },
    [controlledSelectedAccountId],
  );

  const selectBizDate = useCallback(
    (date: string) => {
      setActiveBizDate(date);
      setRequestedMode(null);
      setSubmittedViewActive(false);
      formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [setActiveBizDate],
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

  const openDatePicker = useCallback(() => {
    dateInputRef.current?.showPicker();
  }, []);

  // 加载观察结论
  useEffect(() => {
    if (!selectedAccountId) return;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setWatchConclusion(null);
      fetch(`/api/dashboard/watch-overview?account_id=${selectedAccountId}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data && data.conclusion) {
            setWatchConclusion(data.conclusion);
          }
        })
        .catch((err) => console.error("Failed to fetch watch overview", err));
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [selectedAccountId]);

  const isActivityLoading = !activityData && !activityError;
  const historyReports = activityData?.history ?? history;

  return (
    <>
      <div className="mx-auto w-full space-y-6 px-4 py-6 lg:px-6">
        {/* 头部：账号选择 + 日期选择 */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between pb-4 border-b border-[#ECE7DE]">
          <div className="flex-1">
            <h1 className="text-[20px] font-semibold text-[#1C1917] tracking-tight">
              今日提交工作台
            </h1>
            <p className="text-[13px] text-[#78716C] mt-1">
              记录运营数据，提交今日内容
            </p>
            {watchConclusion && (
              <p className="text-[12px] text-[#78716C] mt-2 max-w-md">
                {watchConclusion}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* 日期选择器 */}
            {!embeddedChrome && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#78716C]">
                  {activeBizDate === today ? "今天" : "补交日期"}
                </div>
                <button
                  type="button"
                  onClick={openDatePicker}
                  aria-label="选择填报日期或补交历史"
                  className="group inline-flex items-center gap-2.5 rounded-xl border border-[#E5E0D6]/90 bg-white px-4 py-2.5 text-[13px] font-medium text-[#1C1917] shadow-sm transition-all hover:border-[#78716C]/40 hover:shadow-md focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25"
                >
                  <CalendarDays className="size-4 text-[#78716C] transition-transform group-hover:scale-105" />
                  <div className="flex flex-col leading-none space-y-1">
                    <span className="text-base font-semibold tracking-tight text-[#1C1917]">
                      {activeBizDate === today ? "提交今日" : "补交历史"}
                    </span>
                    <span className="text-[12px] font-normal tabular-nums text-[#78716C] group-hover:text-[#292524] transition-colors">
                      {activeBizDate} ▾
                    </span>
                  </div>
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
            )}

            {/* 账号选择下拉 */}
            <div className="space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#78716C]">
                账号
              </div>
              <select
                value={selectedAccountId}
                onChange={(e) => handleAccountChange(e.target.value)}
                className="h-[42px] w-full sm:w-auto rounded-xl border border-[#E5E0D6] bg-white px-4 text-[13px] font-medium text-[#292524] shadow-sm outline-none hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.display_name}
                  </option>
                ))}
              </select>
            </div>

            {/* 历史记录按钮 */}
            <div className="space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#78716C] opacity-0 pointer-events-none">
                操作
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsHistoryOpen(true)}
                  className="h-[42px] rounded-xl border-[#E5E0D6] bg-white text-[13px] font-medium text-[#292524] hover:bg-[#FBF9F5] hover:text-[#1C1917] transition-colors shadow-sm"
                >
                  <History className="size-4 mr-1.5" />
                  历史记录
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsExemptionDialogOpen(true)}
                  className={cn(
                    "h-[42px] rounded-xl border-[#E5E0D6] bg-white text-[13px] font-medium transition-colors shadow-sm",
                    hasPendingExemption
                      ? "border-[#D99E55]/40 bg-[#D99E55]/10 text-[#8A6A2F] hover:bg-[#D99E55]/20"
                      : "text-[#292524] hover:bg-[#FBF9F5] hover:text-[#1C1917]"
                  )}
                >
                  <FilePenLine className="size-4 mr-1.5" />
                  {hasPendingExemption ? "申请审批中" : "申请豁免"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 待审批豁免提示横幅 */}
        {hasPendingExemption && !dismissedPendingExemption && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-[#D99E55]/30 bg-[#D99E55]/10 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Clock className="size-5 shrink-0 text-[#D99E55] mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[13px] font-semibold text-[#8A6A2F]">
                    豁免申请审批中
                  </p>
                  <p className="text-[12px] leading-[1.7] text-[#78716C]">
                    你的豁免申请正在等待管理员审批，审批结果将在这里更新。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={dismissPendingExemption}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#E5E0D6] bg-white px-2.5 text-[12px] font-medium text-[#78716C] transition-colors hover:bg-[#FBF9F5] hover:text-[#292524]"
              >
                <X className="size-3.5" />
                关闭
              </button>
            </div>
          </motion.div>
        )}

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

            {/* 表单区域 */}
            {selectedAccount && !shouldHideFormForExemption && (!isPrimarySummaryMode || activeBizDate !== today || submittedViewActive) ? (
              <VideoSubmitFormV2
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
          submittedDates={activityData?.monthSubmittedDates ?? []}
          waiveDates={userExemptionGrants.filter((g) => g.exemption_type === "waive").map((g) => g.date)}
          leaveDates={userExemptionGrants.filter((g) => g.exemption_type === "leave").map((g) => g.date)}
          onSubmit={async (dates, type, reason) => {
            try {
              const response = await fetch("/api/exemptions/apply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  dates,
                  exemption_type: type,
                  reason,
                }),
              });

              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "申请失败");
              }

              setIsExemptionDialogOpen(false);
              // 刷新页面以显示最新状态
              window.location.reload();
            } catch (error) {
              throw error;
            }
          }}
        />
      )}
    </>
  );
}
