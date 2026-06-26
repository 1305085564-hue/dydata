"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/lib/utils";

import type { InboxBucketEntry, InboxCounts, InboxData } from "../data";
import { TaskInbox } from "./task-inbox-v2";
import { ProcessedList } from "./processed-list";

interface TaskInboxShellProps {
  inbox: InboxData;
  counts: InboxCounts;
  processed: InboxBucketEntry[];
  /** 后端 RPC 未上线时显示「即将上线」 */
  processedPending?: boolean;
  isOwner?: boolean;
}

export function TaskInboxShell({
  inbox,
  counts,
  processed,
  processedPending = false,
  isOwner = false,
}: TaskInboxShellProps) {
  const pendingTotal =
    counts.high_risk_pending + counts.pending_review + counts.missing_data;
  const processedCount = processedPending ? null : processed.length;

  const [processedOpen, setProcessedOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* 待处理 — 默认展开，主舞台 */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="flex items-baseline justify-between gap-2 border-b border-zinc-100 px-5 py-4">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[14px] font-semibold text-zinc-800">待处理</h2>
            <span className="font-mono text-[13px] tabular-nums text-zinc-400">
              {pendingTotal}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400">
            高风险 / 待审核 / 缺数据
          </span>
        </div>
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <TaskInbox inbox={inbox} counts={counts} isOwner={isOwner} />
        </div>
      </section>

      {/* 已处理 — 折叠面板，默认收起 */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <button
          type="button"
          onClick={() => setProcessedOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left transition-colors hover:bg-zinc-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-inset"
        >
          <div className="flex items-baseline gap-2">
            <h2 className="text-[14px] font-semibold text-zinc-800">已处理</h2>
            {processedCount !== null ? (
              <span className="font-mono text-[13px] tabular-nums text-zinc-400">
                {processedCount}
              </span>
            ) : null}
            <span className="text-[11px] text-zinc-400">近 30 天审批记录</span>
          </div>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 stroke-[1.5] text-zinc-400 transition-transform duration-300",
              processedOpen ? "" : "-rotate-90",
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {processedOpen ? (
            <motion.div
              key="processed-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const }}
              className="overflow-hidden"
            >
              <div className="border-t border-zinc-100 px-4 py-4 sm:px-5 sm:py-5">
                <ProcessedList items={processed} pendingBackend={processedPending} />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  );
}
