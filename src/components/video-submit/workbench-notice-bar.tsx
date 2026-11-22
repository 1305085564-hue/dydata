"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import { buildPendingExemptionNoticeCopy } from "@/lib/pending-exemption-notice";
import { WithdrawPendingButton } from "@/components/video-submit/withdraw-pending-button";

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
        <span className="size-1.5 rounded-full bg-current text-status-success shrink-0" />
      );
    case "red":
      return (
        <span className="size-1.5 rounded-full bg-current text-status-danger shrink-0" />
      );
    case "amber":
      return (
        <span
          className={cn(
            "size-1.5 rounded-full bg-current text-status-warning shrink-0",
            notice.type === "exemption_pending" && "animate-pulse",
          )}
        />
      );
    case "mineral":
    default:
      return (
        <span className="size-1.5 rounded-full bg-current text-[#78716C] shrink-0" />
      );
  }
}

/**
 * 方案 1：纯排版微边注（拆除药丸底盒，微点 + 纯文字）
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
        className="inline-flex items-center gap-1 text-[12px] text-[#78716C] transition-colors py-0.5"
      >
        {renderStatusDot(primaryNotice)}
        <span className="text-[#78716C]">{primaryNotice.title}</span>
        {primaryNotice.description && (
          <span className="text-[#78716C] hidden sm:inline">{primaryNotice.description}</span>
        )}

        {primaryNotice.actions && (
          <>
            <span className="text-[#A8A29E] mx-0.5" aria-hidden="true">·</span>
            {primaryNotice.actions}
          </>
        )}

        {hasMultiple && (
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[12px] text-[#78716C] hover:text-[#1F1E1D] transition-colors cursor-pointer select-none ml-0.5"
            aria-label="查看更多提示"
          >
            <span>+{notices.length - 1}</span>
            <ChevronDown className={cn("size-2.5 stroke-[2] transition-[transform,color] duration-150", isOpen && "rotate-180")} />
          </button>
        )}

        {primaryNotice.onDismiss && (
          <button
            type="button"
            onClick={primaryNotice.onDismiss}
            className="p-0.5 text-[#A8A29E] hover:text-[#141413] transition-colors rounded-md hover:bg-[#F1F1F0] cursor-pointer ml-0.5"
            aria-label="关闭提示"
          >
            <X className="size-3 stroke-[2]" />
          </button>
        )}
      </div>

      {/* 多条提示时展开浮层 */}
      {isOpen && hasMultiple && (
        <div className="absolute left-0 top-full mt-1.5 z-40 w-72 sm:w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[#E2E2DF] bg-white p-2 shadow-claude-float divide-y divide-[#E2E2DF]/60 ring-1 ring-[#141413]/5 animate-in fade-in duration-100">
          {notices.map((notice) => (
            <div
              key={notice.id}
              data-topic-context={notice.topicId}
              className="flex items-center justify-between gap-2 py-2 px-1 text-[12px] text-[#78716C] first:pt-1 last:pb-1"
            >
              <div className="flex items-center gap-1 min-w-0 flex-1">
                {renderStatusDot(notice)}
                <span className="font-normal text-[#1F1E1D] truncate">{notice.title}</span>
                {notice.description && (
                  <span className="truncate text-[#78716C] text-[12px]">{notice.description}</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {notice.actions}
                {notice.onDismiss && (
                  <button
                    type="button"
                    onClick={notice.onDismiss}
                    className="p-0.5 text-[#78716C] hover:text-[#141413] transition-colors rounded-md hover:bg-[#EBEBE9] cursor-pointer"
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
          "flex items-center justify-between gap-2 text-[14px] text-[#78716C] min-h-[34px]",
          isExpanded ? "py-2 px-3 sm:px-3.5" : "py-1.5 px-3 sm:px-3.5",
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {renderStatusDot(notice)}
          <span className="font-normal text-[#1F1E1D] shrink-0">
            {notice.title}
          </span>
          {notice.description && (
            <span className="truncate text-[#78716C] text-[12px] sm:text-[14px]" title={notice.description}>
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
              className="inline-flex items-center gap-1 rounded-md bg-[#F1F1F0] hover:bg-[#EBEBE9] px-2 py-0.5 text-[12px] font-normal text-[#78716C] hover:text-[#1F1E1D] transition-colors cursor-pointer select-none"
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
              className="p-1 text-[#78716C] hover:text-[#141413] transition-colors rounded-md hover:bg-[#EBEBE9] cursor-pointer"
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
        "rounded-xl border border-[#E2E2DF]/60 bg-[#F1F1F0]/60 transition duration-200 overflow-hidden",
        className,
      )}
    >
      {!isExpanded ? (
        renderNoticeRow(primaryNotice, true, true)
      ) : (
        <div className="divide-y divide-[#E2E2DF]/60">
          {notices.map((notice, idx) =>
            renderNoticeRow(notice, idx === 0, idx === 0),
          )}
        </div>
      )}
    </div>
  );
}

const formatNoticeDate = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;

/** 同一条驳回理由的日期并在一起：「11月13日、11月14日（理由）；11月15日（另一条理由）」。 */
function describeRejected(rejected: ReadonlyArray<{ date: string; feedback: string | null }>) {
  const groups: Array<{ feedback: string; dates: string[] }> = [];
  for (const item of rejected) {
    const feedback = item.feedback?.trim() ?? "";
    const group = groups.find((entry) => entry.feedback === feedback);
    if (group) group.dates.push(formatNoticeDate(item.date));
    else groups.push({ feedback, dates: [formatNoticeDate(item.date)] });
  }
  return groups.map((group) => `${group.dates.join("、")}${group.feedback ? `（${group.feedback}）` : ""}`).join("；");
}

/**
 * 辅助构建请假/豁免审批通知的 NoticeItem：一条申请一项，按逐日结果展示，
 * 通过和驳回的日期都列出，驳回带管理员写的理由；部分通过时两类并列。
 */
export function buildExemptionReviewNoticeItem(
  notice: NonNullable<DashboardPageData["userExemptionReviewNotices"][number]>,
  onDismiss: () => void,
): WorkbenchNoticeItem {
  const categoryText = notice.exemption_category === "leave" ? "请假" : "特殊豁免";
  const daily = notice.daily_results ?? [];
  const approvedDates = daily.filter((d) => d.status === "approved").map((d) => d.date);
  const rejected = daily.filter((d) => d.status === "rejected");
  const pendingCount = daily.filter((d) => d.status === "pending").length;
  const processedCount = approvedDates.length + rejected.length;
  const id = `notice-review-${notice.id || notice.created_at || "review"}`;

  // 存在逐日明细时按逐日结果展示，覆盖部分批准（request_status 仍为 pending）的场景；
  // 否则回退整单状态。
  if (processedCount > 0) {
    const isPartial = approvedDates.length > 0 && rejected.length > 0;
    const isAllApproved = rejected.length === 0;
    const parts = [
      approvedDates.length ? `通过：${approvedDates.map(formatNoticeDate).join("、")}` : "",
      rejected.length ? `驳回：${describeRejected(rejected)}` : "",
      pendingCount ? `另有 ${pendingCount} 天待审` : "",
    ].filter(Boolean);
    return {
      id,
      type: "exemption_review",
      statusTone: isPartial ? "amber" : isAllApproved ? "green" : "red",
      title: `${categoryText}${isPartial ? `部分通过（${approvedDates.length}/${processedCount}）` : isAllApproved ? "已通过" : "未通过"}`,
      description: `· ${parts.join("；")}`,
      onDismiss,
    };
  }

  const isApproved = notice.request_status === "approved";
  const dateText =
    notice.start_date === notice.end_date || !notice.end_date
      ? notice.start_date
      : `${notice.start_date} 至 ${notice.end_date}`;

  return {
    id,
    type: "exemption_review",
    statusTone: isApproved ? "green" : "red",
    title: `${dateText} ${categoryText}${isApproved ? "已通过" : "未通过"}`,
    description: notice.reason ? `· ${notice.reason}` : undefined,
    onDismiss,
  };
}

/** 近 7 天全部审批结果，一条申请一项；关闭是整组关闭（同一个 onDismiss）。 */
export function buildExemptionReviewNoticeItems(
  notices: ReadonlyArray<NonNullable<DashboardPageData["userExemptionReviewNotices"][number]>>,
  onDismiss: () => void,
): WorkbenchNoticeItem[] {
  return notices.map((notice) => buildExemptionReviewNoticeItem(notice, onDismiss));
}

/**
 * 待审批请假/免交提示。面板与表单两处共用同一条，传入 onWithdraw 时带「撤回申请」。
 */
export function buildPendingExemptionNoticeItem({
  items,
  onDismiss,
  onWithdraw,
}: {
  items: DashboardPageData["pendingExemptionItems"];
  onDismiss?: () => void;
  onWithdraw?: () => Promise<unknown> | void;
}): WorkbenchNoticeItem {
  const copy = buildPendingExemptionNoticeCopy(items);
  return {
    id: "pending-exemption",
    type: "exemption_pending",
    statusTone: "amber",
    title: copy.title,
    description: copy.description,
    actions: onWithdraw ? <WithdrawPendingButton onWithdraw={onWithdraw} /> : undefined,
    onDismiss,
  };
}
