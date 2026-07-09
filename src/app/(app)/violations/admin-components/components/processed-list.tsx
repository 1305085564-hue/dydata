"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleSlash2, Inbox } from "lucide-react";

import type { InboxBucketEntry } from "../data";

interface ProcessedListProps {
  items: InboxBucketEntry[];
  /** 后端 RPC 未上线时显示「即将上线」状态 */
  pendingBackend?: boolean;
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  verified: { color: "#6FAA7D", label: "通过" },
  rejected: { color: "#C9604D", label: "驳回" },
  archived: { color: "#a1a1aa", label: "归档" },
};

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ProcessedList({ items, pendingBackend = false }: ProcessedListProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 8);
  const hasMore = items.length > 8;

  if (pendingBackend) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-9 items-center justify-center rounded-full border border-stone-200">
          <CircleSlash2 className="size-4 stroke-[1.5] text-stone-400" />
        </div>
        <div className="space-y-0.5">
          <p className="text-[13px] font-medium text-stone-500">即将上线</p>
          <p className="text-[12px] text-stone-400">已处理列表的后端接口准备中</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-9 items-center justify-center rounded-full border border-stone-200">
          <Inbox className="size-4 stroke-[1.5] text-stone-400" />
        </div>
        <div className="space-y-0.5">
          <p className="text-[13px] font-medium text-stone-500">暂无已处理记录</p>
          <p className="text-[12px] text-stone-400">审批后这里会出现近期记录</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {visible.map((entry) => {
        const meta = STATUS_META[entry.status ?? "archived"] ?? STATUS_META.archived;
        return (
          <Link
            key={entry.id}
            href={`/violations/${entry.id}`}
            className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-stone-50 active:translate-y-0"
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: meta.color }}
              title={meta.label}
            />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-[13px] font-medium text-stone-800">
                {entry.script_text}
              </p>
              <div className="mt-0.5 flex items-center gap-x-2 text-[12px] text-stone-500">
                <span className="text-[11px] font-medium" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <span className="text-stone-300">·</span>
                <span>{entry.submitted_by_name}</span>
                <span className="text-stone-300">·</span>
                <span>{formatTime(entry.created_at)}</span>
              </div>
            </div>
            <ArrowUpRight className="size-3.5 shrink-0 stroke-[1.5] text-stone-300 opacity-0 transition-all group-hover:opacity-100 group-hover:text-stone-500" />
          </Link>
        );
      })}

      {hasMore ? (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 active:translate-y-0"
          >
            {expanded ? "收起" : `展开剩余 ${items.length - 8} 条`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
