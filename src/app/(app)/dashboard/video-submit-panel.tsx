"use client";

import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Video, VideoTagReviewDimension } from "@/types";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import { DashboardForm, type DashboardReportData } from "./dashboard-form";
import {
  getDashboardMetricGridClass,
  getDashboardStatusClass,
  getDashboardSurfaceClass,
} from "./dashboard-visuals";
import { AddAccountDialog } from "./添加账号弹窗";
import { 申请豁免弹窗 } from "./申请豁免弹窗";
import { HistoryList } from "./history-list";
import { VideoSubmitForm } from "./video-submit-form";
import {
  getTodaySubmissionSummary,
  resolveSubmitPanelMode,
  type SubmitPanelRequestedMode,
  type TodaySubmissionReportLike,
} from "./video-submit-panel-state";
import { VideoTagReviewCard } from "./video-tag-review-card";

type MonthReport = Omit<TodaySubmissionReportLike, "account_id"> & {
  id: string;
  account_id: string;
};

interface VideoSubmitPanelProps {
  accounts: { id: string; name: string; display_name: string; content_direction: string | null }[];
  userId: string;
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
  trendData,
  leaderboardData,
  accountIds,
  ownContentDirections,
  accountDisplayNameMap,
  hasPendingExemption = false,
}: VideoSubmitPanelProps) {
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

  const activeDateReport = useMemo(
    () =>
      mergedMonthReports
        .filter((report) => report.report_date === activeBizDate && report.account_id === selectedAccountId)
        .sort((left, right) => (right.uploaded_at ?? "").localeCompare(left.uploaded_at ?? ""))[0] ?? null,
    [activeBizDate, mergedMonthReports, selectedAccountId],
  );

  const submittedDates = useMemo(
    () => Array.from(new Set(mergedMonthReports.filter(r => r.account_id === selectedAccountId).map((report) => report.report_date).filter(Boolean))),
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
    setRequestedMode(null);
    setIsDataViewOpen(false);
  }

  if (!accounts.length) {
    return (
      <Card className="overflow-hidden rounded-3xl border-orange-200 bg-orange-50/80 shadow-sm backdrop-blur-sm">
        <CardContent className="px-6 py-5 text-sm text-orange-700">
          当前没有可提交的数据账号，请联系管理员为你分配账号后再继续操作。
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
        <Card className={`${getDashboardSurfaceClass("hero")} overflow-hidden rounded-[1.75rem] border-0`}>
          <CardHeader className="space-y-4 border-b border-border/45 bg-background/20 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
            <div className="dashboard-field-group space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-semibold text-foreground shrink-0">
                    填报设置
                  </Label>
                  <AddAccountDialog />
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs font-medium border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 shadow-sm transition-all" onClick={() => setIsDataViewOpen(true)}>
                    <Eye className="size-3.5 mr-1.5" />数据
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs font-medium border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 shadow-sm transition-all" onClick={() => setIsTrendViewOpen(true)}>
                    <TrendingUp className="size-3.5 mr-1.5" />趋势
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs font-medium border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 shadow-sm transition-all" onClick={() => setIsLeaderboardOpen(true)}>
                    <Trophy className="size-3.5 mr-1.5" />排行
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs font-medium border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 shadow-sm transition-all" onClick={() => setIsHistoryOpen(true)}>
                    <History className="size-3.5 mr-1.5" />历史
                  </Button>
                  <申请豁免弹窗 hasPending={hasPendingExemption} today={today} submittedDates={submittedDates} />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <Select
                  value={selectedAccountId}
                  onValueChange={(value) => {
                    if (!value) return;
                    resetPanelForAccount(value);
                  }}
                >
                  <SelectTrigger
                    id="video-account-select"
                    className="h-11 flex-1 rounded-[var(--radius-lg)] bg-white border border-black/10 px-4 text-sm shadow-sm transition-all hover:border-primary/30"
                  >
                    <SelectValue placeholder="请选择账号" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative flex-1">
                  <input
                    type="date"
                    value={activeBizDate}
                    max={today}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setActiveBizDate(val);
                        setRequestedMode(null);
                      }
                    }}
                    className="h-11 w-full rounded-[var(--radius-lg)] bg-white border border-black/10 px-4 text-sm shadow-sm transition-all hover:border-primary/30 focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
            

            

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

            {selectedAccount && (!isPrimarySummaryMode || activeBizDate !== today) ? (
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
              selectedDate={activeBizDate}
              onDateSelect={(date, hasSubmission) => {
                setActiveBizDate(date);
                if (hasSubmission) {
                  // If it already has data, we should open the Edit Form directly!
                  const report = mergedMonthReports.filter((r) => r.report_date === date && r.account_id === selectedAccountId).sort((left, right) => (right.uploaded_at ?? "").localeCompare(left.uploaded_at ?? ""))[0];
                  if (report) {
                    setEditingReport(report);
                    // don't close data view, or maybe close it so only one modal is open
                    setIsDataViewOpen(false);
                  }
                } else {
                  // If no data, jump to the backfill form on the main screen
                  setRequestedMode(null);
                  setIsDataViewOpen(false);
                }
              }}
            />

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
                    选择日期后，可查看当日数据；如果当天尚未提交，可直接进入补交流程。
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={activeDateReport ? getDashboardStatusClass("submitted") : getDashboardStatusClass("pending")}
                >
                  {activeDateReport ? "当日已提交" : "当日未提交"}
                </Badge>
              </div>

              {activeDateReport ? (
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
              ) : (
                <div className="mt-4 rounded-[1.25rem] border border-rose-200 bg-rose-50/75 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-rose-700">这一天还没有提交数据</p>
                      <p className="text-sm leading-6 text-rose-900/75">
                        点击按钮后，将关闭当前弹窗，并把主页主表单切换到 {activeBizDate} 的补交模式。
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
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
