"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

import { PassRateBadge } from "./pass-rate-badge";
import { formatDateTime, getPassRate, getSubmitterName } from "./format";
import {
  GUIDANCE_METHOD_LABELS,
  type GuidanceMethod,
  type ViolationCase,
} from "./types";

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
  const [copied, setCopied] = useState(false);
  const accent = resolveAccent(caseItem);
  const screenshots = caseItem.screenshot_paths ?? [];
  const guidanceMethod = caseItem.guidance_method as GuidanceMethod | undefined;
  const guidanceLabel =
    guidanceMethod && guidanceMethod in GUIDANCE_METHOD_LABELS
      ? GUIDANCE_METHOD_LABELS[guidanceMethod]
      : null;

  const handleCardClick = () => onOpenDetail(caseItem.id);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(caseItem.script_text ?? "");
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } catch {
        /* noop */
      }
    },
    [caseItem.script_text],
  );

  return (
    <article
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
        "group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white transition-all duration-200",
        "hover:-translate-y-[1px] hover:border-zinc-300 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.08)]",
        "active:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300",
        accent.muted && "bg-zinc-50/40",
      )}
    >
      {/* Top: screenshot or banner */}
      {screenshots.length > 0 ? (
        <div className="relative h-36 w-full overflow-hidden bg-zinc-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLightbox?.(screenshots, 0);
            }}
            className="block size-full cursor-zoom-in"
            aria-label="查看截图"
          >
            <Image
              src={`/api/violations/screenshot/${encodeURI(screenshots[0])}`}
              alt="话术截图"
              fill
              unoptimized
              sizes="(min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          </button>
          {screenshots.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenLightbox?.(screenshots, 0);
              }}
              className="absolute bottom-2 right-2 inline-flex h-6 items-center gap-1 rounded-md bg-black/55 px-2 text-[11px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              共 {screenshots.length} 张
            </button>
          ) : null}
          {/* Right metric float */}
          <div className="absolute top-2 right-2 rounded-lg bg-white/90 px-2 py-1 backdrop-blur-sm shadow-sm">
            <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
              {getRightMetricLabel(caseItem)}
            </p>
            <p className="font-mono text-[15px] font-semibold leading-tight tabular-nums text-zinc-800">
              {formatRightMetric(caseItem)}
            </p>
          </div>
        </div>
      ) : (
        <div className="relative flex flex-col gap-2 px-5 pt-5 pb-3">
          {/* 纸质排版式：左标 + 右指标 */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: accent.dotColor }}
              />
              <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">
                {accent.label}
              </span>
            </div>
            <div className="text-right leading-none">
              <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-400">
                {getRightMetricLabel(caseItem)}
              </p>
              <p
                className={cn(
                  "mt-1 font-mono text-[20px] font-semibold tabular-nums leading-none",
                  caseItem.purpose === "conversion"
                    ? "text-[#6FAA7D]"
                    : "text-zinc-800",
                )}
              >
                {formatRightMetric(caseItem)}
              </p>
            </div>
          </div>
          {/* 极细分隔线，强化纸质感 */}
          <div className="h-px bg-zinc-100" />
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 px-4 py-3.5">
        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          {screenshots.length > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600"
              style={{ borderColor: `${accent.dotColor}33` }}
            >
              <span
                className="size-1 rounded-full"
                style={{ backgroundColor: accent.dotColor }}
              />
              {accent.label}
            </span>
          ) : null}
          <span className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
            {caseItem.category || "其他"}
          </span>
          {guidanceLabel ? (
            <span className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500">
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

        {/* Script */}
        <p
          className={cn(
            "line-clamp-3 whitespace-pre-wrap text-[13px] font-medium leading-[1.7]",
            accent.muted ? "text-zinc-600" : "text-zinc-800",
          )}
        >
          {caseItem.script_text}
        </p>

        {/* Conclusion */}
        {caseItem.admin_conclusion ? (
          <p className="line-clamp-1 rounded-md bg-zinc-50 px-2 py-1 text-[11px] leading-5 text-zinc-500">
            {caseItem.admin_conclusion}
          </p>
        ) : null}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="truncate">{getSubmitterName(caseItem)}</span>
          <span className="text-zinc-300">·</span>
          <span className="shrink-0 tabular-nums text-zinc-400">
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
              className="inline-flex h-7 items-center rounded-md border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
            >
              审批
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-all active:translate-y-0",
              copied
                ? "bg-[#6FAA7D]/10 text-[#6FAA7D]"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800",
            )}
            aria-label="复制话术"
          >
            {copied ? (
              <>
                <Check className="size-3 stroke-[2]" />
                已复制
              </>
            ) : (
              <>
                <Copy className="size-3 stroke-[1.75]" />
                复制
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
