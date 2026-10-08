"use client";

import { Calendar, Check, PenLine, ShieldAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InlineFeedbackTray } from "@/components/inline-feedback-tray";
import type { DailyApprovalDetail, GroupedApprovalItem } from "@/lib/exemption-approvals";
import { formatRelativeTime } from "@/lib/command-hub/types";
import { cn } from "@/lib/utils";

interface ExemptionApprovalCardProps {
  group: GroupedApprovalItem;
  index: number;
  isFocused: boolean;
  activeFeedbackKey: string | null;
  activeFeedbackConfig: {
    initialAction: "approved" | "rejected";
    title: string;
    scopeHint: string;
    handler: (action: "approved" | "rejected", feedback: string) => void;
    required?: boolean;
    confirmLabel?: string;
  } | null;
  onFocus: () => void;
  onGroupAction: (group: GroupedApprovalItem, action: "approved" | "rejected", withFeedback?: boolean) => void;
  onDailyAction: (group: GroupedApprovalItem, daily: DailyApprovalDetail, action: "approved" | "rejected", withFeedback?: boolean) => void;
  onCloseFeedback: () => void;
}

export function ExemptionApprovalCard({
  group,
  index,
  isFocused,
  activeFeedbackKey,
  activeFeedbackConfig,
  onFocus,
  onGroupAction,
  onDailyAction,
  onCloseFeedback,
}: ExemptionApprovalCardProps) {
  const isLeave = group.nature === "leave";
  const hasMultiDays = group.dailyItems.length > 1;

  return (
    <motion.div
      id={`approval-card-${index}`}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      onClick={onFocus}
    >
      <Card
        className={cn(
          "group relative p-4.5 sm:p-5 transition-all duration-150 border-l-[3px] gap-0",
          isFocused ? "border-l-[#141413] shadow-claude-float" : "border-l-transparent",
        )}
      >
        {/* Card Header */}
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          {/* Left: Applicant Name, Team & Decision Context Capsule */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-normal text-[#141413] truncate">
                {group.applicant_name}
              </span>
              <span className="text-[#78716C] text-[12px]">·</span>
              <span className="text-[12px] text-[#78716C] truncate">
                {group.team_name || "未分配分组"}
              </span>

              {/* Distinction Badge */}
              <Badge
                variant={isLeave ? "secondary" : "success"}
                className="shrink-0 before:hidden"
              >
                {isLeave ? (
                  <Calendar className="size-3 text-[#78716C]" />
                ) : (
                  <ShieldAlert className="size-3 text-status-success" />
                )}
                <span>{group.categoryBadge}</span>
              </Badge>

              {group.isPartiallyProcessed && (
                <span className="rounded-md bg-status-warning/[0.08] text-status-warning px-1.5 py-0.5 text-[12px] font-normal shrink-0">
                  部分已审 ({group.approvedCount + group.rejectedCount}/{group.dailyItems.length})
                </span>
              )}
            </div>

            {/* Clean 1-line Subtitle: 日期跨度 · 相对时间 · 事由 */}
            <div className="mt-1 text-[13px] text-[#1F1E1D] leading-relaxed truncate">
              <span className="text-[#78716C] tabular-nums">
                {group.dateRangeText} · {formatRelativeTime(group.created_at)}
              </span>
              <span className="mx-1.5 text-[#E2E2DF]">·</span>
              <span className="text-[#1F1E1D] font-normal">
                {group.reasons.length > 0 ? group.reasons.join("；") : "未填写详细事由"}
              </span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 shrink-0 pt-0.5">
            <button
              type="button"
              onClick={() => onGroupAction(group, "approved", false)}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-status-success/[0.08] hover:bg-status-success/15 px-3 text-[12px] font-normal text-status-success transition-all active:scale-[0.98] cursor-pointer"
            >
              <Check className="size-3.5 stroke-[2.2]" />
              <span>
                {group.isPartiallyProcessed
                  ? `同意剩余 (${group.pendingCount}天)`
                  : "同意全部"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onGroupAction(group, "rejected", false)}
              className="inline-flex h-7 items-center gap-1 rounded-md hover:bg-status-danger/[0.06] px-2 text-[12px] font-normal text-[#78716C] hover:text-status-danger transition-all active:scale-[0.98] cursor-pointer"
            >
              <X className="size-3.5 stroke-[2]" />
              <span>
                {group.isPartiallyProcessed
                  ? `拒绝剩余 (${group.pendingCount}天)`
                  : "拒绝全部"}
              </span>
            </button>
          </div>
        </div>

        {/* Multi-day Timeline Strip */}
        {hasMultiDays && (
          <div className="mt-3 pt-2.5 border-t border-[#E2E2DF]/60 space-y-2">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-normal text-[#78716C] flex items-center gap-1">
                <span>逐日明细 ({group.dailyItems.length} 天)</span>
                {group.isPartiallyProcessed && (
                  <span className="text-[12px] text-status-warning">
                    · 待决策 {group.pendingCount} 天
                  </span>
                )}
              </span>
            </div>

            {/* Horizontal Timeline Strip: 常态如纸张般安静，悬停/键盘焦点/激活态时按需轻柔呈现 */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {group.dailyItems.map((daily) => {
                const isDailyApproved = daily.status === "approved";
                const isDailyRejected = daily.status === "rejected";
                const isFeedbackOpen = activeFeedbackKey === `daily-${daily.id}`;

                return (
                  <div
                    key={daily.id}
                    className={cn(
                      "group/daily relative inline-flex items-center gap-1 rounded-md pl-2.5 pr-2 py-1 text-[12px] transition-all select-none",
                      isDailyApproved
                        ? "bg-status-success/[0.08] text-status-success border border-status-success/15"
                        : isDailyRejected
                          ? "bg-status-danger/[0.08] text-status-danger border border-status-danger/15"
                          : "bg-white text-[#1F1E1D] border border-[#E2E2DF]/60 hover:bg-[#EBEBE9] hover:border-[#E2E2DF]",
                    )}
                  >
                    <span className="font-normal tabular-nums">{daily.dateDisplay}</span>
                    <span className="text-[12px] opacity-70">{daily.dayOfWeek}</span>

                    {/* 已裁决印记 */}
                    {isDailyApproved ? (
                      <span className="inline-flex items-center gap-0.5 text-[12px] text-status-success font-normal ml-0.5">
                        <Check className="size-3 stroke-[2.2]" />
                        <span>已准</span>
                      </span>
                    ) : isDailyRejected ? (
                      <span className="inline-flex items-center gap-0.5 text-[12px] text-status-danger font-normal ml-0.5">
                        <X className="size-3 stroke-[2.2]" />
                        <span>已拒</span>
                      </span>
                    ) : (
                      /* 待审日期的微符操作槽：保留DOM与无障碍focus，悬停/J-K聚焦Tab触达/单日批注时平滑浮现 */
                      <div
                        className={cn(
                          "flex items-center gap-1 ml-1 pl-1 border-l border-[#E2E2DF] transition-opacity duration-150",
                          isFeedbackOpen || isFocused
                            ? "opacity-100"
                            : "opacity-0 group-hover/daily:opacity-100 focus-within:opacity-100",
                        )}
                      >
                        <button
                          type="button"
                          title={`仅准许 ${daily.dateDisplay}`}
                          onClick={() => onDailyAction(group, daily, "approved", false)}
                          className="inline-flex size-5 items-center justify-center rounded-md hover:bg-status-success/15 text-status-success transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-status-success"
                        >
                          <Check className="size-3 stroke-[2.2]" />
                        </button>
                        <button
                          type="button"
                          title={`仅驳回 ${daily.dateDisplay}`}
                          onClick={() => onDailyAction(group, daily, "rejected", false)}
                          className="inline-flex size-5 items-center justify-center rounded-md hover:bg-status-danger/15 text-status-danger transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-status-danger"
                        >
                          <X className="size-3 stroke-[2.2]" />
                        </button>
                        <button
                          type="button"
                          title={isFeedbackOpen ? "收起单日批注" : `为 ${daily.dateDisplay} 附带批注`}
                          aria-expanded={isFeedbackOpen}
                          onClick={() => onDailyAction(group, daily, "approved", true)}
                          className={cn(
                            "inline-flex size-5 items-center justify-center rounded-md transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-[#141413]",
                            isFeedbackOpen
                              ? "text-[#141413] bg-[#E4E4E1]"
                              : "text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]",
                          )}
                        >
                          <PenLine className="size-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Single Day Feedback Tray if active */}
            {group.dailyItems.some((d) => activeFeedbackKey === `daily-${d.id}`) && (
              <AnimatePresence>
                {activeFeedbackConfig && (
                  <InlineFeedbackTray
                    initialAction={activeFeedbackConfig.initialAction}
                    title={activeFeedbackConfig.title}
                    scopeHint={activeFeedbackConfig.scopeHint}
                    onConfirm={activeFeedbackConfig.handler}
                    onCancel={onCloseFeedback}
                  />
                )}
              </AnimatePresence>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
