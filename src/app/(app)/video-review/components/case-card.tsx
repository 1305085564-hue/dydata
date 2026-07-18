"use client";

import { useState } from "react";
import { Copy, Eye, Check, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortDate } from "./format";
import type { ApprovedDraftItem } from "./types";

interface CaseCardProps {
  item: ApprovedDraftItem;
  isMine: boolean;
  onOpenLightbox: (paths: string[], index: number) => void;
  onOpenDetail: (item: ApprovedDraftItem) => void;
}

export function CaseCard({ item, isMine, onOpenLightbox, onOpenDetail }: CaseCardProps) {
  const [copied, setCopied] = useState(false);
  const screenshotCount = item.screenshot_paths.length;
  const firstScreenshot = screenshotCount > 0 ? item.screenshot_paths[0] : null;

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
    if (screenshotCount > 0) {
      onOpenLightbox(item.screenshot_paths, 0);
    }
  };

  return (
    <div
      onClick={() => onOpenDetail(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetail(item);
        }
      }}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-xl border border-stone-200 bg-white transition-all duration-200 hover:-translate-y-px cursor-pointer",
        isMine && "ring-1 ring-[#8AA8C7]/30 border-[#8AA8C7]/40"
      )}
    >
      {/* 截图区域 (16:10) */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-stone-100">
        {firstScreenshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/violations/screenshot/${encodeURI(firstScreenshot)}`}
            alt={item.script_text.slice(0, 20)}
            className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-stone-500">
            <ImageIcon className="size-6 stroke-[1.5]" />
            <span className="text-[12px]">无截图凭证</span>
          </div>
        )}

        {/* 成员身份挂载标签 */}
        {isMine && (
          <span className="absolute top-2 left-2 rounded-full bg-stone-100 px-2 py-0.5 text-[12px] font-medium text-stone-700 border border-stone-200">
            我的
          </span>
        )}

        {/* Hover 快捷操作浮层 */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-stone-900/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            type="button"
            onClick={handleViewShots}
            disabled={screenshotCount === 0}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg bg-white/90 text-stone-700 transition-colors active:scale-95",
              screenshotCount === 0
                ? "cursor-not-allowed opacity-50"
                : "hover:bg-white"
            )}
            title={screenshotCount > 0 ? "查看截图" : "无截图"}
          >
            <Eye className="size-4 stroke-[2]" />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex size-8 items-center justify-center rounded-lg bg-white/90 text-stone-700 transition-colors hover:bg-white active:scale-95"
            title="复制文案"
          >
            {copied ? (
              <Check className="size-4 stroke-[2.5] text-[#3F7A4E]" />
            ) : (
              <Copy className="size-4 stroke-[2]" />
            )}
          </button>
        </div>
      </div>

      {/* 内容信息区域 */}
      <div className="flex flex-1 flex-col justify-between p-3.5 space-y-3 bg-white">
        <p className="line-clamp-2 text-[13px] font-medium leading-[1.5] text-stone-700">
          {item.script_text}
        </p>

        <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-[12px] text-stone-500">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate font-medium text-stone-700">
              {item.submitted_by_name}
            </p>
            <p className="truncate text-stone-500">
              {item.account_name_snapshot ?? "未关联账号"}
            </p>
          </div>
          <span className="text-stone-500 tabular-nums">
            {formatShortDate(item.approved_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
