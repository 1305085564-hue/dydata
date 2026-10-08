"use client";

import { Check, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { FulfillmentAppealCard } from "@/components/command-hub/fulfillment-appeal-card";
import { ExemptionApprovalCard } from "@/components/command-hub/exemption-approval-card";
import { TodoItemCard } from "@/components/command-hub/todo-item-card";
import type { ApprovalTabProps } from "@/lib/command-hub/types";

export function ApprovalsTab({
  activeTab,
  isAdmin,
  filterNature,
  setFilterNature,
  focusedCardIndex,
  setFocusedCardIndex,
  groupedApprovals,
  appealItems,
  visibleCards,
  pendingApprovals,
  handleApproveAll,
  approvalError,
  summaryError,
  fetchApprovals,
  approvalsLoading,
  actionsLoading,
  activeFeedbackKey,
  activeFeedbackConfig,
  actionProcessing,
  scheduleAppealReviewWithUndo,
  toggleAppealReject,
  setActiveFeedbackKey,
  handleGroupAction,
  handleDailyAction,
  todoItems = [],
  todoProcessingId,
  handleToggleTodo,
  relativeTime = (iso) => iso,
  completedSessionIds = [],
  completedSessionTitles = {},
  markTodoRead,
  onOpenChange,
}: ApprovalTabProps) {
  const displayError = approvalError || summaryError;
  const totalApprovalCount = groupedApprovals.length + appealItems.length;
  const totalCount = totalApprovalCount + todoItems.length;
  const leaveCount = groupedApprovals.filter((g) => g.nature === "leave").length;
  const waiveCount = groupedApprovals.filter((g) => g.nature === "waive").length;
  const appealCount = appealItems.length;
  const todoCount = todoItems.length;

  const approvalCardsCount = visibleCards.filter((c) => c.type !== "todo").length;

  return (
    <>
{/* 1. APPROVALS & TODOS WORKBENCH (待处理工作台 - 管理员视图) */}
{activeTab === "approvals" && isAdmin && (
  <div className="space-y-3">
    {/* Filter & Metric Bar: 纯净目录排版 */}
    <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#E2E2DF]/60">
      <div className="flex items-center gap-4 text-[13px]">
        <button
          type="button"
          onClick={() => {
            setFilterNature("all");
            setFocusedCardIndex(0);
          }}
          className={cn(
            "relative pb-1 font-normal transition-colors cursor-pointer",
            filterNature === "all"
              ? "text-[#141413]"
              : "text-[#78716C] hover:text-[#141413]",
          )}
        >
          <span>全部</span>
          {totalCount > 0 && (
            <span className="ml-1 text-[12px] text-[#78716C] tabular-nums">
              ({totalCount})
            </span>
          )}
          {filterNature === "all" && (
            <motion.div
              layoutId="approvalFilterUnderline"
              className="absolute bottom-0 inset-x-0 h-[2px] bg-[#141413] rounded-full"
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setFilterNature("leave");
            setFocusedCardIndex(0);
          }}
          className={cn(
            "relative pb-1 font-normal transition-colors cursor-pointer",
            filterNature === "leave"
              ? "text-[#141413]"
              : "text-[#78716C] hover:text-[#141413]",
          )}
        >
          <span>请假</span>
          {leaveCount > 0 && (
            <span className="ml-1 text-[12px] text-[#78716C] tabular-nums">
              ({leaveCount})
            </span>
          )}
          {filterNature === "leave" && (
            <motion.div
              layoutId="approvalFilterUnderline"
              className="absolute bottom-0 inset-x-0 h-[2px] bg-[#141413] rounded-full"
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setFilterNature("waive");
            setFocusedCardIndex(0);
          }}
          className={cn(
            "relative pb-1 font-normal transition-colors cursor-pointer",
            filterNature === "waive"
              ? "text-[#141413]"
              : "text-[#78716C] hover:text-[#141413]",
          )}
        >
          <span>特殊豁免</span>
          {waiveCount > 0 && (
            <span className="ml-1 text-[12px] text-[#78716C] tabular-nums">
              ({waiveCount})
            </span>
          )}
          {filterNature === "waive" && (
            <motion.div
              layoutId="approvalFilterUnderline"
              className="absolute bottom-0 inset-x-0 h-[2px] bg-[#141413] rounded-full"
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setFilterNature("appeal");
            setFocusedCardIndex(0);
          }}
          className={cn(
            "relative pb-1 font-normal transition-colors cursor-pointer",
            filterNature === "appeal"
              ? "text-[#141413]"
              : "text-[#78716C] hover:text-[#141413]",
          )}
        >
          <span>补交申诉</span>
          {appealCount > 0 && (
            <span className="ml-1 text-[12px] text-[#78716C] tabular-nums">
              ({appealCount})
            </span>
          )}
          {filterNature === "appeal" && (
            <motion.div
              layoutId="approvalFilterUnderline"
              className="absolute bottom-0 inset-x-0 h-[2px] bg-[#141413] rounded-full"
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setFilterNature("todo");
            setFocusedCardIndex(0);
          }}
          className={cn(
            "relative pb-1 font-normal transition-colors cursor-pointer",
            filterNature === "todo"
              ? "text-[#141413]"
              : "text-[#78716C] hover:text-[#141413]",
          )}
        >
          <span>团队待办与权限</span>
          {todoCount > 0 && (
            <span className="ml-1 text-[12px] text-[#78716C] tabular-nums">
              ({todoCount})
            </span>
          )}
          {filterNature === "todo" && (
            <motion.div
              layoutId="approvalFilterUnderline"
              className="absolute bottom-0 inset-x-0 h-[2px] bg-[#141413] rounded-full"
            />
          )}
        </button>
      </div>

      <div className="flex items-center gap-3">
        {approvalCardsCount > 1 && (
          <button
            type="button"
            onClick={handleApproveAll}
            className="inline-flex items-center gap-1 rounded-md bg-[#D97757]/10 hover:bg-[#D97757]/15 text-[#D97757] px-2.5 py-1 text-[12px] font-normal transition-all active:scale-[0.98] cursor-pointer"
          >
            <Check className="size-3 stroke-[2.2]" />
            <span>一键全部同意 ({approvalCardsCount})</span>
          </button>
        )}
        <div className="text-[12px] text-[#78716C] tabular-nums">
          共 {pendingApprovals.length} 份明细
        </div>
      </div>
    </div>

    {displayError && (
      <div className="flex items-center justify-between gap-2 rounded-md border border-status-danger/20 bg-status-danger/[0.04] p-3 text-[12px] text-status-danger">
        <span className="inline-flex items-center gap-2">
          <TriangleAlert className="size-4 shrink-0" />
          <span>{displayError}</span>
        </span>
        <button
          type="button"
          onClick={() => void fetchApprovals()}
          className="rounded-md px-2 py-1 font-normal hover:bg-status-danger/10 transition-colors cursor-pointer"
        >
          重试
        </button>
      </div>
    )}

    {/* Loading State */}
    {(approvalsLoading || actionsLoading) && pendingApprovals.length === 0 && todoItems.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Loader2 className="size-5 animate-spin text-[#D97757] mb-2" />
        <p className="text-[13px] text-[#78716C]">正在同步工作台事项...</p>
      </div>
    ) : visibleCards.length === 0 ? (
      <EmptyState
        variant="compact"
        title={
          filterNature === "todo"
            ? "待办已全部完成"
            : filterNature !== "all"
              ? "当前筛选下无匹配记录"
              : "所有事项已阅毕"
        }
        description={
          filterNature === "todo"
            ? "当前没有需要跟进的权限申请或系统风险事项。"
            : filterNature !== "all"
              ? "可切换筛选条件查看其他申请与事项。"
              : "团队请假、豁免、补交申诉与待办事项均已处理完成。"
        }
      />
    ) : (
      /* Unified Cards List */
      <motion.div layout className="space-y-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {visibleCards.map((card, index) => {
            const isFocused = focusedCardIndex === index;

            if (card.type === "todo") {
              return (
                <TodoItemCard
                  key={card.todo.id}
                  todo={card.todo}
                  isProcessing={Boolean(todoProcessingId === card.todo.id)}
                  onToggleTodo={handleToggleTodo}
                  relativeTime={relativeTime}
                  onMarkRead={markTodoRead}
                  onOpenChange={onOpenChange}
                />
              );
            }

            if (card.type === "appeal") {
              const isRejectOpen = activeFeedbackKey === `appeal-reject-${card.appeal.id}`;
              return (
                <FulfillmentAppealCard
                  key={card.id}
                  appeal={card.appeal}
                  index={index}
                  isFocused={isFocused}
                  isProcessing={Boolean(actionProcessing?.id === card.appeal.id)}
                  isRejectOpen={isRejectOpen}
                  onFocus={() => setFocusedCardIndex(index)}
                  onApprove={() => scheduleAppealReviewWithUndo(card.appeal, "approved")}
                  onToggleReject={() => toggleAppealReject(card.appeal.id)}
                  onConfirmReject={(reason) => {
                    setActiveFeedbackKey(null);
                    scheduleAppealReviewWithUndo(card.appeal, "rejected", reason);
                  }}
                  onCloseReject={() => setActiveFeedbackKey(null)}
                />
              );
            }

            return (
              <ExemptionApprovalCard
                key={card.group.groupKey}
                group={card.group}
                index={index}
                isFocused={isFocused}
                activeFeedbackKey={activeFeedbackKey}
                activeFeedbackConfig={activeFeedbackConfig}
                onFocus={() => setFocusedCardIndex(index)}
                onGroupAction={handleGroupAction}
                onDailyAction={handleDailyAction}
                onCloseFeedback={() => setActiveFeedbackKey(null)}
              />
            );
          })}
        </AnimatePresence>

        {/* Completed Session List */}
        {completedSessionIds.length > 0 && (
          <div className="pt-2 border-t border-[#E2E2DF]/60">
            <div className="text-[12px] font-normal text-[#78716C] mb-1.5">
              本次已处理 ({completedSessionIds.length})
            </div>
            <div className="space-y-1 opacity-70">
              {completedSessionIds.map((id) => (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 bg-[#F1F1F0]/60 border border-[#E2E2DF]/60"
                >
                  <span className="text-status-success shrink-0">
                    <CheckCircle2 className="size-3.5 stroke-[2]" />
                  </span>
                  <span className="text-[12px] text-[#78716C] line-through truncate flex-1">
                    {completedSessionTitles[id] || "完成事项"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    )}
  </div>
)}

{/* 2. NON-ADMIN VIEW (非管理员个人待办视图) */}
{activeTab === "approvals" && !isAdmin && (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-3 min-h-[36px] pb-2 border-b border-[#E2E2DF]/60">
      <div className="flex items-center gap-2 text-[13px] font-normal text-[#141413]">
        <span>待办事项</span>
      </div>
      <div className="text-[12px] text-[#78716C] tabular-nums">
        共 {todoItems.length} 项待跟进
      </div>
    </div>

    {todoItems.length === 0 ? (
      <EmptyState
        variant="compact"
        title="待办已全部完成"
        description="当前没有需要跟进的待办事项。"
      />
    ) : (
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {todoItems.map((todo) => (
            <TodoItemCard
              key={todo.id}
              todo={todo}
              isProcessing={Boolean(todoProcessingId === todo.id)}
              onToggleTodo={handleToggleTodo}
              relativeTime={relativeTime}
              onMarkRead={markTodoRead}
              onOpenChange={onOpenChange}
            />
          ))}
        </AnimatePresence>

        {completedSessionIds.length > 0 && (
          <div className="pt-2 border-t border-[#E2E2DF]/60">
            <div className="text-[12px] font-normal text-[#78716C] mb-1.5">
              本次已处理 ({completedSessionIds.length})
            </div>
            <div className="space-y-1 opacity-70">
              {completedSessionIds.map((id) => (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 bg-[#F1F1F0]/60 border border-[#E2E2DF]/60"
                >
                  <span className="text-status-success shrink-0">
                    <CheckCircle2 className="size-3.5 stroke-[2]" />
                  </span>
                  <span className="text-[12px] text-[#78716C] line-through truncate flex-1">
                    {completedSessionTitles[id] || "完成事项"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )}
  </div>
)}
    </>
  );
}
