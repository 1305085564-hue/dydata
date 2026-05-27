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
  accentColor,
  emptyHint,
  viewAllHref,
  onItemClick,
}: RankBoardProps) {
  const hasItems = items.length > 0;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      {/* Title */}
      <div className="flex items-center gap-2">
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
        <h3 className="text-[13px] font-medium text-zinc-800">{title}</h3>
        {subtitle ? (
          <span className="text-[11px] text-zinc-400">{subtitle}</span>
        ) : null}
      </div>

      {/* List */}
      <div className="mt-3">
        {hasItems ? (
          <ul className="space-y-0.5">
            {items.map((item, index) => {
              const inner = (
                <>
                  <span className="w-5 text-[12px] font-medium text-zinc-400 tabular-nums">
                    {index + 1}
                  </span>
                  <span className="flex-1 truncate text-[13px] text-zinc-700">
                    {item.script_text.slice(0, 20)}
                    {item.script_text.length > 20 ? "…" : ""}
                  </span>
                  <span
                    className="shrink-0 text-[13px] font-semibold tabular-nums"
                    style={{ color: accentColor }}
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
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-zinc-100 active:translate-y-0"
                    >
                      {inner}
                    </button>
                  ) : (
                    <Link
                      href={`/violations/${item.id}`}
                      className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-zinc-100 active:translate-y-0"
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
        <div className="mt-2 border-t border-zinc-100 pt-2.5">
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1 text-[12px] text-zinc-500 transition-colors hover:text-zinc-800 active:translate-y-0"
          >
            查看全部
            <ArrowRight className="size-3 stroke-[1.5]" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
