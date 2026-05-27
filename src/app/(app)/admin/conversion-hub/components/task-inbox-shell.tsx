"use client";

import { useState } from "react";

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
}

type MobileTab = "pending" | "processed";

export function TaskInboxShell({
  inbox,
  counts,
  processed,
  processedPending = false,
}: TaskInboxShellProps) {
  const [mobileTab, setMobileTab] = useState<MobileTab>("pending");

  const pendingTotal =
    counts.high_risk_pending + counts.pending_review + counts.missing_data;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {/* Mobile tab switcher */}
      <div className="border-b border-zinc-200 px-3 py-2 md:hidden">
        <div className="inline-flex rounded-xl bg-zinc-100 p-1">
          <MobileTabButton
            active={mobileTab === "pending"}
            onClick={() => setMobileTab("pending")}
            label="待处理"
            count={pendingTotal}
          />
          <MobileTabButton
            active={mobileTab === "processed"}
            onClick={() => setMobileTab("processed")}
            label="已处理"
            count={processedPending ? null : processed.length}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2">
        {/* Pending column */}
        <section
          className={cn(
            "min-w-0 px-4 py-4 md:border-r md:border-zinc-200 md:px-5 md:py-5",
            mobileTab === "pending" ? "block" : "hidden md:block",
          )}
        >
          <SectionHeader title="待处理" hint="高风险 / 待审核 / 缺数据" count={pendingTotal} />
          <div className="mt-4">
            <TaskInbox inbox={inbox} counts={counts} />
          </div>
        </section>

        {/* Processed column */}
        <section
          className={cn(
            "min-w-0 px-4 py-4 md:px-5 md:py-5",
            mobileTab === "processed" ? "block" : "hidden md:block",
          )}
        >
          <SectionHeader
            title="已处理"
            hint="近 30 天审批记录"
            count={processedPending ? null : processed.length}
          />
          <div className="mt-4">
            <ProcessedList items={processed} pendingBackend={processedPending} />
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  hint,
  count,
}: {
  title: string;
  hint: string;
  count: number | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[14px] font-semibold text-zinc-800">{title}</h2>
        {count !== null ? (
          <span className="text-[12px] tabular-nums text-zinc-400">{count}</span>
        ) : null}
      </div>
      <span className="text-[11px] text-zinc-400">{hint}</span>
    </div>
  );
}

function MobileTabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1 text-[12px] font-medium transition-colors active:translate-y-0",
        active ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
      )}
    >
      {label}
      {count !== null && count > 0 ? (
        <span className="ml-1.5 tabular-nums text-[11px] text-zinc-400">{count}</span>
      ) : null}
    </button>
  );
}
