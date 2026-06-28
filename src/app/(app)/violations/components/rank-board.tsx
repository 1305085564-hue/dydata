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
    <div
      className={
        isViolation
          ? "rounded-2xl border border-red-500/25 bg-zinc-950 p-5 shadow-lg shadow-red-950/20 text-left relative overflow-hidden"
          : "rounded-2xl border border-amber-200/60 bg-gradient-to-b from-[#FFFDFB] to-white p-5 shadow-sm text-left relative overflow-hidden"
      }
    >
      {/* Title */}
      <div className="flex items-center gap-2">
        {isViolation ? (
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex size-2 rounded-full bg-red-500"></span>
          </span>
        ) : (
          <span className="size-2 rounded-full bg-amber-500 shrink-0" />
        )}
        <h3
          className={
            isViolation
              ? "text-[13px] font-semibold text-red-400"
              : "text-[13px] font-semibold text-amber-800"
          }
        >
          {title}
        </h3>
        {subtitle ? (
          <span className={isViolation ? "text-[11px] text-zinc-500" : "text-[11px] text-amber-600/60"}>
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
                  <span
                    className={
                      isViolation
                        ? "w-5 text-[12px] font-bold text-red-900/60 tabular-nums"
                        : "w-5 text-[12px] font-bold text-amber-300 tabular-nums"
                    }
                  >
                    {index + 1}
                  </span>
                  <span
                    className={
                      isViolation
                        ? "flex-1 truncate text-[13px] text-zinc-300"
                        : "flex-1 truncate text-[13px] text-zinc-700"
                    }
                  >
                    {item.script_text.slice(0, 20)}
                    {item.script_text.length > 20 ? "…" : ""}
                  </span>
                  <span
                    className={
                      isViolation
                        ? "shrink-0 text-[13px] font-bold text-red-400 tabular-nums"
                        : "shrink-0 text-[13px] font-bold text-amber-600 tabular-nums"
                    }
                  >
                    {item.metricValue}
                  </span>
                </>
              );

              return (
                <li key={item.id}>
                  {onItemClick ? (
                    <button
                      type="button"
                      onClick={() => onItemClick(item.id)}
                      className={
                        isViolation
                          ? "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-zinc-900 active:translate-y-0"
                          : "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-amber-50/40 active:translate-y-0"
                      }
                    >
                      {inner}
                    </button>
                  ) : (
                    <Link
                      href={`/violations/${item.id}`}
                      className={
                        isViolation
                          ? "flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-zinc-900 active:translate-y-0"
                          : "flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-amber-50/40 active:translate-y-0"
                      }
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
            <p className="text-[12px] text-zinc-400">{emptyHint}</p>
          </div>
        )}
      </div>

      {/* View All */}
      {viewAllHref ? (
        <div className={isViolation ? "mt-2 border-t border-zinc-900 pt-2.5" : "mt-2 border-t border-zinc-100 pt-2.5"}>
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1 text-[12px] text-zinc-500 transition-colors hover:text-zinc-300 active:translate-y-0"
          >
            查看全部
            <ArrowRight className="size-3 stroke-[1.5]" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
