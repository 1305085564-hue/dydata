"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, FilePenLine, History, PencilLine, TrendingUp, Trophy } from "lucide-react";
import { motion } from "framer-motion";
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
import { ResultTrend } from "@/components/charts/result-trend";
import { InteractionTrend } from "@/components/charts/interaction-trend";
import { Leaderboard } from "@/components/leaderboard/leaderboard";
import { Label } from "@/components/ui/label";
import type { Video, VideoTagReviewDimension } from "@/types";
import {
  getExemptionDatesForMonth,
  getExemptionStateForDate,
  type ExemptionGrantLike,
  type ExemptionProfileLike,
} from "@/lib/豁免";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import { DashboardForm, type DashboardReportData } from "./dashboard-form";
import {
  getDashboardMetricGridClass,
  getDashboardStatusClass,
  getDashboardSurfaceClass,
} from "./dashboard-visuals";
import { 申请豁免弹窗 } from "./申请豁免弹窗";
import { HistoryList } from "./history-list";
import { VideoSubmitForm } from "./video-submit-form";
import {
  getTodaySubmissionSummary,
  resolveSubmissionDayStatus,
  resolveSubmitPanelMode,
  type SubmitPanelRequestedMode,
  type TodaySubmissionReportLike,
} from "./video-submit-panel-state";
import { VideoTagReviewCard } from "./video-tag-review-card";
import { cn } from "@/lib/utils";

type MonthReport = Omit<TodaySubmissionReportLike, "account_id"> & {
  id: string;
  account_id: string;
};

type DashboardActionCard = {
  key: string;
  title: string;
  description: string;
  icon: typeof Eye;
  tone: "primary" | "success" | "warning" | "neutral";
  onClick: () => void;
};

