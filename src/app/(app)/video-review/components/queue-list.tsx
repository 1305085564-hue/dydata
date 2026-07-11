"use client";

import { cn } from "@/lib/utils";
import { formatWaitDuration, getScriptOpening } from "./format";
import type { ReviewQueueItem } from "./types";

interface QueueListProps {
  items: ReviewQueueItem[];
  activeId: string | null;
  pendingCount: number;
  todayProcessed: number;
  onSelect: (id: string) => void;
}

export function QueueList({
  items,
  activeId,
  pendingCount,
  todayProcessed,
  onSelect,
}: QueueListProps) {
  return (
    <aside className="flex h-[320px] md:h-[calc(100vh-260px)] md:min-h-[480px] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <header className="flex items-baseline justify-between border-b border-stone-100 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[18px] font-medium text-stone-900">待审队列</h2>
          <span className="text-[13px] tabular-nums text-stone-500">
            {pendingCount}
          </span>
        </div>
        {todayProcessed > 0 ? (
          <span className="text-[12px] text-stone-500">
            今日已处理 {todayProcessed}
          </span>
        ) : null}
      </header>

      <ul className="flex-1 overflow-y-auto">
        {items.map((item) => {
          const isActive = item.id === activeId;
          const isAmend = item.current_round > 1;
          return (
            <li key={item.id} className="relative">
              {isActive ? (
                <span
                  className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r"
                  style={{ backgroundColor: "#8AA8C7" }}
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "block w-full px-4 py-3 text-left transition-colors",
                  isActive ? "bg-stone-100" : "hover:bg-stone-50",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-stone-700">
                    {item.account_name_snapshot ?? item.submitted_by_name}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-stone-500">
                    {formatWaitDuration(item.created_at)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[12px] leading-[1.55] text-stone-500">
                  {getScriptOpening(item.script_text, 80)}
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-[12px] text-stone-500">
                  <span>{item.submitted_by_name}</span>
                  {isAmend ? (
                    <>
                      <span className="text-stone-500">·</span>
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-500">
                        二改 · 第 {item.current_round} 轮
                      </span>
                    </>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="border-t border-stone-100 px-4 py-2 text-[12px] text-stone-500">
        快捷键 · J 下一条 · K 上一条
      </footer>
    </aside>
  );
}
