"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { PassRateBadge } from "./pass-rate-badge";
import { formatDateTime, getPassRate, getSubmitterName } from "./format";
import { GUIDANCE_METHOD_LABELS, type GuidanceMethod, type ViolationCase } from "./types";

interface CaseCardProps {
  caseItem: ViolationCase;
  onOpenDetail: (id: string) => void;
  onOpenLightbox?: (paths: string[], index: number) => void;
  onOpenReview?: (caseItem: ViolationCase) => void;
  canManageViolations?: boolean;
}

type StaffCaseExtras = {
  usage_state?: string | null;
  promotion_level?: string | null;
};

function resolveAccent(item: ViolationCase) {
  const ext = item as ViolationCase & StaffCaseExtras;
  if (ext.promotion_level === "promoted") {
    return { dotColor: "#D97757", label: "推荐", muted: false };
  }
  if (ext.usage_state === "banned") {
    return { dotColor: "#C9604D", label: "禁用", muted: true };
  }
  if (ext.usage_state === "testing") {
    return { dotColor: "#D99E55", label: "待测试", muted: false };
  }
  if (ext.usage_state === "not_recommended") {
    return { dotColor: "#a1a1aa", label: "× 推荐", muted: false };
  }
  return { dotColor: "#6FAA7D", label: "可用", muted: false };
}

function formatRightMetric(item: ViolationCase): string {
  if (item.purpose === "conversion") {
    const rate = item.weighted_conversion_rate;
    if (typeof rate === "number" && Number.isFinite(rate)) {
      return `${(rate * 100).toFixed(2)}%`;
    }
    return "—";
  }
  const rate = getPassRate(item);
  if (rate === null) return "—";
  return `${rate}%`;
}

function getRightMetricLabel(item: ViolationCase): string {
  return item.purpose === "conversion" ? "转化率" : "通过率";
}

export function CaseCard({
  caseItem,
  onOpenDetail,
  onOpenLightbox,
  onOpenReview,
  canManageViolations,
}: CaseCardProps) {
  const accent = resolveAccent(caseItem);
  const screenshots = caseItem.screenshot_paths ?? [];
  const guidanceMethod = caseItem.guidance_method as GuidanceMethod | undefined;
  const guidanceLabel =
    guidanceMethod && guidanceMethod in GUIDANCE_METHOD_LABELS
      ? GUIDANCE_METHOD_LABELS[guidanceMethod]
      : null;

  const handleCardClick = () => onOpenDetail(caseItem.id);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
      className={cn(
        "group relative cursor-pointer rounded-xl border border-zinc-200 bg-white p-5 transition-all",
        "hover:-translate-y-[1px] hover:shadow-[0_4px_16px_-8px_rgba(15,23,42,0.06)]",
        "active:translate-y-0",
        accent.muted && "bg-zinc-50/60",
      )}
    >
      {/* Top row: status + tags + right metric */}
      <div className="flex items-start gap-3">
        <span
          className="mt-1.5 size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent.dotColor }}
          aria-label={accent.label}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
              {accent.label}
            </span>
            <span className="text-zinc-300">·</span>
            <span className="rounded-lg border border-zinc-200 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">
              {caseItem.category || "其他"}
            </span>
            {guidanceLabel ? (
              <span className="rounded-lg border border-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-500">
                {guidanceLabel}
              </span>
            ) : null}
            {caseItem.purpose === "violation" ? (
              <PassRateBadge
                passCount={caseItem.pass_count}
                failCount={caseItem.fail_count}
                compact
              />
            ) : null}
          </div>
        </div>

        {/* Right metric */}
        <div className="text-right leading-tight">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            {getRightMetricLabel(caseItem)}
          </p>
          <p className="mt-0.5 font-mono text-[18px] font-semibold tabular-nums text-zinc-800">
            {formatRightMetric(caseItem)}
          </p>
        </div>
      </div>

      {/* Script body */}
      <p
        className={cn(
          "mt-4 line-clamp-3 whitespace-pre-wrap text-[14px] font-medium leading-7",
          accent.muted ? "text-zinc-600" : "text-zinc-800",
        )}
      >
        {caseItem.script_text}
      </p>

      {/* Conclusion preview */}
      {caseItem.admin_conclusion ? (
        <p className="mt-2 line-clamp-1 text-[12px] leading-6 text-zinc-500">
          {caseItem.admin_conclusion}
        </p>
      ) : null}

      {/* Bottom row: thumbnails · meta · actions */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {screenshots.length > 0 ? (
          <div className="flex items-center gap-1.5">
            {screenshots.slice(0, 3).map((path, idx) => (
              <button
                key={path}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenLightbox?.(screenshots, idx);
                }}
                className="group/img relative size-10 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 transition-all hover:border-zinc-300"
              >
                <Image
                  src={`/api/violations/screenshot/${encodeURI(path)}`}
                  alt={`截图 ${idx + 1}`}
                  fill
                  unoptimized
                  sizes="40px"
                  className="object-cover transition-transform group-hover/img:scale-105"
                />
              </button>
            ))}
            {screenshots.length > 3 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenLightbox?.(screenshots, 3);
                }}
                className="flex size-10 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100"
              >
                +{screenshots.length - 3}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] text-zinc-400">
          <span className="truncate">{getSubmitterName(caseItem)}</span>
          <span className="text-zinc-300">·</span>
          <span className="shrink-0 tabular-nums">
            {formatDateTime(caseItem.reviewed_at ?? caseItem.created_at)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {canManageViolations ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenReview?.(caseItem);
              }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[12px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
            >
              审批
            </button>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick();
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 active:translate-y-0"
          >
            查看详情
            <ArrowRight className="size-3 stroke-[1.5]" />
          </button>
        </div>
      </div>
    </div>
  );
}
