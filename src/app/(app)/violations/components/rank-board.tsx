"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { RankItem } from "./types";

interface RankBoardProps {
  title: string;
  subtitle?: string;
  items: RankItem[];
  metricLabel: string;
  metricKey: "conversion_rate" | "pass_rate";
  accentColor: string;
  emptyHint: string;
  viewAllHref?: string;
  /** 提供后行内项点击触发该回调；不提供则仍按 Link 跳详情页 */
  onItemClick?: (id: string) => void;
}

export function RankBoard({
  title,
  subtitle,
  items,
  metricKey,
  accentColor,
  emptyHint,
  viewAllHref,
  onItemClick,
}: RankBoardProps) {
  const hasItems = items.length > 0;
  const isViolation = metricKey === "pass_rate";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 text-left">
      {/* Title */}
      <div className="flex items-center gap-2">
        {isViolation ? (
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-[#C9604D]/40 opacity-75" style={{ animationDuration: "3s" }}></span>
            <span className="relative inline-flex size-2 rounded-full bg-[#C9604D]"></span>
          </span>
        ) : (
          <span className="size-2 rounded-full bg-[#6FAA7D] shrink-0" />
        )}
        <h3 className="text-[18px] font-medium text-stone-900">
          {title}
        </h3>
        {subtitle ? (
          <span className="text-[12px] text-stone-500">
            {subtitle}
          </span>
        ) : null}
      </div>

      {/* List */}
      <div className="mt-3">
        {hasItems ? (
          <ul className="space-y-0.5">
            {items.map((item, index) => {
              const inner = (
                <>
                  <span className="w-5 text-[12px] font-medium text-stone-500 tabular-nums">
                    {index + 1}
                  </span>
                  <span className="flex-1 truncate text-[13px] text-stone-700">
                    {item.script_text.slice(0, 20)}
                    {item.script_text.length > 20 ? "…" : ""}
                  </span>
                  <span
                    className={
                      isViolation
                        ? "shrink-0 text-[13px] font-medium text-[#C9604D] tabular-nums"
                        : "shrink-0 text-[13px] font-medium text-[#6FAA7D] tabular-nums"
                    }
                  >
                    {item.metricValue}
                  </span>
                </>
              );

              const btnClass = "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-all duration-150 hover:bg-stone-100 active:scale-[0.98]";

              return (
                <li key={item.id}>
                  {onItemClick ? (
                    <button
                      type="button"
                      onClick={() => onItemClick(item.id)}
                      className={btnClass}
                    >
                      {inner}
                    </button>
                  ) : (
                    <Link
                      href={`/violations/${item.id}`}
                      className={btnClass}
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="py-6 text-center">
            <p className="text-[12px] text-stone-500">{emptyHint}</p>
          </div>
        )}
      </div>

      {/* View All */}
      {viewAllHref ? (
        <div className="mt-2 border-t border-stone-100 pt-2.5">
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1 text-[12px] text-stone-500 transition-all duration-150 hover:text-stone-700 active:scale-[0.98]"
          >
            查看全部
            <ArrowRight className="size-3 stroke-[1.5]" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
