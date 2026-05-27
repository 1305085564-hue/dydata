"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
} from "@/components/ui/sheet";
import { getSampleCredibility } from "@/lib/next-day-review";
import type { ContentFeedbackCardDetail, ContentFeedbackCardView, NextDayReviewResult, Video, VideoMetricsSnapshot } from "@/types";

type VideoRow = Video & {
  accounts: { name: string };
  profiles: { name: string };
};

interface ContentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: VideoRow | null;
  snapshot: VideoMetricsSnapshot | null;
  feedbackCard: ContentFeedbackCardView | null;
  onFeedbackCardChanged: (videoId: string, view: ContentFeedbackCardView) => void;
}

type SegmentState = Array<{
  segment_order: number;
  segment_type: string;
  segment_text: string;
  estimated_start_sec: number | null;
  estimated_end_sec: number | null;
}>;

const statusClassName: Record<Video["anomaly_status"], string> = {
  正常: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  删稿: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  限流: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  投流: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  活动干预: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  "未满24h": "border-zinc-200 bg-zinc-100 text-zinc-600",
};

const sampleLevelClass = {
  insufficient: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  partial: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  full: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
};

const healthClass = {
  ok: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  warning: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  problem: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
};

function formatNumber(v: number | null | undefined) {
  if (v == null) return "-";
  return new Intl.NumberFormat("zh-CN").format(v);
}

function formatRate(v: number | string | null | undefined) {
  if (v == null) return "-";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "-";
  return n.toFixed(1) + "%";
}

