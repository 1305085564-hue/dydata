"use client";

import { useEffect, useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { ContentFeedbackCardView, NextDayReviewResult } from "@/types";

type VideoSnapshot = {
  play_count: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  completion_rate: number | null;
  avg_play_duration: number | null;
  likes: number | null;
  comments: number | null;
};

type DetailVideo = {
  id: string;
  video_title: string | null;
  video_url: string | null;
  published_at: string | null;
  anomaly_status: string;
  snapshot?: VideoSnapshot | null;
};

type FeedbackCardItem = {
  video: DetailVideo | null;
  account: { id: string; name: string | null } | null;
  feedback_card: ContentFeedbackCardView & { confirmed: NextDayReviewResult | null };
};

interface FeedbackDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: FeedbackCardItem | null;
  onConfirmed: (cardId: string) => void;
}

function formatNumber(v: number | null | undefined) {
  if (v == null) return "-";
  return new Intl.NumberFormat("zh-CN").format(v);
}

function formatRate(v: number | null | undefined) {
  if (v == null) return "-";
  return `${v.toFixed(1)}%`;
}

export function FeedbackDetailDialog({
  open,
  onOpenChange,
  item,
  onConfirmed,
}: FeedbackDetailDialogProps) {
  const [confirming, setConfirming] = useState(false);
  const [detail, setDetail] = useState<FeedbackCardItem | null>(item);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    if (!open || !item) {
      setDetail(item);
      return;
    }
    setDetail(item);
    const cardId = item.feedback_card.card_id;
    if (!cardId) return;
    setEnriching(true);
    fetch(`/api/dashboard/content-feedback-cards/${cardId}`)
      .then((res) => res.json())
      .then((json: { ok?: boolean; item?: FeedbackCardItem }) => {
        if (json.ok && json.item) setDetail(json.item);
      })
      .catch(() => {})
      .finally(() => setEnriching(false));
  }, [open, item]);

  if (!item) return null;

  const current = detail ?? item;
  const confirmed = current.feedback_card.confirmed;
  const cardId = current.feedback_card.card_id;
  const snapshot = current.video?.snapshot ?? null;

  async function handleConfirm() {
    if (!cardId) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/dashboard/content-feedback-cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "viewed" }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) throw new Error("确认失败");
      onConfirmed(cardId);
      feedbackToast.success("已确认");
    } catch {
      feedbackToast.error("确认失败，请重试");
    } finally {
      setConfirming(false);
    }
  }

  const mainProblem =
    confirmed?.summary?.one_line ||
    (confirmed?.summary?.problem_tags?.length
      ? confirmed.summary.problem_tags.join(" / ")
      : "");
  const improvement = confirmed?.actions?.message_for_member || "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[480px] gap-0 sm:max-w-[480px]">
        <SheetHeader className="gap-3">
          <SheetTitle>复盘反馈</SheetTitle>
          <div className="space-y-1.5">
            <div className="text-[13px] font-medium leading-[1.5] text-stone-900">
              {current.video?.video_title || "（无标题）"}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-stone-500">
              {current.account?.name && <span>{current.account.name}</span>}
              {current.video?.video_url && (
                <>
                  <span className="text-stone-500">·</span>
                  <a
                    href={current.video.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-[#D97757] underline-offset-4 hover:underline"
                  >
                    在抖音查看
                    <ExternalLinkIcon className="size-3 stroke-[1.5]" />
                  </a>
                </>
              )}
            </div>
          </div>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {/* 视频上下文小数据 */}
          {(snapshot || enriching) && (
            <div className="rounded-xl bg-stone-100/50 p-3">
              <div className="text-[12px] font-medium uppercase tracking-[0.25em] text-stone-500">
                视频数据
              </div>
              {enriching && !snapshot ? (
                <div className="mt-2 flex gap-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ) : snapshot ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums text-stone-700">
                  <span>
                    播放 <span className="font-medium text-stone-900">{formatNumber(snapshot.play_count)}</span>
                  </span>
                  {snapshot.completion_rate_5s != null && (
                    <>
                      <span className="text-stone-500">·</span>
                      <span>
                        5s完播{" "}
                        <span className="font-medium text-stone-900">
                          {formatRate(snapshot.completion_rate_5s)}
                        </span>
                      </span>
                    </>
                  )}
                  {snapshot.bounce_rate_2s != null && (
                    <>
                      <span className="text-stone-500">·</span>
                      <span>
                        2s跳出{" "}
                        <span className="font-medium text-stone-900">
                          {formatRate(snapshot.bounce_rate_2s)}
                        </span>
                      </span>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {mainProblem && (
            <div className="space-y-1.5">
              <div className="text-[12px] font-medium uppercase tracking-[0.25em] text-stone-500">
                主要问题
              </div>
              <p className="text-[13px] leading-[1.7] text-stone-700">{mainProblem}</p>
            </div>
          )}

          {improvement && (
            <div className="border-l-2 border-[#D97757] pl-3">
              <div className="text-[12px] font-medium uppercase tracking-[0.25em] text-stone-500">
                建议下次
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13px] font-medium leading-[1.7] text-stone-900">
                {improvement}
              </p>
            </div>
          )}
        </SheetBody>

        <SheetFooter className="border-t border-stone-200">
          <Button
            className="h-10 w-full rounded-lg bg-[#D97757] text-[13px] text-white hover:bg-[#C96442]"
            onClick={handleConfirm}
            disabled={confirming}
          >
            {confirming ? "确认中..." : "我已知悉，确认"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
