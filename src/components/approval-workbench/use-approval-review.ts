"use client";

/**
 * 审批工作台的审批逻辑（无界面）。
 * 撤回缓冲、失败放回、关页补发、逐日乐观更新这几段是线上踩过坑后修出来的，
 * 改动前先读对应注释，别为了界面方便简化掉。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ActionCenterSummary, ActionItem } from "@/lib/action-center/types";
import {
  groupPendingApprovals,
  resolveApprovalRequestId,
  restoreApprovalItems,
  type DailyApprovalDetail,
  type ExemptionRequest,
  type GroupedApprovalItem,
} from "@/lib/exemption-approvals";
import {
  dispatchFulfillmentDataChanged,
  FULFILLMENT_DATA_CHANGED_EVENT,
  type FulfillmentDataChangedDetail,
} from "@/lib/fulfillment-sync";
import {
  fetchHistoryApprovals,
  fetchPendingApprovals,
  markNotificationDone,
  reopenExemptionRequest,
  reopenFulfillmentAppeal,
  reviewExemptionRequest,
  reviewFulfillmentAppeal,
} from "@/lib/command-hub/data/approval-api";
import {
  buildApprovalQueue,
  getAppealId,
  getAppealTodoId,
  getTodoItems,
  splitApprovalItems,
} from "@/lib/command-hub/domain/workbench-rules";
import type { ApprovalQueueItem, ReviewAction } from "@/lib/command-hub/types";
import { useApprovalUndoQueue, type UndoEntry } from "./use-approval-undo-queue";

function natureName(nature: "leave" | "waive") {
  return nature === "leave" ? "请假" : "免交";
}

function withoutRequestIds(ids: string[]) {
  const idSet = new Set(ids);
  return (current: ExemptionRequest[]) =>
    current.filter((item) => {
      const reqId = resolveApprovalRequestId(item);
      return !reqId || !idSet.has(reqId);
    });
}

export function useApprovalReview({
  open,
  isAdmin,
  view,
  summary,
  onActionCenterChanged,
}: {
  open: boolean;
  isAdmin: boolean;
  view: "queue" | "history";
  summary: ActionCenterSummary | null;
  onActionCenterChanged?: () => void;
}) {
  const [pending, setPending] = useState<ExemptionRequest[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [history, setHistory] = useState<ExemptionRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [completedTodoIds, setCompletedTodoIds] = useState<string[]>([]);
  const [todoProcessingId, setTodoProcessingId] = useState<string | null>(null);

  // ---------- 拉数据 ----------

  const loadPending = useCallback(async () => {
    if (!isAdmin) return;
    setPendingLoading(true);
    setPendingError(null);
    try {
      setPending(await fetchPendingApprovals());
    } catch (err) {
      console.error("Failed to fetch approvals:", err);
      setPendingError("审批列表没能同步");
    } finally {
      setPendingLoading(false);
    }
  }, [isAdmin]);

  const loadHistory = useCallback(async () => {
    if (!isAdmin) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await fetchHistoryApprovals());
    } catch (err) {
      console.error("Failed to fetch history approvals:", err);
      setHistoryError("已处理记录没能同步");
    } finally {
      setHistoryLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setPending([]);
      setHistory([]);
      return;
    }
    if (!open) return;
    if (view === "history") void loadHistory();
    else void loadPending();
  }, [isAdmin, loadHistory, loadPending, open, view]);

  // 发布管理日历里改了审批，这里同步刷新
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<FulfillmentDataChangedDetail>).detail;
      if (detail?.source === "fulfillment-calendar") {
        void loadPending();
        void loadHistory();
      }
    };
    window.addEventListener(FULFILLMENT_DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(FULFILLMENT_DATA_CHANGED_EVENT, handler);
  }, [loadHistory, loadPending]);

  // ---------- 派生 ----------

  const { exemptionItems, appealItems } = useMemo(() => splitApprovalItems(pending), [pending]);
  const groups = useMemo(() => groupPendingApprovals(exemptionItems), [exemptionItems]);
  const queue = useMemo(() => buildApprovalQueue(groups, appealItems), [groups, appealItems]);
  const queuedAppealIds = useMemo(() => appealItems.map(getAppealId), [appealItems]);
  const todos = useMemo(
    () => getTodoItems(summary, completedTodoIds, isAdmin ? queuedAppealIds : []),
    [completedTodoIds, isAdmin, queuedAppealIds, summary],
  );

  // 补交提醒跟着审批决定走：决定一下就本地收起（服务端要到撤回窗口结束才自动关它），撤回或失败时放回
  const releaseSuppressedTodos = useCallback((ids: string[] | undefined) => {
    if (!ids?.length) return;
    const released = new Set(ids);
    setCompletedTodoIds((prev) => prev.filter((id) => !released.has(id)));
  }, []);

  // ---------- 真正提交（撤回窗口结束后） ----------

  const commitExemption = useCallback(async (entry: UndoEntry) => {
    const results = await Promise.all(
      entry.requestIds.map((requestId) =>
        reviewExemptionRequest(requestId, entry.action, entry.feedback, entry.dates),
      ),
    );
    const successIds = results.filter((r) => r.ok).map((r) => r.requestId);
    const failed = results.filter((r) => !r.ok);

    if (successIds.length > 0) {
      dispatchFulfillmentDataChanged({ source: "command-hub", requestIds: successIds });
      onActionCenterChanged?.();
    }
    if (failed.length === 0) return;

    // 失败的申请放回待批列表，不能让管理员以为已经批完
    const failedIds = new Set(failed.map((r) => r.requestId));
    const toRestore = entry.originalItems.filter((item) => {
      const reqId = resolveApprovalRequestId(item);
      return reqId ? failedIds.has(reqId) : false;
    });
    if (toRestore.length > 0) {
      setPending((current) => [...restoreApprovalItems(current, toRestore), ...current]);
    }
    const first = failed[0];
    const isNetwork = first.status === 0 || first.status >= 500;
    toast.error("审批没能保存，已放回待批", {
      description: isNetwork
        ? `「${entry.title}」网络异常，请重新操作`
        : `「${entry.title}」${first.message || "审批失败"}，请刷新后重试`,
    });
  }, [onActionCenterChanged]);

  const commitAppeal = useCallback(async (entry: UndoEntry) => {
    const appealId = entry.requestIds[0];
    const original = entry.originalItems[0];
    try {
      const result = await reviewFulfillmentAppeal(appealId, entry.action, entry.feedback);
      if (!result.ok) {
        setPending((current) => [original, ...current]);
        releaseSuppressedTodos(entry.suppressedTodoIds);
        toast.error("审批没能保存，已放回待批", { description: result.error || "网络异常，请刷新后重试" });
        return;
      }
      if (entry.action === "approved") {
        if (result.autoResumeStatus === "succeeded") toast.success("已批准，数据已自动提交");
        else if (result.autoResumeStatus === "failed") toast.success("已批准，数据未写入，等成员补传");
      }
      dispatchFulfillmentDataChanged({ source: "command-hub", requestIds: [appealId] });
      onActionCenterChanged?.();
    } catch {
      setPending((current) => [original, ...current]);
      releaseSuppressedTodos(entry.suppressedTodoIds);
      toast.error("审批没能保存，已放回待批", { description: "网络连接异常，请重试" });
    }
  }, [onActionCenterChanged, releaseSuppressedTodos]);

  // ---------- 撤回缓冲 ----------

  const handleUndoExpire = useCallback((queued: UndoEntry) => {
    void (queued.source === "fulfillment_appeal" ? commitAppeal(queued) : commitExemption(queued));
  }, [commitAppeal, commitExemption]);

  const {
    undoList,
    pauseUndo,
    resumeUndo,
    schedule,
    takeUndoEntry,
  } = useApprovalUndoQueue({ open, onExpire: handleUndoExpire });

  const undo = useCallback((undoId: string) => {
    const entry = takeUndoEntry(undoId);
    if (!entry) return;
    setPending((current) =>
      entry.source === "fulfillment_appeal"
        ? [...entry.originalItems, ...current]
        : [...restoreApprovalItems(current, entry.originalItems), ...current],
    );
    releaseSuppressedTodos(entry.suppressedTodoIds);
    toast.success(`已撤回：${entry.title}`);
  }, [releaseSuppressedTodos, takeUndoEntry]);

  // ---------- 审批动作 ----------

  /** 整组审批：只处理还没审的日期（后端在不传日期时只动 pending 日） */
  const reviewGroup = useCallback((group: GroupedApprovalItem, action: ReviewAction, feedback?: string) => {
    if (group.requestIds.length === 0) {
      toast.error("申请编号无效，刷新后再试");
      return;
    }
    setPending(withoutRequestIds(group.requestIds));
    schedule({
      title: `${group.applicant_name}的${natureName(group.nature)}`,
      requestIds: group.requestIds,
      action,
      originalItems: group.items,
      feedback: feedback || undefined,
      source: "exemption",
    });
  }, [schedule]);

  /**
   * 单日审批的乐观更新：只改该日状态，整单状态按后端聚合口径推导
   * （仍有 pending 日期则保持 pending；全部处理完时有任何 rejected 即为 rejected），
   * 避免单日操作把整单状态污染成已结单。历史单原本无逐日明细，保持 pending。
   */
  const reviewDay = useCallback((group: GroupedApprovalItem, daily: DailyApprovalDetail, action: ReviewAction, feedback?: string) => {
    const requestId = daily.originalRequestId;
    const target = group.items.find((item) => resolveApprovalRequestId(item) === requestId) || group.items[0];
    const nowIso = new Date().toISOString();
    setPending((prev) =>
      prev.map((item) => {
        if (resolveApprovalRequestId(item) !== requestId) return item;
        const daily0 = item.daily_items ?? [];
        const exists = daily0.some((d) => d.request_date === daily.dateStr);
        const nextDaily = exists
          ? daily0.map((d) => (d.request_date === daily.dateStr ? { ...d, status: action, feedback: feedback ?? null, reviewed_at: nowIso } : d))
          : [
              ...daily0,
              {
                id: `${requestId}-${daily.dateStr}`,
                request_id: requestId,
                request_date: daily.dateStr,
                reason: item.reason ?? null,
                status: action,
                feedback: feedback ?? null,
                reviewed_by: null,
                reviewed_at: nowIso,
              },
            ];
        const remaining = nextDaily.filter((d) => d.status === "pending").length;
        const nextStatus: ExemptionRequest["request_status"] = daily0.length === 0
          ? item.request_status
          : remaining > 0
            ? "pending"
            : nextDaily.some((d) => d.status === "rejected") ? "rejected" : "approved";
        return { ...item, daily_items: nextDaily, request_status: nextStatus };
      }),
    );
    schedule({
      title: `${group.applicant_name} ${daily.dateDisplay}的${natureName(group.nature)}`,
      requestIds: [requestId],
      action,
      originalItems: target ? [target] : [],
      feedback: feedback || undefined,
      dates: [daily.dateStr],
      source: "exemption",
    });
  }, [schedule]);

  const reviewAppeal = useCallback((appeal: ExemptionRequest, action: ReviewAction, reason?: string) => {
    const appealId = getAppealId(appeal);
    if (!appealId) return;
    // 从原始摘要收提醒：队列去重已把它挡在 todos 外，批准那一刻 todos 里找不到它
    const suppressedTodoIds = (summary?.topItems ?? [])
      .filter((todo) => getAppealTodoId(todo) === appealId && !completedTodoIds.includes(todo.id))
      .map((todo) => todo.id);
    setPending((current) => current.filter((item) => getAppealId(item) !== appealId));
    if (suppressedTodoIds.length > 0) setCompletedTodoIds((prev) => [...prev, ...suppressedTodoIds]);
    schedule({
      title: `${appeal.applicant_name || "成员"}的${appeal.appeal_type || ""}补交`,
      requestIds: [appealId],
      action,
      originalItems: [appeal],
      feedback: reason || undefined,
      source: "fulfillment_appeal",
      suppressedTodoIds,
    });
  }, [completedTodoIds, schedule, summary]);

  const approveItems = useCallback((items: readonly ApprovalQueueItem[]) => {
    for (const item of items) {
      if (item.kind === "exemption") reviewGroup(item.group, "approved");
      else reviewAppeal(item.appeal, "approved");
    }
  }, [reviewAppeal, reviewGroup]);

  // ---------- 已处理记录：打回重审 ----------

  const reopen = useCallback(async (item: ExemptionRequest) => {
    const isAppeal = item.source === "fulfillment_appeal";
    const id = isAppeal ? getAppealId(item) : resolveApprovalRequestId(item);
    if (!id) return;
    setReopeningId(id);
    try {
      const result = isAppeal ? await reopenFulfillmentAppeal(id) : await reopenExemptionRequest(id);
      if (!result.ok) {
        toast.error("没能打回", { description: result.error || "稍后重试" });
        return;
      }
      toast.success(`已打回重审：${item.applicant_name || "成员"}的申请`);
      setHistory((current) => current.filter((h) => (isAppeal ? getAppealId(h) : resolveApprovalRequestId(h)) !== id));
      void loadPending();
      dispatchFulfillmentDataChanged({ source: "command-hub", requestIds: [id] });
      onActionCenterChanged?.();
    } catch {
      toast.error("没能打回，网络异常，请重试");
    } finally {
      setReopeningId(null);
    }
  }, [loadPending, onActionCenterChanged]);

  // ---------- 待办 ----------

  const completeTodo = useCallback(async (todo: ActionItem) => {
    if (todoProcessingId) return;
    setTodoProcessingId(todo.id);
    const ok = await markNotificationDone(todo.id);
    setTodoProcessingId(null);
    if (!ok) {
      toast.error("没能标记完成，已保留");
      return;
    }
    setCompletedTodoIds((prev) => [...prev, todo.id]);
    onActionCenterChanged?.();
  }, [onActionCenterChanged, todoProcessingId]);

  return {
    queue,
    todos,
    pendingLoading,
    pendingError,
    loadPending,
    history,
    historyLoading,
    historyError,
    loadHistory,
    reopeningId,
    undoList,
    pauseUndo,
    resumeUndo,
    undo,
    reviewGroup,
    reviewDay,
    reviewAppeal,
    approveItems,
    reopen,
    completeTodo,
    todoProcessingId,
  };
}
