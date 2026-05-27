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

          {confirmed?.summary?.problem_tags && confirmed.summary.problem_tags.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-zinc-400">问题标签</div>
              <div className="flex flex-wrap gap-1.5">
                {confirmed.summary.problem_tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[12px] text-zinc-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {confirmed?.summary?.one_line && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-zinc-400">核心问题</div>
              <p className="text-[13px] leading-relaxed text-zinc-700">
                {confirmed.summary.one_line}
              </p>
            </div>
          )}

          {confirmed?.actions?.instructions && confirmed.actions.instructions.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-zinc-400">下一步动作</div>
              <ol className="space-y-1">
                {confirmed.actions.instructions.map((inst, i) => (
                  <li key={i} className="flex gap-1.5 text-[13px] leading-relaxed text-zinc-700">
                    <span className="shrink-0 font-medium text-[#D97757]">{i + 1}.</span>
                    <span>{inst}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {confirmed?.actions?.message_for_member && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-zinc-400">管理者反馈</div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700">
                {confirmed.actions.message_for_member}
              </p>
            </div>
          )}

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
