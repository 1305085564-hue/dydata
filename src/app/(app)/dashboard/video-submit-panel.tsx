"use client";

import { useMemo, useState } from "react";
import { ChevronDown, FileClock, FilePenLine, PencilLine } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Video, VideoTagReviewDimension } from "@/types";
import { VideoSubmitForm } from "./video-submit-form";
import { VideoTagReviewCard } from "./video-tag-review-card";
import {
  getTodaySubmissionSummary,
  resolveSubmitPanelMode,
  type SubmitPanelRequestedMode,
  type TodaySubmissionReportLike,
} from "./video-submit-panel-state";
import {
  getDashboardMetricGridClass,
  getDashboardStatusClass,
  getDashboardSurfaceClass,
} from "./dashboard-visuals";

interface VideoSubmitPanelProps {
  accounts: { id: string; name: string; content_direction: string | null }[];
  userId: string;
  today: string;
  todayReports: TodaySubmissionReportLike[];
}

export function VideoSubmitPanel({ accounts, userId, today, todayReports }: VideoSubmitPanelProps) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [requestedMode, setRequestedMode] = useState<SubmitPanelRequestedMode>(null);
  const [lastSubmittedVideoId, setLastSubmittedVideoId] = useState<string | null>(null);
  const [lastAiTags, setLastAiTags] = useState<Array<{
    tag_dimension: VideoTagReviewDimension;
    tag_value: string;
    confidence: number | null;
    reason: string | null;
  }>>([]);
  const [reportOverrides, setReportOverrides] = useState<Record<string, TodaySubmissionReportLike>>({});

  const mergedTodayReports = useMemo(() => {
    const overrideEntries = Object.values(reportOverrides);
    const filteredBase = todayReports.filter((report) => !overrideEntries.some((override) => override.account_id === report.account_id));
    return [...overrideEntries, ...filteredBase];
  }, [reportOverrides, todayReports]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId]
  );

  const selectedSummary = useMemo(
    () => (selectedAccount ? getTodaySubmissionSummary(mergedTodayReports, selectedAccount.id) : null),
    [mergedTodayReports, selectedAccount]
  );

  const panelMode = resolveSubmitPanelMode({ summary: selectedSummary, requestedMode });
  const isSummaryMode = panelMode === "summary";

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
        [summaryOverride.account_id!]: summaryOverride,
      }));
    }
    setRequestedMode(null);
    setLastSubmittedVideoId(video.id);
    setLastAiTags(aiTags);
  }

  if (!accounts.length) {
    return (
      <Card className="overflow-hidden rounded-3xl border-orange-200 bg-orange-50/80 shadow-sm backdrop-blur-sm">
        <CardContent className="px-6 py-5 text-sm text-orange-700">
          当前暂无可提交的视频账号，请联系管理员分配账号后再提交。
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      <Card className={`${getDashboardSurfaceClass("hero")} overflow-hidden rounded-[1.75rem] border-0`}>
        <CardHeader className="space-y-5 pb-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="dashboard-section-kicker">视频提交</div>
              <div className="space-y-1">
                <CardTitle className="text-[1.35rem] font-semibold tracking-tight sm:text-2xl">先传截图，再补信息</CardTitle>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  先把截图导进来，再补标题、发布时间和文案。今天已经交过的账号，会先显示结果卡，避免你重复点进表单。
                </p>
              </div>
            </div>

            {selectedAccount ? (
              <div className="dashboard-summary-chip self-start text-xs sm:text-sm">
                当前账号
                <span className="font-semibold text-foreground">{selectedAccount.name}</span>
              </div>
            ) : null}
          </div>

          {accounts.length > 1 ? (
            <div className="dashboard-field-group space-y-2">
              <Label htmlFor="video-account-select" className="text-sm font-medium text-foreground">提交账号</Label>
              <Select
                value={selectedAccountId}
                onValueChange={(value) => {
                  if (!value) return;
                  setSelectedAccountId(value);
                  setRequestedMode(null);
                  setLastSubmittedVideoId(null);
                  setLastAiTags([]);
                }}
              >
                <SelectTrigger
                  id="video-account-select"
                  className="h-12 w-full rounded-2xl bg-background/90 px-4 text-sm"
                >
                  <SelectValue placeholder="请选择账号" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => {
              const isSelected = account.id === (selectedAccount?.id ?? "");
              const summary = getTodaySubmissionSummary(mergedTodayReports, account.id);
              const isSubmitted = Boolean(summary);

              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => {
                    setSelectedAccountId(account.id);
                    setRequestedMode(null);
                    setLastSubmittedVideoId(null);
                    setLastAiTags([]);
                  }}
                  className={[
                    "rounded-[1.35rem] border p-4 text-left transition-all duration-200",
                    isSelected
                      ? "border-primary/35 bg-primary/8 shadow-[0_14px_30px_-20px_rgba(37,99,235,0.42)]"
                      : "border-border/60 bg-background/72 hover:bg-background/92",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">{account.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {account.content_direction?.trim() || "未设置内容方向"}
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={isSubmitted ? getDashboardStatusClass("submitted") : getDashboardStatusClass("pending")}
                    >
                      {isSubmitted ? "今日已提交" : "今日未提交"}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedAccount ? (
            <div className="dashboard-summary-bar">
              <div className="dashboard-summary-chip">
                当前账号
                <span className="font-semibold text-foreground">{selectedAccount.name}</span>
              </div>
              <div className="dashboard-summary-chip">
                日期
                <span className="font-semibold text-foreground">{today}</span>
              </div>
              <div className="dashboard-summary-chip">
                状态
                <span className={selectedSummary ? getDashboardStatusClass("submitted") : getDashboardStatusClass("pending")}>
                  {selectedSummary ? "已提交" : "待提交"}
                </span>
              </div>
            </div>
          ) : null}

          {selectedSummary && isSummaryMode ? (
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
                      {selectedSummary.title?.trim() || "未填写视频标题"}
                    </div>
                    <div className="text-xs leading-5 text-emerald-800/80">
                      提交时间：{selectedSummary.uploadedAt || "暂无"}
                      <span className="mx-2">×</span>
                      发布时间：{selectedSummary.publishedAt || "暂无"}
                    </div>
                  </div>
                  <div className={getDashboardMetricGridClass("secondary")}>
                    <div className="dashboard-metric-card">
                      <div className="text-xs text-muted-foreground">播放量</div>
                      <div className="text-sm font-semibold text-foreground">{selectedSummary.playCount ?? "--"}</div>
                    </div>
                    <div className="dashboard-metric-card">
                      <div className="text-xs text-muted-foreground">互动</div>
                      <div className="text-sm font-semibold text-foreground">
                        {(selectedSummary.likes ?? 0) + (selectedSummary.comments ?? 0) + (selectedSummary.shares ?? 0) + (selectedSummary.favorites ?? 0)}
                      </div>
                    </div>
                    <div className="dashboard-metric-card">
                      <div className="text-xs text-muted-foreground">涨粉</div>
                      <div className="text-sm font-semibold text-foreground">{selectedSummary.followerGain ?? "--"}</div>
                    </div>
                    <div className="dashboard-metric-card">
                      <div className="text-xs text-muted-foreground">完播率</div>
                      <div className="text-sm font-semibold text-foreground">{selectedSummary.completionRate ? `${selectedSummary.completionRate}%` : "--"}</div>
                    </div>
                  </div>
                  {selectedSummary.content ? (
                    <div className="dashboard-field-group text-xs leading-6 text-muted-foreground">
                      <div className="mb-1 font-medium text-foreground">已提交文案</div>
                      {selectedSummary.content}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col gap-2 lg:w-[190px]">
                  <Button type="button" className="h-12 rounded-2xl" onClick={() => setRequestedMode("backfill")}>
                    <FileClock className="size-4" />
                    补交数据
                  </Button>
                  <Button type="button" variant="outline" className="h-12 rounded-2xl bg-white/70" onClick={() => setRequestedMode("editToday")}>
                    <PencilLine className="size-4" />
                    修改今日数据
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {selectedSummary && !isSummaryMode ? (
            <div className="dashboard-field-group flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className={getDashboardStatusClass("editing")}>
                  <ChevronDown className="size-4" />
                  {panelMode === "backfill" ? "正在补交历史数据" : "正在修改今日数据"}
                </span>
              </div>
              <Button type="button" variant="ghost" className="h-8 rounded-xl px-3 text-xs" onClick={() => setRequestedMode(null)}>
                收起
              </Button>
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

          {selectedAccount && !isSummaryMode ? (
            <VideoSubmitForm
              account={selectedAccount}
              userId={userId}
              today={today}
              mode={panelMode}
              initialSummary={selectedSummary}
              onSubmitted={handleSubmitted}
              onCancel={() => setRequestedMode(selectedSummary ? null : requestedMode)}
            />
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}
