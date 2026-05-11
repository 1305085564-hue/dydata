import Link from "next/link";
import { ArrowRight, Eye, UserPlus, Repeat2 } from "lucide-react";
import type { ConversionCase } from "./types";

const FORMAT_META: Record<string, { label: string; className: string }> = {
  oral: {
    label: "口播",
    className: "bg-[#8AA8C7]/10 text-[#8AA8C7]",
  },
  visual: {
    label: "画面",
    className: "bg-[#D97757]/10 text-[#D97757]",
  },
  mixed: {
    label: "混合",
    className: "bg-[#6FAA7D]/10 text-[#6FAA7D]",
  },
};

function formatNumber(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 100000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 10000) return `${(n / 10000).toFixed(2)}w`;
  return n.toLocaleString("zh-CN");
}

function computeRate(caseItem: ConversionCase): string {
  const weighted = caseItem.weighted_conversion_rate;
  if (typeof weighted === "number" && Number.isFinite(weighted)) {
    return (weighted * 100).toFixed(2);
  }
  const views = Number(caseItem.total_views ?? 0);
  const follows = Number(caseItem.total_follows ?? 0);
  if (views <= 0) return "0.00";
  return ((follows / views) * 100).toFixed(2);
}

function previewText(text: string, limit = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}…`;
}

export function ConversionCaseCard({ caseItem }: { caseItem: ConversionCase }) {
  const formatKey = (caseItem.script_format ?? "mixed") as string;
  const meta = FORMAT_META[formatKey] ?? FORMAT_META.mixed;
  const rate = computeRate(caseItem);

  return (
    <Link
      href={`/violations/${caseItem.id}`}
      className="group relative block overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:-translate-y-0.5 hover:border-zinc-300"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
            >
              {meta.label}
            </span>
            <span className="text-[11px] font-medium text-zinc-400">
              使用 {formatNumber(caseItem.usage_count)} 次
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-800">
            {previewText(caseItem.script_text)}
          </p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-1 group-hover:text-zinc-800" />
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-dashed border-zinc-200 pt-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Conversion Rate
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-[24px] font-semibold tracking-tight text-[#6FAA7D]">{rate}</span>
            <span className="text-sm font-semibold text-[#6FAA7D]/80">%</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs font-medium text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="size-3.5 text-zinc-400" strokeWidth={2.25} />
            <span className="text-zinc-700">{formatNumber(caseItem.total_views)}</span>
            <span>展示</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UserPlus className="size-3.5 text-zinc-400" strokeWidth={2.25} />
            <span className="text-zinc-700">{formatNumber(caseItem.total_follows)}</span>
            <span>涨粉</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Repeat2 className="size-3.5 text-zinc-400" strokeWidth={2.25} />
            <span className="text-zinc-700">{formatNumber(caseItem.usage_count)}</span>
            <span>复用</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
