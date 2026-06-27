"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { Check, X, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatWaitDuration } from "./format";
import type { ReviewQueueItem, FeedbackHistoryItem } from "./types";

const QUICK_REASONS = [
  "话术开头不够吸引，建议前 3 秒强化钩子",
  "存在敏感词风险，请替换或弱化",
  "截图不清晰或缺失关键信息",
  "话术与账号定位不符",
];

interface ReviewDetailProps {
  item: ReviewQueueItem;
  isProcessing: boolean;
  onApprove: () => void;
  onReject: (feedbackText: string) => void;
  onPreview: (paths: string[], index: number) => void;
}

export function ReviewDetail({
  item,
  isProcessing,
  onApprove,
  onReject,
  onPreview,
}: ReviewDetailProps) {
  const [rejectMode, setRejectMode] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const screenshotCount = item.screenshot_paths.length;
  const isAmend = item.current_round > 1;
  const history = item.feedback_history;
  const hasHistory = history.length > 0;

  const approveDisabled = isProcessing;
  const rejectSubmitDisabled = isProcessing || feedbackText.trim().length === 0;

  const cancelReject = () => {
    setRejectMode(false);
    setFeedbackText("");
  };

  return (
    <section className="flex h-[calc(100vh-260px)] min-h-[480px] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <header className="flex items-baseline justify-between border-b border-zinc-100 px-6 py-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[16px] font-semibold text-zinc-800">
            {item.account_name_snapshot ?? "未关联账号"}
          </h2>
          <span className="text-[12px] text-zinc-500">{item.submitted_by_name}</span>
          {isAmend ? (
            <span className="rounded bg-[#D97757]/[0.06] px-2 py-0.5 text-[11px] font-medium text-[#D97757]">
              二改 · 第 {item.current_round} 轮
            </span>
          ) : null}
        </div>
        <span className="font-mono text-[12px] tabular-nums text-zinc-400">
          已等 {formatWaitDuration(item.created_at)}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {hasHistory ? (
          <FeedbackHistorySection
            history={history}
            open={historyOpen}
            onToggle={() => setHistoryOpen((v) => !v)}
          />
        ) : null}

        <div className="mt-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            话术原文
          </p>
          <div className="mt-2 rounded-xl bg-zinc-100/50 p-4">
            <p className="whitespace-pre-wrap text-[14px] leading-7 text-zinc-800">
              {item.script_text}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            截图（{screenshotCount}）
          </p>
          {screenshotCount > 0 ? (
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {item.screenshot_paths.map((path, idx) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => onPreview(item.screenshot_paths, idx)}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100"
                >
                  <Image
                    src={`/api/violations/screenshot/${encodeURI(path)}`}
                    alt="截图"
                    fill
                    unoptimized
                    sizes="160px"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-lg border border-dashed border-zinc-200 px-4 py-3 text-[12px] text-zinc-400">
              本稿未上传截图
            </p>
          )}
        </div>
      </div>

      <footer className="border-t border-zinc-100 px-6 py-4">
        {rejectMode ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-medium text-zinc-800">
                打回 · 给一句具体建议
              </p>
              <button
                type="button"
                onClick={cancelReject}
                className="text-[12px] text-zinc-500 hover:text-zinc-800"
              >
                取消
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setFeedbackText(r)}
                  className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="可点上方常见理由直接填入，也可自行补充"
              autoFocus
              className="block w-full resize-none rounded-xl border-transparent bg-zinc-100/70 p-3 text-[13px] leading-6 text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950/5"
              rows={3}
              maxLength={1000}
            />
            <div className="flex items-center justify-end">
              <button
                type="button"
                disabled={rejectSubmitDisabled}
                onClick={() => onReject(feedbackText)}
                className={cn(
                  "h-10 rounded-lg bg-[#C9604D] px-5 text-[13px] font-semibold text-white transition-all active:translate-y-[1px]",
                  rejectSubmitDisabled
                    ? "cursor-not-allowed opacity-60"
                    : "hover:bg-[#B5503D]",
                )}
              >
                {isProcessing ? "处理中..." : "确认打回"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectMode(true)}
              disabled={isProcessing}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-[13px] font-medium transition-colors active:translate-y-0",
                isProcessing
                  ? "cursor-not-allowed text-zinc-300"
                  : "text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
              )}
            >
              <X className="size-3.5 stroke-[1.75]" />
              打回 · 改进
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={approveDisabled}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#D97757] px-5 text-[13px] font-semibold text-white shadow-sm transition-all active:translate-y-[1px]",
                approveDisabled
                  ? "cursor-not-allowed opacity-60"
                  : "hover:bg-[#C96442] hover:shadow-sm",
              )}
            >
              <Check className="size-3.5 stroke-[2]" />
              {isProcessing ? "处理中..." : "通过 · 入库"}
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}

/* 历史轮次反馈 — 折叠展开 */
function FeedbackHistorySection({
  history,
  open,
  onToggle,
}: {
  history: FeedbackHistoryItem[];
  open: boolean;
  onToggle: () => void;
}) {
  const reverseSorted = useMemo(
    () => [...history].sort((a, b) => b.round - a.round),
    [history],
  );
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="text-[12px] font-medium text-zinc-600">
          历史轮次 · {history.length} 条
        </span>
        <ChevronDown
          className={cn(
            "size-4 stroke-[1.5] text-zinc-400 transition-transform",
            open ? "rotate-180" : "",
          )}
        />
      </button>
      {open ? (
        <ul className="border-t border-zinc-200 px-4 py-3 space-y-2">
          {reverseSorted.map((h, i) => (
            <li key={i} className="text-[12px] leading-[1.7] text-zinc-600">
              <span className="font-medium text-zinc-700">
                第 {h.round} 轮 · {h.action === "approve" ? "通过" : "打回"}
              </span>
              {h.feedback_text ? (
                <span className="ml-2 text-zinc-500">— {h.feedback_text}</span>
              ) : null}
              {h.reviewer_name ? (
                <span className="ml-2 text-zinc-400">@ {h.reviewer_name}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
