"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
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
import type { ContentFeedbackCardDetail, ContentFeedbackCardView, Video, VideoMetricsSnapshot } from "@/types";

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

type DetailTab = "analysis" | "feedback";
type ComparisonVideo = Pick<Video, "id" | "video_title" | "published_at" | "video_url" | "content">;
type ComparisonState = {
  loading: boolean;
  video: ComparisonVideo | null;
  snapshot: VideoMetricsSnapshot | null;
  error: string | null;
};

const statusClassName: Record<Video["anomaly_status"], string> = {
  正常: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  删稿: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  限流: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  投流: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  活动干预: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  "未满24h": "border-zinc-200 bg-zinc-100 text-zinc-600",
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

function formatSeconds(v: number | null | undefined) {
  if (v == null) return "-";
  return `${v.toFixed(1)}s`;
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

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center border-l-2 border-[#D97757] pl-3">
      <h3 className="text-[14px] font-medium tracking-tight text-zinc-800">{children}</h3>
    </div>
  );
}

function InfoCell({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
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
      <div className="mt-1 text-[14px] font-medium tabular-nums text-zinc-800">{value}</div>
    </div>
  );
}

function EmptyBlock({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-[13px] text-zinc-500">
      {children}
    </div>
  );
}

function buildRuleHints(snapshot: VideoMetricsSnapshot | null): string[] {
  if (!snapshot) return ["暂无 24h 数据，建议复核后台截图后再批改。"];

  const hints: string[] = [];
  if (snapshot.bounce_rate_2s != null) {
    hints.push(
      snapshot.bounce_rate_2s >= 45
        ? "2s 跳出率偏高，可能说明开头留人不足，建议复核前 3 秒表达。"
        : "2s 跳出率未见明显异常，倾向于先看后段承接。",
    );
  }
  if (snapshot.completion_rate_5s != null) {
    hints.push(
      snapshot.completion_rate_5s < 35
        ? "5s 完播率偏低，疑似前段承接不够，建议复核开头到正文的过渡。"
        : "5s 完播率有一定支撑，可能说明前段信息还能承接。",
    );
  }
  if (snapshot.completion_rate != null) {
    hints.push(
      snapshot.completion_rate < 18
        ? "完播率偏低，可能存在中后段信息密度或节奏问题，建议复核正文结构。"
        : "完播率相对可参考，倾向于结合互动数据再判断。",
    );
  }
  if (snapshot.follower_gain != null && snapshot.play_count > 0) {
    const followRate = (snapshot.follower_gain / snapshot.play_count) * 100;
    hints.push(
      followRate < 0.05
        ? "涨粉效率偏弱，可能 CTA 或账号价值表达不够清楚，建议复核结尾。"
        : "涨粉效率有一定信号，建议复核哪一段强化了关注理由。",
    );
  }
  return hints.length ? hints : ["当前指标不足以直接判断，建议复核截图、文案和账号历史表现。"];
}

function buildComparisonText(video: VideoRow) {
  if (video.play_change_signal === "surge" && video.play_count_change_pct != null) {
    return `疑似高于同账号上一条 ${formatRate(video.play_count_change_pct)}，建议复核选题、发布时间和流量来源。`;
  }
  if (video.play_change_signal === "halve" && video.play_count_change_pct != null) {
    return `疑似低于同账号上一条 ${formatRate(Math.abs(video.play_count_change_pct))}，建议复核开头留人和内容承接。`;
  }
  return "暂无同账号上一条对比信号，建议结合账号历史数据复核。";
}

const comparisonMetrics: Array<{
  label: string;
  read: (snapshot: VideoMetricsSnapshot) => number | null;
  format: (value: number | null | undefined) => string;
}> = [
  { label: "播放量", read: (snapshot) => snapshot.play_count, format: formatNumber },
  { label: "2s跳出率", read: (snapshot) => snapshot.bounce_rate_2s, format: formatRate },
  { label: "5s完播率", read: (snapshot) => snapshot.completion_rate_5s, format: formatRate },
  { label: "完播率", read: (snapshot) => snapshot.completion_rate, format: formatRate },
  { label: "均播时长", read: (snapshot) => snapshot.avg_play_duration, format: formatSeconds },
  { label: "点赞", read: (snapshot) => snapshot.likes, format: formatNumber },
  { label: "评论", read: (snapshot) => snapshot.comments, format: formatNumber },
  { label: "分享", read: (snapshot) => snapshot.shares, format: formatNumber },
  { label: "收藏", read: (snapshot) => snapshot.favorites, format: formatNumber },
  { label: "涨粉", read: (snapshot) => snapshot.follower_gain, format: formatNumber },
];

export function ContentDetailDialog({
  open,
  onOpenChange,
  video,
  snapshot,
  feedbackCard: feedbackCardProp,
  onFeedbackCardChanged,
}: ContentDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("analysis");
  const [contentExpanded, setContentExpanded] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ComparisonState>({
    loading: false,
    video: null,
    snapshot: null,
    error: null,
  });
  const [cardDetail, setCardDetail] = useState<ContentFeedbackCardDetail | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [mainIssues, setMainIssues] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!open || !video) {
      setCardDetail(null);
      setPreviewImage(null);
      return;
    }
    setActiveTab("analysis");
    setContentExpanded(false);
    setComparison({ loading: true, video: null, snapshot: null, error: null });
    setMainIssues("");
    setFeedback("");
    setCardDetail(null);
    fetch(`/api/admin/content-feedback-cards/${video.id}`)
      .then((res) => res.json())
      .then((data: { feedback_card?: ContentFeedbackCardDetail; error?: string }) => {
        if (data.feedback_card) {
          setCardDetail(data.feedback_card);
          const source = data.feedback_card.confirmed ?? data.feedback_card.draft;
          if (source) {
            setMainIssues(source.summary.one_line || source.summary.problem_tags.join(" / ") || "");
            setFeedback(source.actions.message_for_member || "");
          }
        } else if (feedbackCardProp) {
          setCardDetail({ ...feedbackCardProp, draft: null, confirmed: null });
        }
      })
      .catch(() => {});

    fetch(`/api/admin/content-comparison/${video.id}`)
      .then((res) => res.json())
      .then((data: { previous_video?: ComparisonVideo | null; previous_snapshot?: VideoMetricsSnapshot | null; error?: string }) => {
        if (data.error) {
          setComparison({ loading: false, video: null, snapshot: null, error: data.error });
          return;
        }
        setComparison({
          loading: false,
          video: data.previous_video ?? null,
          snapshot: data.previous_snapshot ?? null,
          error: null,
        });
      })
      .catch(() => {
        setComparison({ loading: false, video: null, snapshot: null, error: "上一条对比加载失败" });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, video?.id]);

  const ruleHints = useMemo(() => buildRuleHints(snapshot), [snapshot]);
  const screenshotItems = useMemo(() => {
    if (!snapshot) return [];
    return [
      ...(snapshot.screenshot_urls ?? []).map((url, index) => ({ label: `数据截图 ${index + 1}`, url })),
      ...(snapshot.curve_screenshot_url ? [{ label: "流量曲线截图", url: snapshot.curve_screenshot_url }] : []),
      ...(snapshot.retention_screenshot_url ? [{ label: "留存截图", url: snapshot.retention_screenshot_url }] : []),
    ];
  }, [snapshot]);

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
          manager_note: feedback.trim() || null,
          summary: {
            one_line: mainIssues.trim() || null,
            problem_tags: parseProblemTags(mainIssues),
          },
          actions: {
            instructions: [],
            message_for_member: feedback.trim() || null,
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-4xl">
        <SheetHeader>
          <div className="pr-8">
            <SheetTitle className="text-[18px] font-medium tracking-tight">
              {video?.video_title || "内容详情"}
            </SheetTitle>
            {video && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
                <span>{video.profiles.name}</span>
                <span>·</span>
                <span>{video.accounts.name}</span>
                <Badge variant="outline" className={`text-[11px] ${statusClassName[video.anomaly_status]}`}>
                  {video.anomaly_status}
                </Badge>
              </div>
            )}
          </div>
        </SheetHeader>
        <SheetBody>
          {video && (
            <div className="space-y-4">
              <div className="flex border-b border-zinc-200">
                {([
                  ["analysis", "分析"],
                  ["feedback", "反馈"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={[
                      "active:translate-y-0 -mb-px border-b-2 px-4 py-2 text-[13px] transition-colors",
                      activeTab === key
                        ? "border-[#D97757] text-zinc-800"
                        : "border-transparent text-zinc-500 hover:text-zinc-800",
                    ].join(" ")}
                    onClick={() => setActiveTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div hidden={activeTab !== "analysis"} className="space-y-6">
                <section className="space-y-2">
                  <SectionTitle>基础信息</SectionTitle>
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

                  {video.content ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="mb-1 text-[11px] text-zinc-400">文案原文</div>
                      <div className="whitespace-pre-wrap break-words text-[13px] leading-6 text-zinc-700">
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
                  ) : (
                    <EmptyBlock>暂无文案原文</EmptyBlock>
                  )}
                </section>

                <section className="space-y-2">
                  <SectionTitle>核心数据</SectionTitle>
                  {snapshot ? (
                    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      <MetricCell label="播放量" value={formatNumber(snapshot.play_count)} />
                      <MetricCell label="2s跳出率" value={formatRate(snapshot.bounce_rate_2s)} />
                      <MetricCell label="5s完播率" value={formatRate(snapshot.completion_rate_5s)} />
                      <MetricCell label="完播率" value={formatRate(snapshot.completion_rate)} />
                      <MetricCell label="均播时长" value={formatSeconds(snapshot.avg_play_duration)} />
                      <MetricCell label="点赞" value={formatNumber(snapshot.likes)} />
                      <MetricCell label="评论" value={formatNumber(snapshot.comments)} />
                      <MetricCell label="分享" value={formatNumber(snapshot.shares)} />
                      <MetricCell label="收藏" value={formatNumber(snapshot.favorites)} />
                      <MetricCell label="涨粉" value={formatNumber(snapshot.follower_gain)} />
                    </div>
                  ) : (
                    <EmptyBlock>暂无 24h 快照数据</EmptyBlock>
                  )}
                </section>

                <section className="space-y-2">
                  <SectionTitle>截图</SectionTitle>
                  {screenshotItems.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {screenshotItems.map((item) => (
                        <button
                          key={`${item.label}-${item.url}`}
                          type="button"
                          className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-left hover:bg-zinc-50"
                          onClick={() => setPreviewImage(item.url)}
                        >
                          <Image
                            src={item.url}
                            alt={item.label}
                            width={320}
                            height={176}
                            unoptimized
                            className="h-44 w-full object-cover"
                          />
                          <div className="px-3 py-2 text-[12px] text-zinc-500">{item.label}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyBlock>暂无截图</EmptyBlock>
                  )}
                </section>

                <section className="space-y-2">
                  <SectionTitle>同账号上一条对比</SectionTitle>
                  <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="text-[13px] leading-6 text-zinc-700">
                      {buildComparisonText(video)}
                    </div>
                    {comparison.loading ? (
                      <div className="text-[12px] text-zinc-500">正在加载上一条作品...</div>
                    ) : comparison.error ? (
                      <div className="text-[12px] text-zinc-500">{comparison.error}</div>
                    ) : comparison.video ? (
                      <>
                        <div className="rounded-lg bg-zinc-50 p-3 text-[12px] text-zinc-600">
                          <div className="font-medium text-zinc-800">
                            {comparison.video.video_title || comparison.video.content?.slice(0, 40) || "上一条作品"}
                          </div>
                          <div className="mt-1">{formatDateTime(comparison.video.published_at)}</div>
                        </div>
                        {snapshot && comparison.snapshot ? (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px] text-left text-[12px]">
                              <thead className="text-zinc-400">
                                <tr className="border-b border-zinc-100">
                                  <th className="py-2 font-medium">指标</th>
                                  <th className="py-2 font-medium">当前作品</th>
                                  <th className="py-2 font-medium">上一条</th>
                                </tr>
                              </thead>
                              <tbody>
                                {comparisonMetrics.map((metric) => (
                                  <tr key={metric.label} className="border-b border-zinc-50">
                                    <td className="py-2 text-zinc-500">{metric.label}</td>
                                    <td className="py-2 tabular-nums text-zinc-800">{metric.format(metric.read(snapshot))}</td>
                                    <td className="py-2 tabular-nums text-zinc-600">{metric.format(metric.read(comparison.snapshot!))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-[12px] text-zinc-500">上一条作品暂无 24h 快照</div>
                        )}
                      </>
                    ) : (
                      <div className="text-[12px] text-zinc-500">暂无上一条可对比作品</div>
                    )}
                  </div>
                </section>

                <section className="space-y-2">
                  <SectionTitle>前端规则指标提示</SectionTitle>
                  <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
                    {ruleHints.map((hint) => (
                      <div key={hint} className="text-[13px] leading-6 text-zinc-700">
                        {hint}
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div hidden={activeTab !== "feedback"} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
                <div className="flex items-center justify-between gap-2">
                  <SectionTitle>反馈</SectionTitle>
                  {cardDetail && cardDetail.workflow_status !== "not_started" && (
                    <Badge variant="outline" className="border-zinc-200 bg-white text-[11px] text-zinc-600">
                      {cardDetail.workflow_label}
                    </Badge>
                  )}
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
                    <label className="text-[12px] font-medium text-zinc-700">改进反馈</label>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      className="w-full resize-none rounded-xl border border-transparent bg-zinc-100/70 p-3 text-[13px] leading-6 text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-200 focus:bg-white focus:shadow-sm focus:outline-none focus:ring-1 focus:ring-zinc-950/5"
                      rows={5}
                      placeholder="写给员工的具体改进建议"
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
                      disabled={isConfirming || (!mainIssues.trim() && !feedback.trim())}
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
              </div>
            </div>
          )}
        </SheetBody>
      </SheetContent>

      {previewImage && (
        <button
          type="button"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/70 p-6"
          onClick={() => setPreviewImage(null)}
        >
          <Image
            src={previewImage}
            alt="截图预览"
            width={1200}
            height={900}
            unoptimized
            className="max-h-full max-w-full rounded-xl bg-white object-contain"
          />
        </button>
      )}
    </Sheet>
  );
}