interface VideoSubmitPanelProps {
  accounts: { id: string; name: string; display_name: string; content_direction: string | null }[];
  userId: string;
  userDisplayName: string;
  today: string;
  todayReports: TodaySubmissionReportLike[];
  monthReports: MonthReport[];
  history: MonthReport[];
  trendData: DashboardPageData["trendData"];
  leaderboardData: Parameters<typeof Leaderboard>[0]["data"];
  accountIds: string[];
  ownContentDirections: string[];
  accountDisplayNameMap: Record<string, string>;
  hasPendingExemption?: boolean;
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
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
  userDisplayName,
  today,
  todayReports,
  monthReports,
  history,
  trendData,
  leaderboardData,
  accountIds,
  ownContentDirections,
  accountDisplayNameMap,
  hasPendingExemption = false,
  userExemptionProfile,
  userExemptionGrants,
}: VideoSubmitPanelProps) {
  const formAnchorRef = useRef<HTMLDivElement | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [requestedMode, setRequestedMode] = useState<SubmitPanelRequestedMode>(null);
  const [activeBizDate, setActiveBizDate] = useState(today);
  const [isDataViewOpen, setIsDataViewOpen] = useState(false);
  const [isTrendViewOpen, setIsTrendViewOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<MonthReport | null>(null);
  const [lastSubmittedVideoId, setLastSubmittedVideoId] = useState<string | null>(null);
  const [lastAiTags, setLastAiTags] = useState<Array<{
    tag_dimension: VideoTagReviewDimension;
    tag_value: string;
    confidence: number | null;
    reason: string | null;
  }>>([]);
  const [reportOverrides, setReportOverrides] = useState<Record<string, TodaySubmissionReportLike>>({});
  const [pendingBackfillDate, setPendingBackfillDate] = useState<string | null>(null);
  const [pendingFocusDate, setPendingFocusDate] = useState<string | null>(null);

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
      ...monthReports.filter((report) => !overrideKeys.has(`${report.account_id}-${report.report_date}`)),
    ];
  }, [monthReports, reportOverrides]);

  const selectedSummary = useMemo(
    () => (selectedAccount ? getTodaySubmissionSummary(mergedTodayReports, selectedAccount.id) : null),
    [mergedTodayReports, selectedAccount],
  );

  const monthExemptionDates = useMemo(
    () => getExemptionDatesForMonth(userExemptionProfile, today, userExemptionGrants),
    [today, userExemptionGrants, userExemptionProfile],
  );

  const accountCards = useMemo(
    () =>
      accounts.map((account) => {
        const summary = getTodaySubmissionSummary(mergedTodayReports, account.id);
        const todayStatus = resolveSubmissionDayStatus({
          date: today,
          today,
          report: summary,
          exemption: getExemptionStateForDate(userExemptionProfile, today, userExemptionGrants),
        });
        return {
          account,
          summary,
          todayStatus,
        };
      }),
    [accounts, mergedTodayReports, today, userExemptionGrants, userExemptionProfile],
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
  const actionCards = useMemo<DashboardActionCard[]>(
    () => [
      {
        key: "data-view",
        title: "数据查看",
        description: "查看日历状态与当天详情",
        icon: Eye,
        tone: "primary",
        onClick: () => setIsDataViewOpen(true),
      },
      {
        key: "trend-view",
        title: "趋势查看",
        description: "快速查看近期趋势变化",
        icon: TrendingUp,
        tone: "success",
        onClick: () => setIsTrendViewOpen(true),
      },
      {
        key: "leaderboard",
        title: "排行榜",
        description: "查看当前账号表现排名",
        icon: Trophy,
        tone: "warning",
        onClick: () => setIsLeaderboardOpen(true),
      },
      {
        key: "history",
        title: "历史记录",
        description: "查看并编辑最近填报记录",
        icon: History,
        tone: "neutral",
        onClick: () => setIsHistoryOpen(true),
      },
    ],
    [],
  );

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

  function resetPanelForAccount(accountId: string) {
    setSelectedAccountId(accountId);
    setRequestedMode(null);
    setActiveBizDate(today);
    setLastSubmittedVideoId(null);
    setLastAiTags([]);
  }

  function handleSubmitted(
    video: Video,
    aiTags: Array<{
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

    setRequestedMode(null);
    setLastSubmittedVideoId(video.id);
    setLastAiTags(aiTags);
    setIsDataViewOpen(false);
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

  if (!accounts.length) {
    return (
      <Card className="overflow-hidden rounded-3xl border-orange-200 bg-orange-50/80 shadow-sm backdrop-blur-sm">
        <CardContent className="px-6 py-5 text-sm text-orange-700">
          当前没有可提交的数据账号，请联系管理员分配账号后再继续操作。
        </CardContent>
      </Card>
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
        <div className="app-shell-metric-strip dashboard-action-strip" aria-label="快捷功能入口">
          {actionCards.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.key}
                type="button"
                className="app-shell-metric dashboard-top-action-card"
                data-tone={action.tone}
                onClick={action.onClick}
              >
                <div className="dashboard-top-action-card-head">
                  <span className="dashboard-top-action-icon">
                    <Icon className="size-4" />
                  </span>
                  <div className="dashboard-top-action-title">{action.title}</div>
                </div>
                <div className="space-y-1">
                  <div className="app-shell-metric-hint">{action.description}</div>
                </div>
              </button>
            );
          })}
          <申请豁免弹窗
            hasPending={hasPendingExemption}
            today={today}
            submittedDates={submittedDates}
            waiveDates={monthExemptionDates.waiveDates}
            leaveDates={monthExemptionDates.leaveDates}
            initialSelectedDates={activeBizDate ? [activeBizDate] : []}
            triggerClassName="app-shell-metric dashboard-top-action-card"
            triggerVariant="card"
            triggerTitle={hasPendingExemption ? "申请审批中" : "申请豁免"}
            triggerDescription={hasPendingExemption ? "当前有申请正在等待审批" : "发起免交或请假申请"}
          />
        </div>

        <Card className={`${getDashboardSurfaceClass("hero")} overflow-hidden rounded-[1.75rem] border-0`}>
          <CardHeader className="space-y-5 border-b border-border/45 bg-background/20 px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
            <div className="space-y-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    填报设置
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold text-foreground">
                        {userDisplayName || "当前登录人"}
                      </div>
                      <Badge
                        variant="secondary"
                        className="rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[11px] font-medium text-primary"
                      >
                        {accounts.length} 个账号
                      </Badge>
                    </div>
                    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                      点击账号卡片即可切换下方的数据填报内容，日期选择仍可用于查看或补交指定日期的数据。
                    </p>
                  </div>
                </div>

                <div className="dashboard-date-panel">
                  <Label
                    htmlFor="dashboard-biz-date"
                    className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
                  >
                    填报日期
                  </Label>
                  <input
                    id="dashboard-biz-date"
                    type="date"
                    value={activeBizDate}
                    max={today}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (!value) return;
                      setActiveBizDate(value);
                      setRequestedMode(null);
                    }}
                    className="dashboard-date-input"
                  />
                </div>
              </div>

              <div className="dashboard-account-grid" role="list" aria-label="账号切换列表">
                {accountCards.map(({ account, summary, todayStatus }) => {
                  const isSelected = account.id === selectedAccountId;

                  return (
                    <button
                      key={account.id}
                      type="button"
                      role="listitem"
                      aria-pressed={isSelected}
                      data-selected={isSelected ? "true" : "false"}
                      className={cn("dashboard-account-card", isSelected && "dashboard-account-card-selected")}
                      onClick={() => resetPanelForAccount(account.id)}
                    >
                      <div className="dashboard-account-card-header">
                        <div className="space-y-1">
                          <div className="dashboard-account-card-name">{account.display_name}</div>
                          {account.content_direction ? (
                            <div className="dashboard-account-card-direction">{account.content_direction}</div>
                          ) : null}
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "dashboard-account-status",
                            todayStatus.tone === "submitted"
                              ? "dashboard-account-status-submitted"
                              : todayStatus.tone === "leave"
                                ? "dashboard-account-status-leave"
                                : "dashboard-account-status-pending",
                          )}
                        >
                          {todayStatus.state === "submitted"
                            ? "今日已交"
                            : todayStatus.state === "waive"
                              ? "今日免交"
                              : todayStatus.state === "leave"
                                ? "今日请假"
                                : "今日待提交"}
                        </Badge>
                      </div>

                      <div className="dashboard-account-card-footer">
                        <span className="dashboard-account-card-note">
                          {summary?.uploadedAt
                            ? `最近提交 ${summary.uploadedAt}`
                            : todayStatus.state === "waive"
                              ? "今日已按免交处理"
                              : todayStatus.state === "leave"
                                ? "今日已按请假处理"
                                : "点击后直接切换到该账号填报"}
                        </span>
                        <span className="dashboard-account-card-current">
                          {isSelected ? "当前选中" : "点击切换"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {false ? <div className="dashboard-action-grid">
                <Button
                  type="button"
                  variant="outline"
                  className="dashboard-action-button"
                  onClick={() => setIsDataViewOpen(true)}
                >
                  <Eye className="size-[18px]" />
                  <span>数据查看</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="dashboard-action-button"
                  onClick={() => setIsTrendViewOpen(true)}
                >
                  <TrendingUp className="size-[18px]" />
                  <span>趋势查看</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="dashboard-action-button"
                  onClick={() => setIsLeaderboardOpen(true)}
                >
                  <Trophy className="size-[18px]" />
                  <span>排行榜</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="dashboard-action-button"
                  onClick={() => setIsHistoryOpen(true)}
                >
                  <History className="size-[18px]" />
                  <span>历史记录</span>
                </Button>
                <申请豁免弹窗
                  hasPending={hasPendingExemption}
                  today={today}
                  submittedDates={submittedDates}
                  waiveDates={monthExemptionDates.waiveDates}
                  leaveDates={monthExemptionDates.leaveDates}
                  triggerClassName="dashboard-action-button"
                />
              </div> : null}
            </div>
          </CardHeader>

          <CardContent className="space-y-4 px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
            <div ref={formAnchorRef} tabIndex={-1} className="outline-none" />
            {primarySummary && isPrimarySummaryMode ? (
              <div className={`${getDashboardSurfaceClass("success")} rounded-[1.5rem] p-4 text-sm text-emerald-950 sm:p-5`}>
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <span className={getDashboardStatusClass("submitted")}>
                        <FilePenLine className="size-4" />
                        今日数据已提交
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-lg font-semibold text-foreground sm:text-xl">
                        {primarySummary.title?.trim() || "未填写视频标题"}
                      </div>
                      <div className="text-xs leading-5 text-emerald-800/80">
                        提交时间：{primarySummary.uploadedAt || "暂无"}
                        <span className="mx-2">·</span>
                        发布时间：{primarySummary.publishedAt || "暂无"}
                      </div>
                    </div>
                    <div className={getDashboardMetricGridClass("secondary")}>
                      <div className="dashboard-metric-card">
                        <div className="text-xs text-muted-foreground">播放量</div>
                        <div className="text-sm font-semibold text-foreground">{primarySummary.playCount ?? "--"}</div>
                      </div>
                      <div className="dashboard-metric-card">
                        <div className="text-xs text-muted-foreground">互动总量</div>
                        <div className="text-sm font-semibold text-foreground">
                          {(primarySummary.likes ?? 0) +
                            (primarySummary.comments ?? 0) +
                            (primarySummary.shares ?? 0) +
                            (primarySummary.favorites ?? 0)}
                        </div>
                      </div>
                      <div className="dashboard-metric-card">
                        <div className="text-xs text-muted-foreground">涨粉</div>
                        <div className="text-sm font-semibold text-foreground">{primarySummary.followerGain ?? "--"}</div>
                      </div>
                      <div className="dashboard-metric-card">
                        <div className="text-xs text-muted-foreground">完播率</div>
                        <div className="text-sm font-semibold text-foreground">{primarySummary.completionRate ?? "--"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 lg:w-[190px]">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 rounded-2xl bg-white/70"
                      onClick={() => setRequestedMode("editToday")}
                    >
                      <PencilLine className="size-4" />
                      修改今日数据
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {lastSubmittedVideoId && lastAiTags.length ? (
              <VideoTagReviewCard
                videoId={lastSubmittedVideoId}
                tags={lastAiTags}
                onConfirmed={(tags) => setLastAiTags(tags)}
                onSkipped={() => {
                  setLastSubmittedVideoId(null);
                  setLastAiTags([]);
                }}
              />
            ) : null}

            {selectedAccount && shouldShowBlockedStateCard ? (
              <div
                className={cn(
                  "rounded-[1.5rem] p-4 text-sm sm:p-5",
                  activeDateStatus.state === "waive"
                    ? `${getDashboardSurfaceClass("success")} text-emerald-950`
                    : "rounded-[1.5rem] border border-amber-200 bg-amber-50/80 text-amber-950",
                )}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <span className={getDashboardStatusClass(activeDateStatus.tone)}>
                      <FilePenLine className="size-4" />
                      {activeBizDate === today ? `今日${activeDateStatus.label}` : `${activeDateStatus.label}状态`}
                    </span>
                    <div className="space-y-1">
                      <div className="text-lg font-semibold text-foreground sm:text-xl">
                        {activeBizDate} 已标记为{activeDateStatus.label}
                      </div>
                      <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
                        {activeDateStatus.description}
                      </p>
                    </div>
                    {activeExemptionState.reason ? (
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        原因：{activeExemptionState.reason}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {selectedAccount && !shouldShowBlockedStateCard && (!isPrimarySummaryMode || activeBizDate !== today) ? (
              <VideoSubmitForm
                key={`form-${selectedAccount.id}-${activeBizDate}-${primaryMode}`}
                account={selectedAccount}
                userId={userId}
                today={today}
                mode={primaryMode}
                initialSummary={primaryMode === "backfill" ? null : primarySummary}
                initialBizDate={primaryMode === "backfill" ? activeBizDate : null}
                onSubmitted={handleSubmitted}
                onCancel={() => {
                  setRequestedMode(null);
                  setActiveBizDate(today);
                }}
              />
            ) : null}
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={isDataViewOpen} onOpenChange={setIsDataViewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>数据查看</DialogTitle>
          </DialogHeader>

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
            <div className="rounded-[1.75rem] border border-white/70 bg-white/82 p-4 shadow-[var(--shadow-card)] backdrop-blur-[18px] sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
                    Daily Detail
                  </p>
                  <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                    {activeBizDate} 的提交情况
                  </h3>
                  <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
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
                <div className="mt-4 rounded-[1.25rem] border border-emerald-200/70 bg-emerald-50/75 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-emerald-700">
                          {accounts.find((account) => account.id === activeDateReport.account_id)?.display_name ?? "当前账号"}
                        </p>
                        <h4 className="text-base font-semibold text-foreground">
                          {activeDateReport.title?.trim() || "未填写视频标题"}
                        </h4>
                        <p className="mt-1 text-xs text-emerald-800/80">
                          提交时间：{activeDateReport.uploaded_at || "暂无"}
                        </p>
                      </div>

                      <div className={getDashboardMetricGridClass("secondary")}>
                        <div className="dashboard-metric-card">
                          <div className="text-xs text-muted-foreground">播放量</div>
                          <div className="text-sm font-semibold text-foreground">
                            {activeDateReport.play_count?.toLocaleString("zh-CN") ?? "--"}
                          </div>
                        </div>
                        <div className="dashboard-metric-card">
                          <div className="text-xs text-muted-foreground">互动总量</div>
                          <div className="text-sm font-semibold text-foreground">
                            {(activeDateReport.likes ?? 0) +
                              (activeDateReport.comments ?? 0) +
                              (activeDateReport.shares ?? 0) +
                              (activeDateReport.favorites ?? 0)}
                          </div>
                        </div>
                        <div className="dashboard-metric-card">
                          <div className="text-xs text-muted-foreground">涨粉</div>
                          <div className="text-sm font-semibold text-foreground">{activeDateReport.follower_gain ?? "--"}</div>
                        </div>
                        <div className="dashboard-metric-card">
                          <div className="text-xs text-muted-foreground">完播率</div>
                          <div className="text-sm font-semibold text-foreground">{activeDateReport.completion_rate ?? "--"}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 lg:w-[180px]">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-2xl bg-white/90"
                        onClick={() => setEditingReport(activeDateReport)}
                      >
                        <PencilLine className="size-4" />
                        查看并修改
                      </Button>
                    </div>
                  </div>
                </div>
              ) : shouldShowBlockedStateCard ? (
                <div
                  className={cn(
                    "mt-4 rounded-[1.25rem] border p-4",
                    activeDateStatus.state === "waive"
                      ? "border-emerald-200 bg-emerald-50/75"
                      : "border-amber-200 bg-amber-50/80",
                  )}
                >
                  <div className="space-y-2">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        activeDateStatus.state === "waive" ? "text-emerald-700" : "text-amber-700",
                      )}
                    >
                      这一天已标记为{activeDateStatus.label}
                    </p>
                    <p
                      className={cn(
                        "text-sm leading-6",
                        activeDateStatus.state === "waive" ? "text-emerald-900/75" : "text-amber-900/75",
                      )}
                    >
                      {activeDateStatus.description}
                    </p>
                    {activeExemptionState.reason ? (
                      <p className="text-sm text-[var(--color-text-secondary)]">原因：{activeExemptionState.reason}</p>
                    ) : null}
                  </div>
                </div>
              ) : activeDateStatus.state === "future" ? (
                <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-700">这一天还未到</p>
                    <p className="text-sm leading-6 text-slate-600">{activeDateStatus.description}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[1.25rem] border border-rose-200 bg-rose-50/75 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-rose-700">
                        {activeDateStatus.state === "unsubmitted" ? "今天还没有提交数据" : "这一天漏交了数据"}
                      </p>
                      <p className="text-sm leading-6 text-rose-900/75">
                        {activeDateStatus.description} 点击按钮后，将关闭当前弹窗，并把主页主表单切换到 {activeBizDate} 的补交模式。
                      </p>
                    </div>
                    <Button
                      type="button"
                      className="h-11 rounded-2xl"
                      onClick={() => openBackfillForDate(activeBizDate)}
                    >
                      <PencilLine className="size-4" />
                      去补交这一天
                    </Button>
                  </div>
                </div>
              )}
            </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isTrendViewOpen} onOpenChange={setIsTrendViewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>趋势查看</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-2">
            <ResultTrend
              data={trendData.结果趋势}
              personalLabel="我的数据"
              teamAverageLabel="团队 P70"
              emptyText="提交满两天后，可查看结果趋势。"
            />
            <InteractionTrend
              data={trendData.互动趋势}
              personalLabel="我的质量分"
              teamAverageLabel="团队 P70"
              emptyText="提交满两天后，可查看互动质量趋势。"
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isLeaderboardOpen} onOpenChange={setIsLeaderboardOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>排行榜</DialogTitle>
          </DialogHeader>
          <Leaderboard
            data={leaderboardData}
            ownAccountIds={accountIds}
            ownContentDirections={ownContentDirections}
            currentDate={today}
            defaultRange="week"
            defaultCompact
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>历史记录</DialogTitle>
          </DialogHeader>
          {!history || history.length === 0 ? (
            <EmptyState
              icon={History}
              title="暂无历史记录"
              description="完成提交或补交后，这里会显示最近 30 条记录。"
            />
          ) : (
            <HistoryList
              history={history.map((report) => ({
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
    </>
  );
}
