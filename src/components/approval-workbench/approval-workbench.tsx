"use client";

/**
 * 审批工作台（导航栏铃铛打开）。
 * 一页一问：「还有几件等我拍板？」——标题就是答案；
 * 「等你批」一批就完，「等你处理」要跳去别处；撤回固定在底栏，列表不跳。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { ActionItem } from "@/lib/action-center/types";
import { markNotificationRead } from "@/lib/command-hub/data/approval-api";
import {
  getAppealTodoId,
  getApproveAllDescription,
  getFocusableElements,
  getRelativeTime,
  getTodoIsCompletable,
  getWorkbenchHeadline,
  sameSortedIds,
} from "@/lib/command-hub/domain/workbench-rules";
import type { ApprovalQueueItem, ApprovalWorkbenchProps } from "@/lib/command-hub/types";
import { HistoryList } from "./history-list";
import { LoadError } from "./load-error";
import { QueueItem, type RejectScope } from "./queue-item";
import { TodoRow } from "./todo-row";
import { useApprovalReview } from "./use-approval-review";

type Row = { type: "queue"; item: ApprovalQueueItem } | { type: "todo"; todo: ActionItem };

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between px-4">
      <span className="text-[12px] tabular-nums text-[#78716C]">{children}</span>
      {action}
    </div>
  );
}

export function ApprovalWorkbench({
  open,
  onOpenChange,
  activeTab,
  onTabChange,
  isAdmin,
  summary,
  summaryLoading = false,
  summaryError = null,
  onRefreshSummary,
  onActionCenterChanged,
}: ApprovalWorkbenchProps) {
  const view: "queue" | "history" = activeTab === "history" && isAdmin ? "history" : "queue";
  const review = useApprovalReview({ open, isAdmin, view, summary, onActionCenterChanged });
  const { queue, todos } = review;

  const [now] = useState(() => Date.now());
  const [focusIndex, setFocusIndex] = useState(0);
  const [rejecting, setRejecting] = useState<RejectScope | null>(null);
  const [approveAllSnapshot, setApproveAllSnapshot] = useState<ApprovalQueueItem[] | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const rows = useMemo<Row[]>(
    () => [
      ...(isAdmin ? queue.map((item) => ({ type: "queue" as const, item })) : []),
      ...todos.map((todo) => ({ type: "todo" as const, todo })),
    ],
    [isAdmin, queue, todos],
  );
  const focused = rows.length > 0 ? Math.min(focusIndex, rows.length - 1) : -1;

  const headline = getWorkbenchHeadline({
    isAdmin,
    view,
    approvalCount: queue.length,
    todoCount: todos.length,
    loading: review.pendingLoading || (summaryLoading && summary === null),
  });

  // 入口指定 "todos" 时焦点落到待办第一条；重开面板焦点回到第一行，不沿用上次位置；关闭时收起正在写的拒绝原因（渲染期同步，不走 effect）
  const [prevEntry, setPrevEntry] = useState({ open, activeTab });
  if (prevEntry.open !== open || prevEntry.activeTab !== activeTab) {
    setPrevEntry({ open, activeTab });
    if (!open) setRejecting(null);
    if (open && !prevEntry.open) setFocusIndex(activeTab === "todos" ? queue.length : 0);
    else if (activeTab === "todos") setFocusIndex(isAdmin ? queue.length : 0);
  }

  const scrollRowIntoView = (index: number) => {
    document.getElementById(`approval-row-${index}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const startReject = useCallback((item: ApprovalQueueItem, dateStr?: string) => {
    setRejecting((current) =>
      current?.itemId === item.id && current.dateStr === dateStr ? null : { itemId: item.id, dateStr },
    );
  }, []);

  const confirmReject = (item: ApprovalQueueItem, reason: string) => {
    const scope = rejecting;
    setRejecting(null);
    if (item.kind === "appeal") {
      review.reviewAppeal(item.appeal, "rejected", reason);
      return;
    }
    const day = scope?.dateStr ? item.group.dailyItems.find((d) => d.dateStr === scope.dateStr) : null;
    if (day) review.reviewDay(item.group, day, "rejected", reason);
    else review.reviewGroup(item.group, "rejected", reason);
  };

  const approve = useCallback((item: ApprovalQueueItem) => {
    setRejecting(null);
    if (item.kind === "appeal") review.reviewAppeal(item.appeal, "approved");
    else review.reviewGroup(item.group, "approved");
  }, [review]);

  const confirmApproveAll = () => {
    const snapshot = approveAllSnapshot;
    setApproveAllSnapshot(null);
    if (!snapshot) return;
    if (!sameSortedIds(snapshot.map((i) => i.id), queue.map((i) => i.id))) {
      toast.error("待批的申请刚有变化，请重新确认");
      void review.loadPending();
      return;
    }
    review.approveItems(snapshot);
  };

  const reviewAppealTodo = async (todo: ActionItem) => {
    const appealId = getAppealTodoId(todo);
    await review.loadPending();
    if (appealId) toast.info("已刷新；如果它没出现在「等你批」里，说明已经被处理过了");
  };

  const navigateFromTodo = (todo: ActionItem) => {
    // 跳去处理时顺手标已读；失败不打扰，下次摘要刷新会回到未读
    if (getTodoIsCompletable(todo)) markNotificationRead(todo.id);
    onOpenChange(false);
  };

  const latestUndo = review.undoList[review.undoList.length - 1];

  // ---------- 键盘 ----------
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (approveAllSnapshot) return;
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;

      if (e.key === "Tab") {
        const modal = modalRef.current;
        const focusable = modal ? getFocusableElements(modal) : [];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (document.activeElement === modal || (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
        return;
      }
      if (e.key === "Escape") {
        if (rejecting) setRejecting(null);
        else onOpenChange(false);
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && latestUndo) {
        e.preventDefault();
        review.undo(latestUndo.id);
        return;
      }
      if (view !== "queue" || rows.length === 0) return;
      if (key === "j" || e.key === "ArrowDown" || key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const down = key === "j" || e.key === "ArrowDown";
        const next = Math.max(0, Math.min(rows.length - 1, focused + (down ? 1 : -1)));
        setFocusIndex(next);
        scrollRowIntoView(next);
        return;
      }
      const row = rows[focused];
      if (!row) return;
      if (row.type === "queue") {
        if (key === "a") {
          e.preventDefault();
          approve(row.item);
        } else if (key === "r") {
          e.preventDefault();
          startReject(row.item);
        }
      } else if ((key === "a" || key === "d") && getTodoIsCompletable(row.todo)) {
        e.preventDefault();
        void review.completeTodo(row.todo);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [approve, approveAllSnapshot, focused, latestUndo, onOpenChange, open, rejecting, review, rows, startReject, view]);

  // 面板打开时锁住背景滚动：根元素与 body 一起锁（只锁 body 依赖浏览器向视口传播，实测不可靠）
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prevRoot = root.style.overflow;
    const prevBody = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      root.style.overflow = prevRoot;
      document.body.style.overflow = prevBody;
    };
  }, [open]);

  // 打开时把焦点放进面板，关闭时还给触发按钮
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const timer = window.setTimeout(() => modalRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, [open]);

  const loadError = review.pendingError || summaryError;
  const showEmpty = rows.length === 0 && !review.pendingLoading && !(summaryLoading && summary === null) && !loadError;

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-3 sm:p-4 md:p-6">
            <motion.div
              data-slot="approval-workbench-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => onOpenChange(false)}
              className="fixed inset-0 bg-[#141413]/12 backdrop-blur-[2px]"
            />
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="command-hub-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.985, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.985, y: 6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 flex h-[min(580px,calc(100dvh-var(--app-top-offset,64px)-1rem))] max-h-[min(580px,calc(100dvh-var(--app-top-offset,64px)-1rem))] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#E2E2DF] bg-white shadow-claude-dialog outline-none sm:h-[min(720px,calc(100dvh-var(--app-top-offset,64px)-1rem))] sm:max-h-[min(720px,calc(100dvh-var(--app-top-offset,64px)-1rem))] sm:w-[min(760px,calc(100vw-2rem))]"
            >
              {/* 页头：标题就是答案 */}
              <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-3 pt-5">
                <h2 id="command-hub-title" className="text-[20px] leading-[1.3] text-[#141413]" aria-live="polite">
                  {headline}
                </h2>
                <div className="flex shrink-0 items-center gap-1">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setRejecting(null);
                        onTabChange(view === "history" ? "approvals" : "history");
                      }}
                      className="h-7 cursor-pointer rounded-md px-3 text-[14px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413]"
                    >
                      {view === "history" ? "返回待批" : "已处理记录"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="关闭工作台"
                    className="flex size-7 cursor-pointer items-center justify-center rounded-md text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413]"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
                {view === "history" ? (
                  <HistoryList
                    items={review.history}
                    loading={review.historyLoading}
                    error={review.historyError}
                    reopeningId={review.reopeningId}
                    onRetry={() => void review.loadHistory()}
                    onReopen={(item) => void review.reopen(item)}
                  />
                ) : (
                  <div className="space-y-5">
                    {loadError && (
                      <div className="px-4">
                        <LoadError
                          message={loadError}
                          onRetry={() => {
                            void review.loadPending();
                            void onRefreshSummary?.();
                          }}
                        />
                      </div>
                    )}

                    {isAdmin && queue.length > 0 && (
                      <section>
                        <SectionLabel
                          action={
                            queue.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => setApproveAllSnapshot(queue)}
                                className="h-6 cursor-pointer rounded-md px-2 text-[12px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413]"
                              >
                                全部同意
                              </button>
                            ) : undefined
                          }
                        >
                          等你批 · {queue.length}
                        </SectionLabel>
                        <div className="space-y-1">
                          <AnimatePresence initial={false}>
                            {queue.map((item, index) => (
                              <QueueItem
                                key={item.id}
                                item={item}
                                index={index}
                                focused={focused === index}
                                rejecting={rejecting}
                                onFocus={() => setFocusIndex(index)}
                                onApprove={() => approve(item)}
                                onStartReject={(dateStr) => startReject(item, dateStr)}
                                onConfirmReject={(reason) => confirmReject(item, reason)}
                                onCancelReject={() => setRejecting(null)}
                                onApproveDay={(daily) => {
                                  if (item.kind === "exemption") review.reviewDay(item.group, daily, "approved");
                                }}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      </section>
                    )}

                    {todos.length > 0 && (
                      <section>
                        <SectionLabel>{isAdmin ? `等你处理 · ${todos.length}` : `待办 · ${todos.length}`}</SectionLabel>
                        <div className="space-y-1">
                          <AnimatePresence initial={false}>
                            {todos.map((todo, i) => {
                              const index = (isAdmin ? queue.length : 0) + i;
                              return (
                                <TodoRow
                                  key={todo.id}
                                  todo={todo}
                                  index={index}
                                  focused={focused === index}
                                  processing={review.todoProcessingId === todo.id}
                                  relativeTime={getRelativeTime(todo.createdAt, now)}
                                  onFocus={() => setFocusIndex(index)}
                                  onComplete={() => void review.completeTodo(todo)}
                                  onNavigate={() => navigateFromTodo(todo)}
                                  onReviewAppeal={() => void reviewAppealTodo(todo)}
                                />
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      </section>
                    )}

                    {showEmpty && (
                      <EmptyState
                        variant="compact"
                        title={isAdmin ? "新的申请和待办会出现在这里" : "有新待办会出现在这里"}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* 底栏固定高度：有撤回时显示撤回，没有时显示快捷键；切换不改变列表位置 */}
              {isAdmin && (
                <div
                  onMouseEnter={latestUndo ? review.pauseUndo : undefined}
                  onMouseLeave={review.resumeUndo}
                  className="flex h-11 shrink-0 items-center justify-between gap-3 border-t border-[#E2E2DF] px-6 text-[12px]"
                >
                  {latestUndo ? (
                    <>
                      <span className="min-w-0 truncate text-[#1F1E1D]">
                        {latestUndo.action === "approved" ? "已同意" : "已拒绝"} {latestUndo.title}
                        {review.undoList.length > 1 && (
                          <span className="text-[#78716C]">（另有 {review.undoList.length - 1} 条可撤回）</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => review.undo(latestUndo.id)}
                        className="h-6 shrink-0 cursor-pointer rounded-md border border-[#E2E2DF] bg-white px-2 text-[12px] tabular-nums text-[#1F1E1D] shadow-input transition-colors hover:bg-[#EBEBE9]"
                      >
                        撤回 {latestUndo.remainingSeconds}s
                      </button>
                    </>
                  ) : (
                    <span className="hidden text-[#78716C] sm:inline">
                      ↑↓ 选择 · A 同意 · R 拒绝 · Z 撤回 · Esc 关闭
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ConfirmDialog
        open={Boolean(approveAllSnapshot)}
        title="同意全部待批申请？"
        description={approveAllSnapshot ? getApproveAllDescription(approveAllSnapshot) : undefined}
        confirmText="全部同意"
        onConfirm={confirmApproveAll}
        onOpenChange={(next) => {
          if (!next) setApproveAllSnapshot(null);
        }}
      />
    </>
  );
}
