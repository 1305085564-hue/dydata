"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, Check, Inbox } from "lucide-react";
import { useState } from "react";

import { feedbackToast } from "@/components/ui/feedback-toast";

export interface DecisionEntry {
  id: string;
  script_text: string;
  reason: string | null;
}

export interface DecisionBucket {
  key: "promote" | "keep_testing" | "deprecate" | "ban";
  label: string;
  emoji: string;
  tone: "success" | "info" | "neutral" | "danger";
  entries: DecisionEntry[];
}

interface Props {
  weekStart: string;
  buckets: DecisionBucket[] | null;
  confirmedAt: string | null;
  generatedBy: "ai" | "manual" | null;
}

const TONE_STYLES: Record<DecisionBucket["tone"], { border: string; badge: string; title: string }> = {
  success: {
    border: "border-zinc-200",
    badge: "bg-[#6FAA7D]/10 text-[#6FAA7D]",
    title: "text-[#6FAA7D]",
  },
  info: {
    border: "border-zinc-200",
    badge: "bg-zinc-100 text-zinc-700",
    title: "text-zinc-700",
  },
  neutral: {
    border: "border-zinc-200",
    badge: "bg-zinc-100 text-zinc-600",
    title: "text-zinc-700",
  },
  danger: {
    border: "border-zinc-200",
    badge: "bg-[#C9604D]/10 text-[#C9604D]",
    title: "text-[#C9604D]",
  },
};

export function WeeklyDecisionView({ weekStart, buckets, confirmedAt, generatedBy }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [localConfirmedAt, setLocalConfirmedAt] = useState(confirmedAt);

  const handleGenerate = () => {
    feedbackToast.warning("AI 每周草稿接口待后端实现，先从转化分析和违规复核整理候选");
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const response = await fetch("/api/conversion-hub/weekly-decisions/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart }),
      });
      const data = (await response.json()) as { data?: { confirmed_at?: string | null }; error?: { message?: string } };

      if (!response.ok || data.error) {
        throw new Error(data.error?.message || "确认失败");
      }

      setLocalConfirmedAt(data.data?.confirmed_at ?? new Date().toISOString());
      feedbackToast.success("本周四类清单已确认");
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "确认失败");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center border-l-2 border-[#D97757] pl-3">
          <h2 className="text-[15px] font-medium tracking-tight text-zinc-800">每周四类清单</h2>
          <span className="ml-3 text-[12px] text-zinc-500">推广 / 测试 / 废弃 / 封禁</span>
        </div>
        {localConfirmedAt ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-50 px-3 py-1 text-[11px] font-medium text-[#6FAA7D]">
            <span className="h-2 w-2 rounded-full bg-[#6FAA7D] ring-1 ring-white" />
            已确认
          </span>
        ) : null}
      </div>

      {buckets === null ? (
        <EmptyState weekStart={weekStart} onGenerate={handleGenerate} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {buckets.map((bucket, idx) => (
              <BucketCard key={bucket.key} bucket={bucket} index={idx} />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white p-4">
            <div>
              <p className="text-[13px] font-medium text-zinc-800">确认本周决策</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                草稿由 {generatedBy === "ai" ? "AI" : "人工"} 生成，确认后锁定本周四类
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/conversion-hub?tab=scripts"
                className="h-9 rounded-xl border border-zinc-200 px-4 text-[13px] font-medium leading-9 text-zinc-700 transition hover:bg-zinc-50"
              >
                返回概览
              </Link>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming || Boolean(localConfirmedAt)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-zinc-900 px-4 text-[13px] font-medium text-white transition hover:bg-zinc-800 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="size-4" />
                {localConfirmedAt ? "已确认" : confirming ? "确认中..." : "一键确认整单"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BucketCard({ bucket, index }: { bucket: DecisionBucket; index: number }) {
  const tone = TONE_STYLES[bucket.tone];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: "easeOut" }}
      className={`rounded-2xl border bg-white p-6 ${tone.border}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{bucket.emoji}</span>
          <h3 className={`text-[15px] font-medium ${tone.title}`}>{bucket.label}</h3>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
            {bucket.entries.length} 条
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {bucket.entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-6 text-center text-[11px] text-zinc-400">
            本类暂无话术
          </p>
        ) : (
          bucket.entries.map((entry) => (
            <Link
              key={entry.id}
              href={`/violations/${entry.id}`}
              className="block rounded-lg border border-zinc-200 bg-white p-4 transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm"
            >
              <p className="line-clamp-2 text-[13px] leading-snug text-zinc-800">{entry.script_text}</p>
              {entry.reason ? (
                <p className="mt-1.5 line-clamp-2 text-[11px] text-zinc-500">理由：{entry.reason}</p>
              ) : null}
            </Link>
          ))
        )}
      </div>
    </motion.section>
  );
}

function EmptyState({
  weekStart,
  onGenerate,
}: {
  weekStart: string;
  onGenerate: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-2xl border border-dashed border-zinc-200 bg-white p-10 text-center"
    >
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-zinc-50">
        <Inbox className="size-7 text-zinc-400" />
      </div>
      <h3 className="mt-4 text-[15px] font-medium text-zinc-800">本周暂无决策草稿</h3>
      <p className="mx-auto mt-1 max-w-md text-[11px] text-zinc-500">
        周起：{weekStart}。AI 自动生成草稿还没有后端接口，当前只能先从分析和复核页面人工整理候选。
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link
          href="/admin/conversion-hub?tab=analytics"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-[13px] font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          去看转化分析
        </Link>
        <Link
          href="/admin/conversion-hub?tab=violations"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-[13px] font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          <AlertTriangle className="size-4" />
          复核违规风险
        </Link>
        <button
          type="button"
          onClick={onGenerate}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-zinc-300 px-4 text-[13px] font-medium text-zinc-500 transition hover:bg-zinc-50"
        >
          接口待补
        </button>
      </div>
    </motion.section>
  );
}
