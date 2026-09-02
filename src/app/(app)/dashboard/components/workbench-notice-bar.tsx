"use client";

import React, { useState, useEffect, useRef } from "react";
import { Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";

export type WorkbenchNoticeItem = {
  id: string;
  type: "draft" | "exemption_review" | "exemption_pending" | "topic_context";
  statusTone: "amber" | "green" | "red" | "mineral";
  title: string;
  description?: string;
  topicId?: string;
  actions?: React.ReactNode;
  onDismiss?: () => void;
};

function renderStatusDot(notice: WorkbenchNoticeItem) {
  switch (notice.statusTone) {
    case "green":
      return (
        <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[#6FAA7D]/15 text-[#6FAA7D]">
          <Check className="size-2.5 stroke-[2.5]" />
        </span>
      );
    case "red":
      return (
        <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[#C0685C]/15 text-[#C0685C]">
          <span className="size-1.5 rounded-full bg-[#C0685C]" />
        </span>
      );
    case "amber":
      return (
        <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[#D97757]/15 text-[#D97757]">
          <span
            className={cn(
              "size-1.5 rounded-full bg-[#D97757]",
              notice.type === "exemption_pending" && "animate-pulse",
            )}
          />
        </span>
      );
    case "mineral":
    default:
      return (
        <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[#6FAA7D]/15 text-[#6FAA7D]">
          <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
        </span>
      );
  }
}

/**
 * 方案 A：标题栏内联微胶囊（0 通栏空间占用）
 */
export function WorkbenchNoticeCapsule({
  notices,
  className,
}: {
  notices: WorkbenchNoticeItem[];
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  if (!notices || notices.length === 0) return null;

  const primaryNotice = notices[0];
  const hasMultiple = notices.length > 1;

  return (
    <div className={cn("relative inline-flex items-center", className)} ref={popoverRef}>
      <div
        data-topic-context={primaryNotice.topicId}
        className="inline-flex items-center gap-2 rounded-lg bg-[#F5F3EE] px-2.5 py-1 text-[12px] text-[#78716C] transition-all"
      >
        {renderStatusDot(primaryNotice)}
        <span className="font-medium text-[#292524]">{primaryNotice.title}</span>
        {primaryNotice.description && (
          <span className="text-[#78716C] hidden sm:inline">{primaryNotice.description}</span>
        )}

        {primaryNotice.actions}

        {hasMultiple && (
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="inline-flex items-center gap-0.5 rounded-md bg-[#EBE7DF] hover:bg-[#E5DFD3] px-1.5 py-0.5 text-[11px] font-medium text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer select-none"
            aria-label="查看更多提示"
          >
            <span>+{notices.length - 1}</span>
            <ChevronDown className={cn("size-2.5 stroke-[2] transition-transform", isOpen && "rotate-180")} />
          </button>
        )}

        {primaryNotice.onDismiss && (
          <button
            type="button"
            onClick={primaryNotice.onDismiss}
            className="p-0.5 text-[#78716C] hover:text-[#1C1917] transition-colors rounded-md hover:bg-[#ECE7DE] cursor-pointer"
            aria-label="关闭提示"
          >
            <X className="size-3 stroke-[2]" />
          </button>
        )}
      </div>

      {/* 多条提示时展开浮层 */}
      {isOpen && hasMultiple && (
        <div className="absolute left-0 top-full mt-1.5 z-40 w-72 sm:w-80 rounded-xl border border-[#E5E0D6] bg-white p-2 shadow-claude-float divide-y divide-[#ECE7DE]/60 ring-1 ring-[#1C1917]/5 animate-in fade-in zoom-in-95 duration-150">
          {notices.map((notice) => (
            <div
              key={notice.id}
              data-topic-context={notice.topicId}
              className="flex items-center justify-between gap-2 py-2 px-1 text-[12px] text-[#78716C] first:pt-1 last:pb-1"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {renderStatusDot(notice)}
                <span className="font-medium text-[#292524] truncate">{notice.title}</span>
                {notice.description && (
                  <span className="truncate text-[#78716C] text-[11.5px]">{notice.description}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {notice.actions}
                {notice.onDismiss && (
                  <button
                    type="button"
                    onClick={notice.onDismiss}
                    className="p-0.5 text-[#78716C] hover:text-[#1C1917] transition-colors rounded hover:bg-[#F5F3EE] cursor-pointer"
                    aria-label="关闭提示"
                  >
                    <X className="size-3 stroke-[2]" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface WorkbenchNoticeBarProps {
  notices: WorkbenchNoticeItem[];
  className?: string;
}

/**
 * 通栏模式（供非表单视图使用）
 */
export function WorkbenchNoticeBar({ notices, className }: WorkbenchNoticeBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (notices.length <= 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 通知数量收缩时重置展开态
      setIsExpanded(false);
    }
  }, [notices.length]);

  if (!notices || notices.length === 0) return null;

  const primaryNotice = notices[0];
  const hasMultiple = notices.length > 1;

  const renderNoticeRow = (
    notice: WorkbenchNoticeItem,
    isPrimary: boolean,
    showExpandToggle: boolean,
  ) => {
    return (
      <div
        key={notice.id}
        data-topic-context={notice.topicId}
        className={cn(
          "flex items-center justify-between gap-2.5 text-[12.5px] text-[#78716C] min-h-[34px]",
          isExpanded ? "py-2 px-3 sm:px-3.5" : "py-1.5 px-3 sm:px-3.5",
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {renderStatusDot(notice)}
          <span className="font-medium text-[#292524] shrink-0">
            {notice.title}
          </span>
          {notice.description && (
            <span className="truncate text-[#78716C] text-[12px] sm:text-[12.5px]">
              {notice.description}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {notice.actions}

          {showExpandToggle && hasMultiple && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-md bg-[#EBE7DF] hover:bg-[#E5DFD3] px-2 py-0.5 text-[11.5px] font-medium text-[#78716C] hover:text-[#292524] transition-colors cursor-pointer select-none"
              aria-label={isExpanded ? "收起提示" : `展开全部 ${notices.length} 条提示`}
            >
              <span>{isExpanded ? "收起" : `共 ${notices.length} 条提示`}</span>
              {isExpanded ? (
                <ChevronUp className="size-3 stroke-[2]" />
              ) : (
                <ChevronDown className="size-3 stroke-[2]" />
              )}
            </button>
          )}

          {notice.onDismiss && (
            <button
              type="button"
              onClick={notice.onDismiss}
              className="p-1 text-[#78716C] hover:text-[#1C1917] transition-colors rounded hover:bg-[#F5F3EE] cursor-pointer"
              aria-label="关闭提示"
            >
              <X className="size-3.5 stroke-[2]" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-[#ECE7DE]/70 bg-[#F5F3EE]/60 transition-all duration-200 overflow-hidden",
        className,
      )}
    >
      {!isExpanded ? (
        renderNoticeRow(primaryNotice, true, true)
      ) : (
        <div className="divide-y divide-[#ECE7DE]/60">
          {notices.map((notice, idx) =>
            renderNoticeRow(notice, idx === 0, idx === 0),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 辅助构建请假/豁免审批通知的 NoticeItem
 */
export function buildExemptionReviewNoticeItem(
  notice: NonNullable<DashboardPageData["userExemptionReviewNotice"]>,
  onDismiss: () => void,
): WorkbenchNoticeItem {
  const isApproved = notice.request_status === "approved";
  const categoryText = notice.exemption_category === "leave" ? "请假" : "特殊豁免";
  const dateText =
    notice.start_date === notice.end_date || !notice.end_date
      ? notice.start_date
      : `${notice.start_date} 至 ${notice.end_date}`;

  return {
    id: `notice-review-${notice.id || notice.created_at || "review"}`,
    type: "exemption_review",
    statusTone: isApproved ? "green" : "red",
    title: `${dateText} ${categoryText}${isApproved ? "已通过" : "未通过"}`,
    description: notice.reason ? `· ${notice.reason}` : undefined,
    onDismiss,
  };
}
