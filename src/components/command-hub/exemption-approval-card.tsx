"use client";

import { Calendar, Check, MessageSquare, PenLine, ShieldAlert, X } from "lucide-react";
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
  const feedbackGroupKey = `group-${group.groupKey}`;
  const isGroupFeedbackOpen = activeFeedbackKey === feedbackGroupKey;

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
          isFocused ? "border-l-[#D97757]" : "border-l-transparent",
        )}
      >
        {/* J/K Keyboard Spotlight Indicator */}
        {isFocused && (
          <div className="absolute top-2.5 right-3 hidden sm:flex items-center gap-1 text-[12px] font-mono text-[#78716C]/80 pointer-events-none select-none">
            <span className="rounded-md bg-[#F1F1F0] px-1 border border-[#E2E2DF]">A 同意</span>
            <span className="rounded-md bg-[#F1F1F0] px-1 border border-[#E2E2DF]">R 拒绝</span>
          </div>
        )}

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

              {/* 决策透视舱：消除审批盲签心智负担 */}
              {group.applicant_month_stats && (
                <span
                  title={`当月出勤记录（含未来已批准日期）：已准假 ${group.applicant_month_stats.approved_leave_days} 天，已准豁免 ${group.applicant_month_stats.approved_waived_days} 天`}
                  className="inline-flex items-center gap-1 rounded-md bg-[#F1F1F0]/80 border border-[#E2E2DF] px-1.5 py-0.5 text-[12px] text-[#78716C] shrink-0 font-normal tabular-nums"
                >
                  <span className="text-[#78716C]">本月已准</span>
                  <strong className="font-normal text-[#141413]">
                    {group.applicant_month_stats.approved_leave_days}
                  </strong>
                  <span className="text-[#78716C]">天</span>
                  {group.applicant_month_stats.approved_waived_days > 0 && (
                    <>
                      <span className="text-[#E2E2DF]">/</span>
                      <span className="text-[#78716C]">豁免</span>
                      <strong className="font-normal text-[#141413]">
                        {group.applicant_month_stats.approved_waived_days}
                      </strong>
                      <span className="text-[#78716C]">天</span>
                    </>
                  )}
                </span>
              )}

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

            <button
              type="button"
              title={isGroupFeedbackOpen ? "收起批注面板" : "附带批注流转（再次点击可收起）"}
              aria-expanded={isGroupFeedbackOpen}
              onClick={() => onGroupAction(group, "approved", true)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors cursor-pointer",
                isGroupFeedbackOpen
                  ? "bg-[#E4E4E1] text-[#141413]"
                  : "text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]",
              )}
            >
              <MessageSquare className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Inline Feedback Tray for Group */}
        <AnimatePresence>
          {isGroupFeedbackOpen && activeFeedbackConfig && (
            <InlineFeedbackTray
              initialAction={activeFeedbackConfig.initialAction}
              title={activeFeedbackConfig.title}
              scopeHint={activeFeedbackConfig.scopeHint}
              onConfirm={activeFeedbackConfig.handler}
              onCancel={onCloseFeedback}
            />
          )}
        </AnimatePresence>

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
              <span className="text-[12px] text-[#78716C]/75">
                可直接点选单日进行快速裁决
              </span>
            </div>

            {/* Horizontal Timeline Strip */}
            <div className="flex flex-wrap gap-1 pt-0.5">
              {group.dailyItems.map((daily) => {
                const isDailyApproved = daily.status === "approved";
                const isDailyRejected = daily.status === "rejected";
                const isFeedbackOpen = activeFeedbackKey === `daily-${daily.id}`;

                return (
                  <div
                    key={daily.id}
                    className={cn(
                      "relative inline-flex items-center gap-1 rounded-md pl-2.5 pr-2 py-1 text-[12px] transition-all select-none",
                      isDailyApproved
                        ? "bg-status-success/[0.08] text-status-success border border-status-success/15"
                        : isDailyRejected
                          ? "bg-status-danger/[0.08] text-status-danger border border-status-danger/15"
                          : "bg-[#FCFCFB] text-[#1F1E1D] border border-[#E2E2DF]/60 hover:bg-[#EBEBE9] hover:border-[#E2E2DF]",
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
                      /* 待审日期的常驻微符操作槽 */
                      <div className="flex items-center gap-1 ml-1 pl-1 border-l border-[#E2E2DF]">
                        <button
                          type="button"
                          title={`仅准许 ${daily.dateDisplay}`}
                          onClick={() => onDailyAction(group, daily, "approved", false)}
                          className="inline-flex size-5 items-center justify-center rounded-md hover:bg-status-success/15 text-status-success transition-colors cursor-pointer"
                        >
                          <Check className="size-3 stroke-[2.2]" />
                        </button>
                        <button
                          type="button"
                          title={`仅驳回 ${daily.dateDisplay}`}
                          onClick={() => onDailyAction(group, daily, "rejected", false)}
                          className="inline-flex size-5 items-center justify-center rounded-md hover:bg-status-danger/15 text-status-danger transition-colors cursor-pointer"
                        >
                          <X className="size-3 stroke-[2.2]" />
                        </button>
                        <button
                          type="button"
                          title={isFeedbackOpen ? "收起单日批注" : `为 ${daily.dateDisplay} 附带批注`}
                          aria-expanded={isFeedbackOpen}
                          onClick={() => onDailyAction(group, daily, "approved", true)}
                          className={cn(
                            "inline-flex size-5 items-center justify-center rounded-md transition-colors cursor-pointer",
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