function formatDateTime(v: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function parseProblemTags(mainIssues: string): string[] {
  const trimmed = mainIssues.trim();
  if (!trimmed) return [];
  const tags = trimmed
    .split(/[/;；\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
  return tags.length > 0 ? tags : [trimmed];
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center border-l-2 border-[#D97757] pl-3">
      <h3 className="text-[14px] font-medium tracking-tight text-zinc-800">{children}</h3>
    </div>
  );
}

function InfoCell({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-[11px] text-zinc-400">{label}</div>
      <div className="mt-1 text-[13px] text-zinc-700">{children ?? value ?? "-"}</div>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-[11px] text-zinc-400">{label}</div>
      <div className="mt-1 text-[14px] font-medium text-zinc-800">{value}</div>
    </div>
  );
}

export function ContentDetailDialog({
  open,
  onOpenChange,
  video,
  snapshot,
  feedbackCard: feedbackCardProp,
  onFeedbackCardChanged,
}: ContentDetailDialogProps) {
  const [segments, setSegments] = useState<SegmentState | null>(null);
  const [reviewResult, setReviewResult] = useState<NextDayReviewResult | null>(null);
  const [expandedSegments, setExpandedSegments] = useState<Set<number>>(new Set());
  const [contentExpanded, setContentExpanded] = useState(false);
  const [isSegmenting, startSegment] = useTransition();
  const [isReviewing, startReview] = useTransition();
  const [cardDetail, setCardDetail] = useState<ContentFeedbackCardDetail | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [mainIssues, setMainIssues] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [managerNote, setManagerNote] = useState("");

  // 打开时加载反馈卡详情
  useEffect(() => {
    if (!open || !video) {
      setCardDetail(null);
      return;
    }
    setMainIssues("");
    setNextAction("");
    setManagerNote("");
    setCardDetail(null);
    fetch(`/api/admin/content-feedback-cards/${video.id}`)
      .then((res) => res.json())
      .then((data: { feedback_card?: ContentFeedbackCardDetail; error?: string }) => {
        if (data.feedback_card) {
          setCardDetail(data.feedback_card);
          const source = data.feedback_card.confirmed ?? data.feedback_card.draft;
          if (source) {
            setMainIssues(source.summary.one_line || source.summary.problem_tags.join(" / ") || "");
            setNextAction(source.actions.instructions.slice(0, 2).join("；") || "");
            setManagerNote(source.actions.message_for_member || "");
          }
        } else if (feedbackCardProp) {
          setCardDetail({ ...feedbackCardProp, draft: null, confirmed: null });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, video?.id]);

  // AI 初稿生成后，自动预填反馈卡并同步服务端返回的 feedback_card
  useEffect(() => {
    if (reviewResult) {
      const instructions = reviewResult.actions.instructions;
      const message = reviewResult.actions.message_for_member;
      setMainIssues(reviewResult.summary.problem_tags.join(" / ") || reviewResult.summary.one_line || "");
      setNextAction(instructions.slice(0, 2).join("；") || "");
      setManagerNote(message || "");
    }
  }, [reviewResult]);

  const credibility = getSampleCredibility(snapshot?.play_count ?? null, video?.anomaly_status ?? null);

  const renderedSegments = useMemo(() => {
    return reviewResult?.segments ?? [];
  }, [reviewResult]);

  const comparisonSummary = useMemo(() => {
    const comparison = reviewResult?.comparison;
    if (!comparison) return "-";

    const baseline = comparison.account_baseline;
    if (!baseline || baseline.sample_count === 0) {
      return "同账号近30天样本不足，暂不做历史基线比较";
    }

    const lines: string[] = [];
    const currentPlay = reviewResult.metrics.play_count;
    const baselinePlay = baseline.play_count;
    if (currentPlay != null && baselinePlay != null) {
      if (currentPlay > baselinePlay) lines.push("播放高于同账号近30天均值");
      if (currentPlay < baselinePlay) lines.push("播放低于同账号近30天均值");
    }

    const currentBounce = reviewResult.metrics.bounce_rate_2s;
    const baselineBounce = baseline.bounce_rate_2s;
    if (currentBounce != null && baselineBounce != null && currentBounce > baselineBounce) {
      lines.push("开头留人弱于历史均值");
    }

    const currentCompletion5s = reviewResult.metrics.completion_rate_5s;
    const baselineCompletion5s = baseline.completion_rate_5s;
    if (currentCompletion5s != null && baselineCompletion5s != null && currentCompletion5s < baselineCompletion5s) {
      lines.push("前段承接弱于历史均值");
    }

    if (!lines.length) return "当前表现与同账号近30天均值接近";
    return lines.slice(0, 2).join("；");
  }, [reviewResult]);

  function handleSegment() {
    if (!video) return;
    startSegment(async () => {
      try {
        const res = await fetch("/api/content-segment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_id: video.id }),
        });
        const data = (await res.json()) as { ok?: boolean; segments?: SegmentState; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "拆段失败");
        setSegments(data.segments ?? []);
        feedbackToast.success("拆段完成");
      } catch (e) {
        feedbackToast.error(e instanceof Error ? e.message : "拆段失败");
      }
    });
  }

  function handleReview(forceRefresh = false) {
    if (!video) return;
    startReview(async () => {
      try {
        const res = await fetch("/api/admin/next-day-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_id: video.id, force_refresh: forceRefresh }),
        });
        const data = (await res.json()) as NextDayReviewResult & { error?: string; code?: string };
        if (!res.ok) throw new Error(data.error ?? "复盘失败");

        setReviewResult(data);
        const problemIdxs = new Set(data.segments.filter((s) => s.health === "problem").map((s) => s.segment_order));
        setExpandedSegments(problemIdxs);
        feedbackToast.success(data.cached ? "已加载缓存复盘结果" : "复盘完成");
        // 复盘完成后刷新反馈卡详情
        const cardRes = await fetch(`/api/admin/content-feedback-cards/${video.id}`);
        const cardData = (await cardRes.json()) as { feedback_card?: ContentFeedbackCardDetail; error?: string };
        if (cardData.feedback_card) {
          setCardDetail(cardData.feedback_card);
          onFeedbackCardChanged(video.id, cardData.feedback_card);
        }
      } catch (e) {
        feedbackToast.error(e instanceof Error ? e.message : "复盘失败");
      }
    });
  }

  function handleCopy() {
    const message = reviewResult?.actions?.message_for_member;
    if (!message) return;
    navigator.clipboard.writeText(message).then(() => {
      feedbackToast.success("整改建议已复制");
    });
  }

  async function handleConfirmAndSend() {
    if (!video) return;
    setIsConfirming(true);
    try {
      const action = (!cardDetail || cardDetail.workflow_status === "not_started")
        ? "create_confirm_send"
        : "confirm_and_send";
      const res = await fetch(`/api/admin/content-feedback-cards/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          manager_note: managerNote.trim() || null,
          summary: {
            one_line: mainIssues.trim() || null,
            problem_tags: parseProblemTags(mainIssues),
          },
          actions: {
            instructions: nextAction.split("；").map((s) => s.trim()).filter(Boolean),
            message_for_member: managerNote.trim() || null,
          },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; feedback_card?: ContentFeedbackCardDetail; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "确认下发失败");
      }
      if (data.feedback_card) {
        setCardDetail(data.feedback_card);
        onFeedbackCardChanged(video.id, data.feedback_card);
      }
      feedbackToast.success("已确认并下发给员工");
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "确认下发失败");
    } finally {
      setIsConfirming(false);
    }
  }

  function toggleSegment(order: number) {
    setExpandedSegments((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  }

  function jumpToSegment(order: number) {
    const el = document.getElementById(`review-segment-${order}`);
    if (el) {
      setExpandedSegments((prev) => new Set([...prev, order]));
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-3xl">
        <SheetHeader>
          <SheetTitle className="text-[18px] font-medium tracking-tight">
            {video?.video_title || "内容详情"}
          </SheetTitle>
        </SheetHeader>
        <SheetBody>

        {video && (
          <div className="space-y-6">
            <section className="space-y-2">
              <SectionTitle>原始材料</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2">
                <InfoCell label="负责人" value={video.profiles.name} />
                <InfoCell label="账号" value={video.accounts.name} />
                <InfoCell label="发布时间" value={formatDateTime(video.published_at)} />
                <InfoCell label="视频链接">
                  {video.video_url ? (
                    <a
                      href={video.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-[#D97757] underline underline-offset-4"
                    >
                      {video.video_url}
                    </a>
                  ) : (
                    "-"
                  )}
                </InfoCell>
              </div>

              {video.content && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="mb-1 text-[11px] text-zinc-400">文案原文</div>
                  <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-6 text-zinc-700">
                    {contentExpanded ? video.content : video.content.slice(0, 220)}
                    {video.content.length > 220 && (
                      <button
                        type="button"
                        className="ml-1 text-[12px] text-[#D97757] underline underline-offset-4"
                        onClick={() => setContentExpanded((v) => !v)}
                      >
                        {contentExpanded ? "收起" : "展开全文"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <SectionTitle>结果数据</SectionTitle>
              {snapshot ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <MetricCell label="播放量" value={formatNumber(snapshot.play_count)} />
                  <MetricCell label="2秒跳出率" value={formatRate(snapshot.bounce_rate_2s)} />
                  <MetricCell label="5秒完播率" value={formatRate(snapshot.completion_rate_5s)} />
                  <MetricCell label="完播率" value={formatRate(snapshot.completion_rate)} />
                  <MetricCell label="均播时长" value={snapshot.avg_play_duration != null ? `${snapshot.avg_play_duration}s` : "-"} />
                  <MetricCell label="涨粉" value={formatNumber(snapshot.follower_gain)} />
                  <MetricCell label="点赞" value={formatNumber(snapshot.likes)} />
                  <MetricCell label="评论" value={formatNumber(snapshot.comments)} />
                  <MetricCell label="分享" value={formatNumber(snapshot.shares)} />
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[13px] text-zinc-500">暂无 24h 快照数据</div>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>AI 初稿</SectionTitle>
                {cardDetail?.workflow_status !== "not_started" && (
                  <Badge variant="outline" className="border-zinc-200 bg-zinc-100 text-[11px] text-zinc-600">
                    已复盘
                  </Badge>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-400">样本可信度</span>
                    <Badge variant="outline" className={`text-[11px] ${sampleLevelClass[credibility.level]}`}>
                      {credibility.label}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-zinc-500">播放量：{snapshot ? formatNumber(snapshot.play_count) : "暂无数据"}</div>
                  <div className="text-[11px] text-zinc-500">{credibility.guide}</div>
                </div>

                <div className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="text-[11px] text-zinc-400">综合诊断</div>
                  <div className="text-[13px] font-medium text-zinc-800">{reviewResult?.summary.one_line ?? "点击上方「一键次日复盘」生成诊断"}</div>
                  {reviewResult?.anomaly_notice && (
                    <div className="text-[11px] text-[#D99E55]">{reviewResult.anomaly_notice}</div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-xl bg-white text-[12px]"
                  onClick={handleSegment}
                  disabled={isSegmenting || !video.content}
                >
                  {isSegmenting ? "拆段中…" : "一键拆段"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-xl bg-white text-[12px]"
                  onClick={() => handleReview(false)}
                  disabled={isReviewing || !snapshot}
                >
                  {isReviewing ? "复盘中…" : "一键次日复盘"}
                </Button>
              </div>

              {!video.content && <div className="text-[11px] text-zinc-500">暂无文案，无法拆段</div>}
              {!snapshot && <div className="text-[11px] text-zinc-500">暂无 24h 快照，无法触发次日复盘</div>}

              {reviewResult && (
                <>
                  <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="text-[12px] font-medium text-zinc-700">对比结论</div>

                    <div className="space-y-2">
                      <div className="text-[11px] text-zinc-400">同账号 30 天基线</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <MetricCell label="样本数" value={String(reviewResult.comparison.account_baseline.sample_count ?? 0)} />
                        <MetricCell label="播放量基线" value={formatNumber(reviewResult.comparison.account_baseline.play_count)} />
                        <MetricCell label="2 秒跳出率基线" value={formatRate(reviewResult.comparison.account_baseline.bounce_rate_2s)} />
                        <MetricCell label="5 秒完播率基线" value={formatRate(reviewResult.comparison.account_baseline.completion_rate_5s)} />
                        <MetricCell label="完播率基线" value={formatRate(reviewResult.comparison.account_baseline.completion_rate)} />
                        <MetricCell label="均播时长基线" value={reviewResult.comparison.account_baseline.avg_play_duration != null ? `${reviewResult.comparison.account_baseline.avg_play_duration}s` : "-"} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] text-zinc-400">同类基线</div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <MetricCell label="是否可用" value={reviewResult.comparison.peer_baseline.available ? "可用" : "不可用"} />
                        <MetricCell label="样本数" value={String(reviewResult.comparison.peer_baseline.sample_count ?? 0)} />
                        <MetricCell
                          label="摘要"
                          value={
                            reviewResult.comparison.peer_baseline.available
                              ? reviewResult.comparison.peer_baseline.summary || "-"
                              : reviewResult.comparison.peer_baseline.summary || "第一版暂未启用同类比较"
                          }
                        />
                      </div>
                    </div>

                    <div className="rounded-xl bg-zinc-50 p-2 text-[11px] text-zinc-600">{comparisonSummary}</div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="text-[12px] font-medium text-zinc-700">段落总览</div>
                    <div className="flex flex-wrap gap-2">
                      {renderedSegments.map((seg) => (
                        <button
                          key={seg.segment_order}
                          type="button"
                          className="active:translate-y-0 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50"
                          onClick={() => jumpToSegment(seg.segment_order)}
                        >
                          [{seg.segment_order + 1}] {seg.segment_type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="text-[12px] font-medium text-zinc-700">整改指令</div>
                    <ol className="space-y-1">
                      {reviewResult.actions.instructions.map((inst, i) => (
                        <li key={i} className="flex gap-2 text-[13px]">
                          <span className="shrink-0 font-medium text-[#D97757]">{i + 1}.</span>
                          <span className="break-words text-zinc-700">{inst}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {renderedSegments.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] text-zinc-500">段落详情</div>
                      {renderedSegments.map((seg) => {
                        const expanded = expandedSegments.has(seg.segment_order);
                        return (
                          <div
                            key={seg.segment_order}
                            id={`review-segment-${seg.segment_order}`}
                            className="rounded-xl border border-zinc-200 bg-white"
                          >
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 p-4 text-left"
                              onClick={() => toggleSegment(seg.segment_order)}
                            >
                              <Badge variant="outline" className={`shrink-0 text-[11px] ${healthClass[seg.health]}`}>
                                {seg.health === "ok" ? "正常" : seg.health === "warning" ? "注意" : "问题"}
                              </Badge>
                              <span className="text-[12px] font-medium text-[#D97757]">[{seg.segment_order + 1}] {seg.segment_type}</span>
                              <span className="flex-1 truncate text-[12px] text-zinc-500">{seg.segment_text.slice(0, 36)}</span>
                              <span className="text-[12px] text-zinc-400">{expanded ? "▲" : "▼"}</span>
                            </button>
                            {expanded && (
                              <div className="space-y-2 border-t border-zinc-100 p-4 text-[12px] text-zinc-600">
                                <div><span className="text-zinc-400">时间：</span>{seg.time_range}</div>
                                <div className="max-h-32 overflow-y-auto break-words"><span className="text-zinc-400">原文：</span>{seg.segment_text}</div>
                                <div className="break-words"><span className="text-zinc-400">判断：</span>{seg.judgement}</div>
                                <div className="break-words"><span className="text-zinc-400">依据：</span>{seg.reason}</div>
                                <div className="break-words"><span className="text-zinc-400">建议：</span><span className="font-medium text-zinc-800">{seg.suggestion}</span></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="text-[12px] font-medium text-zinc-700">发给成员的话</div>
                    <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-6 text-zinc-700">
                      {reviewResult.actions.message_for_member}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-8 rounded-xl bg-white text-[12px]" onClick={handleCopy}>
                      复制整改建议
                    </Button>
                  </div>
                </>
              )}

              {segments && segments.length > 0 && !reviewResult && (
                <div className="space-y-1">
                  <div className="text-[11px] text-zinc-500">文案切段（{segments.length} 段）</div>
                  {segments.map((seg) => (
                    <div key={seg.segment_order} className="rounded-xl border border-zinc-200 bg-white p-2 text-[12px]">
                      <span className="mr-1 font-medium text-[#D97757]">[{seg.segment_order + 1}] {seg.segment_type}</span>
                      <span className="break-words text-zinc-700">{seg.segment_text}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 反馈卡编辑区 */}
            <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>反馈卡编辑区</SectionTitle>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-lg border-zinc-200 px-2.5 text-[11px] text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
                    onClick={() => handleReview(false)}
                    disabled={isReviewing || !snapshot}
                  >
                    {isReviewing ? "生成中…" : "AI 辅助"}
                  </Button>
                  {cardDetail && cardDetail.workflow_status !== "not_started" && (
                    <Badge
                      variant="outline"
                      className={`text-[11px] ${
                        cardDetail.workflow_status === "draft"
                          ? "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700"
                          : cardDetail.workflow_status === "confirmed"
                          ? "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700"
                          : cardDetail.workflow_status === "sent" || cardDetail.workflow_status === "viewed"
                          ? "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700"
                          : "border-zinc-200 bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {cardDetail.workflow_label}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-zinc-700">主要问题</label>
                  <textarea
                    value={mainIssues}
                    onChange={(e) => setMainIssues(e.target.value)}
                    className="w-full resize-none rounded-xl border border-transparent bg-zinc-100/70 p-3 text-[13px] leading-6 text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-200 focus:bg-white focus:shadow-sm focus:outline-none focus:ring-1 focus:ring-zinc-950/5"
                    rows={2}
                    placeholder="例如：开头留人弱 / 选题不清 / 文案承接差"
                    disabled={cardDetail?.workflow_status === "sent" || cardDetail?.workflow_status === "viewed"}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-zinc-700">下一条动作</label>
                  <textarea
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    className="w-full resize-none rounded-xl border border-transparent bg-zinc-100/70 p-3 text-[13px] leading-6 text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-200 focus:bg-white focus:shadow-sm focus:outline-none focus:ring-1 focus:ring-zinc-950/5"
                    rows={2}
                    placeholder="例如：开头先给结论，前 3 秒别铺垫"
                    disabled={cardDetail?.workflow_status === "sent" || cardDetail?.workflow_status === "viewed"}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-zinc-700">管理者反馈</label>
                  <textarea
                    value={managerNote}
                    onChange={(e) => setManagerNote(e.target.value)}
                    className="w-full resize-none rounded-xl border border-transparent bg-zinc-100/70 p-3 text-[13px] leading-6 text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-200 focus:bg-white focus:shadow-sm focus:outline-none focus:ring-1 focus:ring-zinc-950/5"
                    rows={3}
                    placeholder="写给员工的、一段能看懂的话"
                    disabled={cardDetail?.workflow_status === "sent" || cardDetail?.workflow_status === "viewed"}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                {(!cardDetail || cardDetail.workflow_status === "not_started" || cardDetail.workflow_status === "draft" || cardDetail.workflow_status === "confirmed") && (
                  <Button
                    size="sm"
                    className="h-9 rounded-lg bg-[#D97757] text-[12px] text-white hover:bg-[#C96442]"
                    onClick={handleConfirmAndSend}
                    disabled={isConfirming || (!mainIssues.trim() && !nextAction.trim() && !managerNote.trim())}
                  >
                    {isConfirming ? "下发中..." : "确认并下发"}
                  </Button>
                )}
                {(cardDetail?.workflow_status === "sent" || cardDetail?.workflow_status === "viewed") && (
                  <Badge variant="outline" className="border-zinc-200 bg-[#6FAA7D]/5 text-[11px] text-[#6FAA7D]">
                    已下发给员工
                  </Badge>
                )}
              </div>
            </section>
          </div>
        )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
