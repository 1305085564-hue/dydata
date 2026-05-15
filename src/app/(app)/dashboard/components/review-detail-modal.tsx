"use client";

import { useState, useTransition } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { toast } from "sonner";

import { reviewSopCheckpointAction } from "@/app/actions/sop";
import type { SopCheckpoint, SopReviewScores } from "@/types";
import { REVIEW_DIMENSIONS, checkpointLabel } from "./status-theme";

interface ReviewDetailModalProps {
  submission: {
    id: string;
    user_id: string;
    checkpoint: string;
    topic_text: string | null;
    script_text: string | null;
    video_url: string | null;
    review_status: string;
  };
  onClose: () => void;
  onReviewed: (submission: ReviewDetailModalProps["submission"]) => void;
  onReviewFailed: (submission: ReviewDetailModalProps["submission"]) => void;
}

/**
 * 审核详情弹窗
 * 法典 V1：无 shadow-2xl；无 hover:scale；统一 ring-1 细光环
 */
export function ReviewDetailModal({
  submission,
  onClose,
  onReviewed,
  onReviewFailed,
}: ReviewDetailModalProps) {
  const [scores, setScores] = useState<SopReviewScores>({
    HOOK: 8,
    VIEWPOINT: 8,
    COMPLIANCE: 8,
    PERFORMANCE_HOOK: 8,
    YESTERDAY_REVIEW: 8,
    CTA: 8,
  });
  const [rejectionReason, setRejectionReason] = useState("");
  const [isReviewing, startReview] = useTransition();
  const avg = Object.values(scores).reduce((s, v) => s + v, 0) / REVIEW_DIMENSIONS.length;

  const submit = (forceReject = false) => {
    const shouldReject = forceReject || avg < 6;
    const nextScores =
      forceReject && avg >= 6
        ? {
            HOOK: 5,
            VIEWPOINT: 5,
            COMPLIANCE: 5,
            PERFORMANCE_HOOK: 5,
            YESTERDAY_REVIEW: 5,
            CTA: 5,
          }
        : scores;

    toast.success(shouldReject ? "已打回" : "已通过");
    onReviewed(submission);

    startReview(async () => {
      const result = await reviewSopCheckpointAction({
        submissionId: submission.id,
        scores: nextScores,
        rejectionReason:
          forceReject || avg < 6
            ? rejectionReason || "请按组长反馈修改"
            : rejectionReason || undefined,
      });
      if (result.error) {
        onReviewFailed(submission);
        toast.error(result.error);
        return;
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-8 py-5">
          <h3 className="text-[18px] font-semibold tracking-tight text-zinc-800">
            {checkpointLabel(submission.checkpoint as SopCheckpoint)}审核
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 hover:text-zinc-800 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
          >
            <X size={18} className="stroke-[1.5]" />
          </button>
        </div>

        <div className="space-y-6 p-8">
          {submission.checkpoint === "TOPIC" && (
            <div className="rounded-r-xl border-l-2 border-zinc-900 bg-zinc-50 p-5">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                选题内容
              </div>
              <p className="whitespace-pre-wrap text-[13px] font-medium leading-[1.7] text-zinc-800">
                {submission.topic_text || "未填写"}
              </p>
            </div>
          )}
          {submission.checkpoint === "SCRIPT" && (
            <div className="space-y-4">
              {submission.topic_text && (
                <div className="rounded-r-xl border-l-2 border-zinc-300 bg-zinc-50 p-4">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                    选题
                  </div>
                  <p className="text-[13px] font-medium leading-[1.7] text-zinc-700">
                    {submission.topic_text}
                  </p>
                </div>
              )}
              <div className="rounded-r-xl border-l-2 border-zinc-900 bg-zinc-50 p-5">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                  脚本文案
                </div>
                <p className="whitespace-pre-wrap text-[13px] font-medium leading-[1.7] text-zinc-800">
                  {submission.script_text || "未填写"}
                </p>
              </div>
            </div>
          )}
          {submission.checkpoint === "VIDEO" && (
            <div className="space-y-4">
              {submission.script_text && (
                <div className="rounded-r-xl border-l-2 border-zinc-300 bg-zinc-50 p-4">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                    脚本文案
                  </div>
                  <p className="line-clamp-3 text-[13px] font-medium leading-[1.7] text-zinc-700">
                    {submission.script_text}
                  </p>
                </div>
              )}
              {submission.video_url && (
                <a
                  href={submission.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-5 py-3 text-[13px] font-medium text-zinc-700 transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 active:translate-y-0 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                >
                  打开视频链接 <ArrowUpRight size={14} className="stroke-[1.5]" />
                </a>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-100 p-8">
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            {REVIEW_DIMENSIONS.map((d) => (
              <div key={d.key} className="space-y-2">
                <div className="flex items-end justify-between text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                  <span>{d.short}</span>
                  <span className="font-mono tabular-nums text-zinc-800">{scores[d.key]} / 10</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={scores[d.key]}
                  onChange={(e) =>
                    setScores((prev) => ({ ...prev, [d.key]: Number(e.target.value) }))
                  }
                  className="w-full accent-zinc-900"
                />
              </div>
            ))}
          </div>

          <div className="mb-4 flex gap-2">
            {[6, 7, 8].map((s) => (
              <button
                key={s}
                onClick={() =>
                  setScores({
                    HOOK: s,
                    VIEWPOINT: s,
                    COMPLIANCE: s,
                    PERFORMANCE_HOOK: s,
                    YESTERDAY_REVIEW: s,
                    CTA: s,
                  })
                }
                className="rounded-[10px] border border-zinc-200 bg-white px-3 py-1.5 text-[10px] font-medium text-zinc-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50 hover:text-zinc-800 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
              >
                一键 {s} 分
              </button>
            ))}
          </div>

          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="mb-4 h-20 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[12px] text-zinc-600 transition-[border-color,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5 focus:bg-white"
            placeholder="打回时必须填写原因..."
          />

          <div className="flex justify-end gap-3">
            <button
              onClick={() => submit(true)}
              disabled={isReviewing}
              className="rounded-[10px] border border-zinc-200 bg-white px-6 py-2.5 text-[11px] font-medium uppercase text-zinc-500 transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:bg-zinc-50 hover:text-[#C9604D] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
            >
              打回
            </button>
            <button
              onClick={() => submit(false)}
              disabled={isReviewing}
              className="rounded-[10px] bg-zinc-900 px-8 py-2.5 text-[11px] font-medium uppercase text-white transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:bg-zinc-800 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
            >
              通过
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
