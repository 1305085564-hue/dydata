"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ContentFeedbackCardView, NextDayReviewResult } from "@/types";

type FeedbackCardItem = {
  video: {
    id: string;
    video_title: string | null;
    video_url: string | null;
    published_at: string | null;
    anomaly_status: string;
  } | null;
  account: { id: string; name: string | null } | null;
  feedback_card: ContentFeedbackCardView & { confirmed: NextDayReviewResult | null };
};

interface FeedbackDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: FeedbackCardItem | null;
  onConfirmed: (cardId: string) => void;
}

export function FeedbackDetailDialog({ open, onOpenChange, item, onConfirmed }: FeedbackDetailDialogProps) {
  const [confirming, setConfirming] = useState(false);

  if (!item) return null;

  const confirmed = item.feedback_card.confirmed;
  const cardId = item.feedback_card.card_id;

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md sm:w-[420px]">
        <SheetHeader>
          <SheetTitle>复盘反馈</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-5">
          <div className="space-y-1">
            <div className="text-[13px] font-medium text-zinc-800">
              {item.video?.video_title || "（无标题）"}
            </div>
            {item.account?.name && (
              <div className="text-[12px] text-zinc-400">账号：{item.account.name}</div>
            )}
          </div>

          {(() => {
            const mainProblem = confirmed?.summary?.one_line || (confirmed?.summary?.problem_tags?.length ? confirmed.summary.problem_tags.join(" / ") : "");
            const improvement = confirmed?.actions?.message_for_member || "";
            return (
              <>
                {mainProblem && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-zinc-400">主要问题</div>
                    <p className="text-[13px] leading-relaxed text-zinc-700">{mainProblem}</p>
                  </div>
                )}
                {improvement && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-zinc-400">改进反馈</div>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700">{improvement}</p>
                  </div>
                )}
              </>
            );
          })()}

          <div className="pt-3">
            <Button
              className="h-10 w-full rounded-xl bg-[#D97757] text-[13px] text-white hover:bg-[#C96442]"
              onClick={handleConfirm}
              disabled={confirming}
            >
              {confirming ? "确认中..." : "我已知悉，确认"}
            </Button>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
