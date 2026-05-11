import Link from "next/link";
import { Crown } from "lucide-react";
import type { TopScriptEntry } from "./types";

const MEDALS = [
  { emoji: "🥇", tone: "bg-[#FFB547]/15 text-[#B6761A] border-[#FFB547]/40", rail: "bg-[#FFB547]" },
  { emoji: "🥈", tone: "bg-[#C0C0C0]/20 text-[#5B5B5B] border-[#C0C0C0]/50", rail: "bg-[#C0C0C0]" },
  { emoji: "🥉", tone: "bg-[#CD7F32]/15 text-[#7A4A1F] border-[#CD7F32]/40", rail: "bg-[#CD7F32]" },
] as const;

function formatNumber(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  return n.toLocaleString("zh-CN");
}

function computeRate(item: TopScriptEntry): string {
  const weighted = item.weighted_conversion_rate;
  if (typeof weighted === "number" && Number.isFinite(weighted)) {
    return (weighted * 100).toFixed(2);
  }
  const views = Number(item.total_views ?? 0);
  const follows = Number(item.total_follows ?? 0);
  if (views <= 0) return "0.00";
  return ((follows / views) * 100).toFixed(2);
}

export function TopScriptsBanner({ items }: { items: TopScriptEntry[] }) {
  const top3 = items.slice(0, 3);

  if (top3.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-6 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
          <Crown className="size-5" strokeWidth={2.25} />
        </div>
        <p className="mt-3 text-sm font-semibold text-zinc-700">暂无转化榜数据</p>
        <p className="mt-1 text-xs text-zinc-500">使用记录满 3 次、展示满 1000 后会自动进榜。</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#D97757]">
            Top Conversion Scripts
          </p>
          <h3 className="mt-1 text-[14px] font-semibold text-zinc-800">本周转化榜</h3>
        </div>
        <span className="hidden rounded-full bg-zinc-50 px-3 py-1 text-[11px] font-medium text-zinc-500 sm:inline-flex">
          加权转化率 · 展示量 ≥ 1k · 复用 ≥ 3
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {top3.map((item, index) => {
          const medal = MEDALS[index] ?? MEDALS[2];
          const rate = computeRate(item);
          return (
            <Link
              key={item.id}
              href={`/violations/${item.id}`}
              className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 transition-[colors,transform] hover:-translate-y-0.5"
            >
              <div className={`absolute inset-x-0 top-0 h-[3px] ${medal.rail}`} />
              <div className="flex items-center justify-between">
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${medal.tone}`}
                >
                  <span className="text-sm leading-none">{medal.emoji}</span>
                  <span>No.{index + 1}</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-[#6FAA7D]">{rate}%</div>
                  <div className="text-[10px] font-medium text-zinc-400">转化率</div>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-800">
                {item.script_text.trim()}
              </p>
              <div className="mt-3 flex gap-3 text-[11px] font-medium text-zinc-500">
                <span>展示 {formatNumber(item.total_views)}</span>
                <span>涨粉 {formatNumber(item.total_follows)}</span>
                <span>复用 {formatNumber(item.usage_count)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
