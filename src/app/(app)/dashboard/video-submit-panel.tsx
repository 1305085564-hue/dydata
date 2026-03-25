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
      <Card className="overflow-hidden rounded-3xl border-border/60 bg-background/85 shadow-sm backdrop-blur-md">
        <CardHeader className="space-y-4 pb-4">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold tracking-tight">视频提交</CardTitle>
            <p className="text-sm text-muted-foreground">
              先传截图，再补充信息；今日已提交后默认折叠，需要时再修改或补交。
            </p>
          </div>

          {accounts.length > 1 ? (
            <div className="space-y-2">
              <Label htmlFor="video-account-select">提交账号</Label>
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
                  className="h-11 rounded-2xl bg-muted/40"
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

        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                    "rounded-2xl border px-4 py-3 text-left transition-colors",
                    isSelected
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/60 bg-muted/20",
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
                      variant={isSubmitted ? "default" : "secondary"}
                      className={isSubmitted ? "bg-emerald-600 text-white" : ""}
                    >
                      {isSubmitted ? "今日已提交" : "今日未提交"}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedAccount ? (
            <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              当前账号：
              <span className="font-medium text-foreground">{selectedAccount.name}</span>
              <span className="mx-2 text-border">×</span>
              日期：
              <span className="font-medium text-foreground">{today}</span>
              <span className="mx-2 text-border">×</span>
              状态：
              <span className={selectedSummary ? "text-emerald-600" : "text-orange-600"}>
                {selectedSummary ? "已提交" : "待提交"}
              </span>
            </div>
          ) : null}

          {selectedSummary && isSummaryMode ? (
            <div className="rounded-3xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm text-emerald-900">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <FilePenLine className="size-4" />
                    今日数据已提交
                  </div>
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-foreground">
                      {selectedSummary.title?.trim() || "未填写视频标题"}
                    </div>
                    <div className="text-xs text-emerald-700/80">
                      提交时间：{selectedSummary.uploadedAt || "暂无"}
                      <span className="mx-2">×</span>
                      发布时间：{selectedSummary.publishedAt || "暂无"}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl bg-white/70 px-3 py-2">
                      <div className="text-xs text-muted-foreground">播放量</div>
                      <div className="text-sm font-semibold text-foreground">{selectedSummary.playCount ?? "--"}</div>
                    </div>
                    <div className="rounded-2xl bg-white/70 px-3 py-2">
                      <div className="text-xs text-muted-foreground">互动</div>
                      <div className="text-sm font-semibold text-foreground">
                        {(selectedSummary.likes ?? 0) + (selectedSummary.comments ?? 0) + (selectedSummary.shares ?? 0) + (selectedSummary.favorites ?? 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/70 px-3 py-2">
                      <div className="text-xs text-muted-foreground">涨粉</div>
                      <div className="text-sm font-semibold text-foreground">{selectedSummary.followerGain ?? "--"}</div>
                    </div>
                    <div className="rounded-2xl bg-white/70 px-3 py-2">
                      <div className="text-xs text-muted-foreground">完播率</div>
                      <div className="text-sm font-semibold text-foreground">{selectedSummary.completionRate ? `${selectedSummary.completionRate}%` : "--"}</div>
                    </div>
                  </div>
                  {selectedSummary.content ? (
                    <div className="rounded-2xl bg-white/70 px-3 py-3 text-xs leading-6 text-muted-foreground">
                      <div className="mb-1 font-medium text-foreground">已提交文案</div>
                      {selectedSummary.content}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col gap-2 lg:w-[180px]">
                  <Button type="button" className="h-11 rounded-2xl" onClick={() => setRequestedMode("backfill")}>
                    <FileClock className="size-4" />
                    补交数据
                  </Button>
                  <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => setRequestedMode("editToday")}>
                    <PencilLine className="size-4" />
                    修改今日数据
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {selectedSummary && !isSummaryMode ? (
            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <ChevronDown className="size-4" />
                {panelMode === "backfill" ? "正在补交历史数据" : "正在修改今日数据"}
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
