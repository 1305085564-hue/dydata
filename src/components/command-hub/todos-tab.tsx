"use client";

import { ArrowRight, CheckCircle2, Circle, Loader2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemHeading } from "@/components/ui/item-heading";
import type { TodoTabProps } from "@/lib/command-hub/types";

export function TodosTab({
  activeTab,
  todoTabCount,
  summaryError,
  onRefreshSummary,
  actionsLoading,
  todoItems,
  todoProcessingId,
  handleToggleTodo,
  relativeTime,
  completedSessionIds,
  completedSessionTitles,
  markTodoRead,
  onOpenChange,
}: TodoTabProps) {
  return (
    <>
{/* 2. TODOS TAB (待办区域) */}
{activeTab === "todos" && (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-3 min-h-[36px] pb-2 border-b border-[#E2E2DF]/60">
      <div className="flex items-center gap-2 text-[13px] font-normal text-[#141413]">
        <span>团队待办事项</span>
        <span className="text-[12px] text-[#78716C] font-normal">（自动同步系统风险与权限申请）</span>
      </div>
      <div className="text-[12px] text-[#78716C] tabular-nums">
        共 {todoTabCount} 项待跟进
      </div>
    </div>

    {summaryError && (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-status-warning/20 bg-status-warning/[0.05] p-3 text-[12px] text-status-warning">
        <span className="inline-flex items-center gap-2">
          <TriangleAlert className="size-4 shrink-0" />
          <span>{summaryError}</span>
        </span>
        <button
          type="button"
          onClick={() => void onRefreshSummary?.()}
          className="rounded-md px-2 py-1 font-normal hover:bg-status-warning/10 transition-colors cursor-pointer"
        >
          重试
        </button>
      </div>
    )}

    {actionsLoading && todoItems.length === 0 ? (
      <EmptyState
        variant="compact"
        className="animate-pulse"
        title="正在同步待办事项..."
      />
    ) : todoItems.length === 0 ? (
      <EmptyState
        variant="compact"
        title="待办已全部完成"
        description="当前没有需要跟进的权限申请或系统风险事项。"
      />
    ) : (
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {todoItems.map((todo) => {
            const isCritical = todo.priority === "P0";
            const isWarning = todo.priority === "P1";
            const canMarkDone = todo.source !== "exemption";
            const isProcessing = todoProcessingId === todo.id;

            return (
              <motion.div
                key={todo.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0, padding: 0 }}
              >
                <Card className=" p-4 sm:p-4.5 flex flex-row items-start gap-3 transition-all">
                {canMarkDone ? (
                  <button
                    type="button"
                    onClick={() => void handleToggleTodo(todo)}
                    disabled={Boolean(todoProcessingId)}
                    aria-label={`完成待办：${todo.title}`}
                    className="mt-0.5 shrink-0 text-[#78716C] hover:text-[#D97757] transition-colors cursor-pointer"
                  >
                    {isProcessing ? (
                      <Loader2 className="size-4 animate-spin text-[#D97757]" />
                    ) : (
                      <Circle className="size-4 stroke-[1.8]" />
                    )}
                  </button>
                ) : (
                  <div className="mt-0.5 size-4 text-status-warning shrink-0">
                    <TriangleAlert className="size-4" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[12px] font-normal tracking-wide",
                        isCritical
                          ? "bg-status-danger/10 text-status-danger"
                          : isWarning
                            ? "bg-status-warning/10 text-status-warning"
                            : "bg-[#F1F1F0] text-[#78716C]",
                      )}
                    >
                      {isCritical ? "P0 紧急" : isWarning ? "P1 待跟进" : "P2 常规"}
                    </span>
                    <span className="text-[12px] text-[#78716C] tabular-nums">
                      {relativeTime(todo.createdAt)}
                    </span>
                  </div>

                  <ItemHeading as="h4" className="mt-1">
                    {todo.title}
                  </ItemHeading>
                  {todo.description && (
                    <p className="text-[12px] text-[#78716C] mt-0.5 leading-relaxed">
                      {todo.description}
                    </p>
                  )}

                  {todo.actionUrl && (
                    <div className="mt-2.5 flex justify-end">
                      <Link
                        href={todo.actionUrl}
                        onClick={() => {
                          if (todo.source !== "exemption") markTodoRead(todo.id);
                          onOpenChange(false);
                        }}
                        className="inline-flex h-6.5 items-center gap-1 rounded-md bg-[#F1F1F0] hover:bg-[#EBEBE9] px-2.5 text-[12px] font-normal text-[#1F1E1D] transition-colors"
                      >
                        <span>{todo.actionLabel}</span>
                        <ArrowRight className="size-3 text-[#78716C]" />
                      </Link>
                    </div>
                  )}
                </div>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    )}

    {/* Completed List */}
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
    </>
  );
}
