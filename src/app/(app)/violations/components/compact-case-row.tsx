"use client";

import Link from "next/link";
import type { CaseListItem, GuidanceMethod } from "./types";
import { GUIDANCE_METHOD_LABELS } from "./types";
import { getPassRate } from "./format";

interface CompactCaseRowProps {
  caseItem: CaseListItem;
}

function resolveStatusDot(caseItem: CaseListItem) {
  const usageState = caseItem.usage_state;
  const promotionLevel = caseItem.promotion_level;

  if (promotionLevel === "promoted") {
    return { color: "#D97757", label: "推荐" };
  }
  if (usageState === "banned") {
    return { color: "#C9604D", label: "禁用" };
  }
  if (usageState === "testing") {
    return { color: "#D99E55", label: "待测试" };
  }
  if (usageState === "not_recommended") {
    return { color: "#a1a1aa", label: "不推荐" };
  }
  return { color: "#6FAA7D", label: "可用" };
}

function formatMetric(caseItem: CaseListItem): string {
  // For conversion cases: show conversion rate + usage count
  const purpose = caseItem.purpose;
  if (purpose === "conversion") {
    const rate = caseItem.weighted_conversion_rate;
    const usageCount = caseItem.usage_count ?? 0;
    const rateStr =
      typeof rate === "number" && Number.isFinite(rate)
        ? `${(rate * 100).toFixed(2)}%`
        : "—";
    return `转化率 ${rateStr} · 使用 ${usageCount}次`;
  }

  // For violation cases: show pass rate
  const rate = getPassRate(caseItem);
  const passCount = caseItem.pass_count ?? 0;
  const failCount = caseItem.fail_count ?? 0;
  const total = passCount + failCount;
  if (rate === null) {
    return "暂无测试";
  }
  return `通过率 ${rate}% · ${passCount}/${total}`;
}

export function CompactCaseRow({ caseItem }: CompactCaseRowProps) {
  const dot = resolveStatusDot(caseItem);
  const guidanceMethod = caseItem.guidance_method as GuidanceMethod | undefined;
  const hasVisualTags =
    Array.isArray(caseItem.visual_tags) && caseItem.visual_tags.length > 0;

  return (
    <Link
      href={`/violations/${caseItem.id}`}
      className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-zinc-100 active:translate-y-0"
    >
      {/* Status dot */}
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: dot.color }}
        title={dot.label}
      />

      {/* Script text */}
      <span className="min-w-0 shrink text-[13px] text-zinc-800 truncate">
        {caseItem.script_text.slice(0, 30)}
        {caseItem.script_text.length > 30 ? "…" : ""}
      </span>

      {/* Tags area */}
      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        {guidanceMethod && guidanceMethod in GUIDANCE_METHOD_LABELS ? (
          <>
            <span className="text-zinc-300">·</span>
            <span className="rounded-lg border border-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600">
              {GUIDANCE_METHOD_LABELS[guidanceMethod]}
            </span>
          </>
        ) : null}
        {hasVisualTags ? (
          <>
            <span className="text-zinc-300">·</span>
            <span className="rounded-lg border border-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600">
              {caseItem.visual_tags![0].name}
              {caseItem.visual_tags!.length > 1
                ? ` +${caseItem.visual_tags!.length - 1}`
                : ""}
            </span>
          </>
        ) : null}
      </div>

      {/* Metrics - right aligned */}
      <span className="ml-auto shrink-0 text-[12px] tabular-nums text-zinc-500">
        {formatMetric(caseItem)}
      </span>
    </Link>
  );
}
