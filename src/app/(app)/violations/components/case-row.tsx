"use client";

import { useCallback, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  GUIDANCE_METHOD_LABELS,
  type GuidanceMethod,
  type ViolationCase,
} from "./types";
import { getPassRate } from "./format";

interface CaseRowProps {
  caseItem: ViolationCase;
  onOpenDetail: (id: string) => void;
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

function formatRightMetric(item: ViolationCase) {
  if (item.purpose === "conversion") {
    const rate = item.weighted_conversion_rate;
    if (typeof rate === "number" && Number.isFinite(rate)) {
      return { value: `${(rate * 100).toFixed(2)}%`, label: "转化率" };
    }
    return { value: "—", label: "转化率" };
  }
  const rate = getPassRate(item);
  if (rate === null) return { value: "—", label: "通过率" };
  return { value: `${rate}%`, label: "通过率" };
}

export function CaseRow({ caseItem, onOpenDetail }: CaseRowProps) {
  const [copied, setCopied] = useState(false);
  const accent = resolveAccent(caseItem);
  const metric = formatRightMetric(caseItem);

  const guidanceMethod = caseItem.guidance_method as GuidanceMethod | undefined;
  const guidanceLabel =
    guidanceMethod && guidanceMethod in GUIDANCE_METHOD_LABELS
      ? GUIDANCE_METHOD_LABELS[guidanceMethod]
      : null;

  const handleClick = useCallback(() => onOpenDetail(caseItem.id), [caseItem.id, onOpenDetail]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  const handleCopy = useCallback(
    async (e: MouseEvent) => {
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
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => {
        import("@/components/case-detail-dialog");
      }}
      className={cn(
        "group relative flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-150",
        "hover:bg-stone-50 focus-visible:bg-stone-50 focus-visible:outline-none",
        accent.muted && "bg-stone-50/40",
      )}
    >
      {/* 左侧状态色点 */}
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: accent.dotColor }}
        aria-label={accent.label}
      />

      {/* 主体话术（单行截断） */}
      <p
        className={cn(
          "min-w-0 flex-1 truncate text-[14px] leading-[1.6]",
          accent.muted ? "text-stone-500" : "text-stone-800",
        )}
      >
        {caseItem.script_text}
      </p>

      {/* 右侧标签 + 指标 + 复制 */}
      <div className="flex shrink-0 items-center gap-2">
        {/* 类目 */}
        <span className="hidden rounded-md border border-stone-200 px-1.5 py-0.5 text-[11px] font-medium text-stone-500 sm:inline-flex">
          {caseItem.category || "其他"}
        </span>

        {/* 导粉方式 */}
        {guidanceLabel ? (
          <span className="hidden rounded-md border border-stone-200 px-1.5 py-0.5 text-[11px] text-stone-500 md:inline-flex">
            {guidanceLabel}
          </span>
        ) : null}

        {/* 指标（label 上方 / 数字下方，紧凑） */}
        <div className="min-w-[68px] text-right leading-none">
          <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">
            {metric.label}
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-[14px] font-semibold tabular-nums",
              caseItem.purpose === "conversion" ? "text-[#6FAA7D]" : "text-stone-800",
              accent.muted && "text-stone-500",
            )}
          >
            {metric.value}
          </p>
        </div>

        {/* 复制按钮 */}
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-medium transition-all active:translate-y-0",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-within:opacity-100",
            copied
              ? "bg-[#6FAA7D]/10 text-[#6FAA7D] opacity-100"
              : "text-stone-400 hover:bg-stone-100 hover:text-stone-700",
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
              <span className="hidden sm:inline">复制</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
