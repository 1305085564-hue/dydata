"use client";

import { useState } from "react";
import { Check, Copy, Image as ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { getScriptOpening, formatShortDate } from "./format";
import type { ApprovedDraftItem } from "./types";

interface ApprovedRowProps {
  item: ApprovedDraftItem;
  isLast: boolean;
  onOpenLightbox: (paths: string[], index: number) => void;
}

export function ApprovedRow({ item, isLast, onOpenLightbox }: ApprovedRowProps) {
  const [copied, setCopied] = useState(false);
  const screenshotCount = item.screenshot_paths.length;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(item.script_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignored */
    }
  };

  const handleViewShots = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (screenshotCount > 0) onOpenLightbox(item.screenshot_paths, 0);
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-zinc-50",
        !isLast && "border-b border-zinc-100",
      )}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: "#6FAA7D" }}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] leading-[1.55] text-zinc-800">
          {getScriptOpening(item.script_text, 60)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-400">
          <span>{item.account_name_snapshot ?? "未关联账号"}</span>
          <span className="text-zinc-300">·</span>
          <span className="tabular-nums">{formatShortDate(item.approved_at)}</span>
          <span className="text-zinc-300">·</span>
          <span>{item.submitted_by_name}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleViewShots}
          disabled={screenshotCount === 0}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[12px] font-medium transition-colors active:translate-y-0",
            screenshotCount === 0
              ? "cursor-not-allowed text-zinc-300"
              : "text-zinc-600 hover:border-zinc-300 hover:text-zinc-800",
          )}
        >
          <ImageIcon className="size-3.5 stroke-[1.5]" />
          {screenshotCount > 0 ? `截图 ${screenshotCount}` : "无截图"}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[12px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
        >
          {copied ? (
            <>
              <Check className="size-3.5 stroke-[2] text-[#6FAA7D]" />
              已复制
            </>
          ) : (
            <>
              <Copy className="size-3.5 stroke-[1.5]" />
              复制
            </>
          )}
        </button>
      </div>
    </div>
  );
}
