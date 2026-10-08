"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import type { ActionItem } from "@/lib/action-center/types";
import {
  groupPendingApprovals,
  restoreApprovalItems,
  resolveApprovalRequestId,
  type DailyApprovalDetail,
  type ExemptionRequest,
  type GroupedApprovalItem,
} from "@/lib/exemption-approvals";
import {
  dispatchFulfillmentDataChanged,
  FULFILLMENT_DATA_CHANGED_EVENT,
  type FulfillmentDataChangedDetail,
} from "@/lib/fulfillment-sync";
import type { ApprovalFilterNature } from "@/lib/command-hub/types";
import { ApprovalsTab } from "./command-hub/approvals-tab";
import { HistoryTab } from "./command-hub/history-tab";
import { TodosTab } from "./command-hub/todos-tab";
import { UndoStrip } from "./command-hub/undo-strip";
import { WorkbenchHeader } from "./command-hub/workbench-header";
import {
  buildVisibleApprovalCards,
  getCommandHubRelativeTime,
  getTodoItems,
  splitApprovalItems,
} from "@/lib/command-hub/domain/view-rules";
export {
  getActionTabExplanation,
  getCommandHubTitle,
  getOrphanExemptionReminderMeta,
} from "@/lib/command-hub/domain/view-rules";
import {
  fetchHistoryApprovals as fetchHistoryApprovalsData,
  fetchPendingApprovals as fetchPendingApprovalsData,
  markNotificationDone,
  markNotificationRead,
  reopenExemptionRequest,
  reopenFulfillmentAppeal,
  reviewExemptionRequest,
  reviewFulfillmentAppeal,
} from "@/lib/command-hub/data/approval-api";
import type {
  ActiveFeedbackConfig,
  ActiveUndoItem,
  UnifiedCommandHubProps,
} from "@/lib/command-hub/types";

// ==========================================
// 3. 主组件：独立审批工作台弹窗
// ==========================================

export function UnifiedCommandHub({
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
}: UnifiedCommandHubProps) {
  const [now] = useState(() => Date.now());

  // 审批与历史状态
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ExemptionRequest[]>([]);
  const [historyApprovals, setHistoryApprovals] = useState<ExemptionRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);



  // 类别筛选：全部 / 请假 / 特殊豁免 / 补交申诉
  const [filterNature, setFilterNature] = useState<ApprovalFilterNature>("all");

  // 键盘焦点索引
  const [focusedCardIndex, setFocusedCardIndex] = useState<number>(0);

  // 就地反馈槽状态（针对组、单日或补交驳回，消灭二级弹窗遮罩）
  const [activeFeedbackKey, setActiveFeedbackKey] = useState<string | null>(null);
  const [activeFeedbackConfig, setActiveFeedbackConfig] = useState<ActiveFeedbackConfig | null>(null);

  // 历史打回处理中
  const [actionProcessing, setActionProcessing] = useState<{
    id: string;
    action: "pending";
  } | null>(null);

  // 待办处理
  const [completedSessionIds, setCompletedSessionIds] = useState<string[]>([]);
  const [completedSessionTitles, setCompletedSessionTitles] = useState<Record<string, string>>({});
  const [todoProcessingId, setTodoProcessingId] = useState<string | null>(null);

  // 撤回缓冲列表
  const [activeUndoList, setActiveUndoList] = useState<ActiveUndoItem[]>([]);

  const undoQueueRef = useRef<
    Map<
      string,
      {
        id: string;
        title: string;
        requestIds: string[];
        action: "approved" | "rejected";
        originalItems: ExemptionRequest[];
        feedback?: string;
        dates?: string[];
        timerId: ReturnType<typeof setTimeout>;
        source?: "exemption" | "fulfillment_appeal";
        appealId?: string;
      }
    >
  // gate:transient-map 撤回队列只在当前面板会话内保存待提交审批
  >(new Map());

  // 拉取待审批数据
  const fetchApprovals = useCallback(async () => {
    if (!isAdmin) return;
    setApprovalsLoading(true);
    setApprovalError(null);
    try {
      setPendingApprovals(await fetchPendingApprovalsData());
    } catch (err) {
      console.error("Failed to fetch approvals:", err);
      setApprovalError("审批列表暂未同步");
    } finally {
      setApprovalsLoading(false);
    }
  }, [isAdmin]);

  // 拉取历史审批记录
  const fetchHistoryApprovals = useCallback(async () => {
    if (!isAdmin) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistoryApprovals(await fetchHistoryApprovalsData());
    } catch (err) {
      console.error("Failed to fetch history approvals:", err);
      setHistoryError("历史记录暂未同步");
    } finally {
      setHistoryLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setPendingApprovals([]);
      setHistoryApprovals([]);
      return;
    }
    if (open) {
      if (activeTab === "approvals") {
        void fetchApprovals();
      } else if (activeTab === "history") {
        void fetchHistoryApprovals();
      }
    }
  }, [activeTab, fetchApprovals, fetchHistoryApprovals, isAdmin, open]);

  useEffect(() => {
    const handleFulfillmentDataChanged = (event: Event) => {
      const detail = (event as CustomEvent<FulfillmentDataChangedDetail>).detail;
      if (detail?.source === "fulfillment-calendar") {
        void fetchApprovals();
        void fetchHistoryApprovals();
      }
    };
    window.addEventListener(FULFILLMENT_DATA_CHANGED_EVENT, handleFulfillmentDataChanged);
    return () => {
      window.removeEventListener(FULFILLMENT_DATA_CHANGED_EVENT, handleFulfillmentDataChanged);
    };
  }, [fetchApprovals, fetchHistoryApprovals]);

  // 撤回倒计时
  useEffect(() => {
    if (activeUndoList.length === 0) return;
    const interval = setInterval(() => {
      setActiveUndoList((prev) =>
        prev
          .map((item) => ({ ...item, remainingSeconds: item.remainingSeconds - 1 }))
          .filter((item) => item.remainingSeconds > 0),
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [activeUndoList.length]);

  const commitReview = useCallback(
    async (
      entries: Array<{
        id: string;
        title: string;
        requestIds: string[];
        action: "approved" | "rejected";
        originalItems: ExemptionRequest[];
        feedback?: string;
        dates?: string[];
      }>,
    ) => {
      const allRequests = entries.flatMap((entry) =>
        entry.requestIds.map((requestId) => ({ entry, requestId })),
      );
      if (allRequests.length === 0) return;

      const results = await Promise.all(
        allRequests.map(async ({ entry, requestId }) => {
          const result = await reviewExemptionRequest(
            requestId,
            entry.action,
            entry.feedback,
            entry.dates,
          );
          return { entry, ...result };
        }),
      );

      const successIds = results.filter((r) => r.ok).map((r) => r.requestId);
      const failedRequestIds = results.filter((r) => !r.ok).map((r) => r.requestId);
      const failedEntries = new Set(results.filter((r) => !r.ok).map((r) => r.entry.id));

      if (successIds.length > 0) {
        dispatchFulfillmentDataChanged({
          source: "command-hub",
          requestIds: successIds,
        });
        onActionCenterChanged?.();
      }

      if (failedRequestIds.length > 0) {
        const failedIds = new Set(failedRequestIds);
        const toRestore = entries.flatMap((entry) =>
          entry.originalItems.filter((item) => {
            const reqId = resolveApprovalRequestId(item);
            return reqId ? failedIds.has(reqId) : false;
          }),
        );
        if (toRestore.length > 0) {
          setPendingApprovals((current) => [
            ...restoreApprovalItems(current, toRestore),
            ...current,
          ]);
        }
        // gate:transient-map 仅聚合本次批量审批的失败反馈
        const failureByEntry = new Map<string, { status: number; message: string }>();
        for (const r of results) {
          if (!r.ok && !failureByEntry.has(r.entry.id)) {
            failureByEntry.set(r.entry.id, { status: r.status, message: r.message });
          }
        }
        for (const entry of entries) {
          if (!failedEntries.has(entry.id)) continue;
          const failure = failureByEntry.get(entry.id);
          const isNetwork = !failure || failure.status === 0 || failure.status >= 500;
          toast.error("审批未能保存，已恢复待处理", {
            description: isNetwork
              ? `「${entry.title}」网络异常，请重新操作`
              : `「${entry.title}」${failure.message || "审批失败"}，请刷新后重试`,
          });
        }
      }
    },
    [onActionCenterChanged],
  );

  const commitAppealReview = useCallback(
    async (
      appealId: string,
      action: "approved" | "rejected",
      title: string,
      originalAppeal: ExemptionRequest,
      reason?: string,
    ) => {
      try {
        const result = await reviewFulfillmentAppeal(appealId, action, reason);

        if (!result.ok) {
          setPendingApprovals((current) => [originalAppeal, ...current]);
          toast.error("审批未能保存，已恢复待处理", {
            description: result.error || "网络异常，请刷新后重试",
          });
          return;
        }

        dispatchFulfillmentDataChanged({
          source: "command-hub",
          requestIds: [appealId],
        });
        onActionCenterChanged?.();
      } catch {
        setPendingApprovals((current) => [originalAppeal, ...current]);
        toast.error("审批未能保存，已恢复待处理", {
          description: "网络连接异常，请重试",
        });
      }
    },
    [onActionCenterChanged],
  );

  const flushPendingUndoReviews = useCallback(() => {
    if (undoQueueRef.current.size === 0) return;
    const pending = Array.from(undoQueueRef.current.values());
    undoQueueRef.current.clear();
    setActiveUndoList([]);
    for (const entry of pending) {
      clearTimeout(entry.timerId);
      if (entry.source === "fulfillment_appeal" && entry.appealId) {
        const appealUrl = "/api/admin/fulfillment/appeal/handle";
        const body = JSON.stringify({
          appealId: entry.appealId,
          decision: entry.action === "approved" ? "approve" : "reject",
          reason: entry.feedback || undefined,
        });
        const sent =
          typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
            ? navigator.sendBeacon(appealUrl, new Blob([body], { type: "application/json" }))
            : false;
        if (!sent) {
          void fetch(appealUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          }).catch((error) => {
            console.error("Failed to flush pending appeal review", error);
          });
        }
      } else {
        const url = "/api/exemptions/review";
        for (const requestId of entry.requestIds) {
          const body = JSON.stringify({
            request_id: requestId,
            action: entry.action,
            feedback: entry.feedback ?? null,
            dates: entry.dates,
          });
          const sent =
            typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
              ? navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))
              : false;
          if (!sent) {
            void fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
              keepalive: true,
            }).catch((error) => {
              console.error("Failed to flush pending exemption review", error);
            });
          }
        }
      }
    }
  }, []);

  useEffect(() => {
    const handlePageExit = () => flushPendingUndoReviews();
    window.addEventListener("beforeunload", handlePageExit);
    window.addEventListener("pagehide", handlePageExit);
    return () => {
      window.removeEventListener("beforeunload", handlePageExit);
      window.removeEventListener("pagehide", handlePageExit);
      flushPendingUndoReviews();
    };
  }, [flushPendingUndoReviews]);

  const previousOpenRef = useRef(open);
  useEffect(() => {
    if (previousOpenRef.current && !open) flushPendingUndoReviews();
    previousOpenRef.current = open;
  }, [flushPendingUndoReviews, open]);

  const handleUndo = (undoId: string) => {
    const pending = undoQueueRef.current.get(undoId);
    if (!pending) return;

    clearTimeout(pending.timerId);
    undoQueueRef.current.delete(undoId);
    setActiveUndoList((current) => current.filter((item) => item.id !== undoId));

    if (pending.source === "fulfillment_appeal") {
      setPendingApprovals((current) => [
        ...pending.originalItems,
        ...current,
      ]);
    } else {
      setPendingApprovals((current) => [
        ...restoreApprovalItems(current, pending.originalItems),
        ...current,
      ]);
    }

    toast.success(`已撤回对「${pending.title}」的操作`);
  };

  const scheduleReviewWithUndo = useCallback(
    (
      title: string,
      requestIds: string[],
      action: "approved" | "rejected",
      itemsToRemove: ExemptionRequest[],
      feedback?: string,
      targetDates?: string[],
    ) => {
      if (requestIds.length === 0) return;

      const undoId = `undo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const idSet = new Set(requestIds);

      // 乐观从前端待审列表中移除
      setPendingApprovals((current) =>
        current.filter((item) => {
          const reqId = resolveApprovalRequestId(item);
          return !reqId || !idSet.has(reqId);
        }),
      );

      const timerId = setTimeout(() => {
        undoQueueRef.current.delete(undoId);
        setActiveUndoList((current) => current.filter((item) => item.id !== undoId));
        void commitReview([
          { id: undoId, title, requestIds, action, originalItems: itemsToRemove, feedback, dates: targetDates },
        ]);
      }, 5000);

      undoQueueRef.current.set(undoId, {
        id: undoId,
        title,
        requestIds,
        action,
        originalItems: itemsToRemove,
        feedback,
        dates: targetDates,
        timerId,
      });

      setActiveUndoList((current) => [
        ...current,
        {
          id: undoId,
          title: feedback ? `${title}（已附批注）` : title,
          action,
          remainingSeconds: 5,
        },
      ]);
    },
    [commitReview],
  );

  const scheduleAppealReviewWithUndo = useCallback(
    (
      appeal: ExemptionRequest,
      action: "approved" | "rejected",
      reason?: string,
    ) => {
      const appealId = appeal.id || appeal.appeal_id;
      if (!appealId) return;

      const undoId = `undo_appeal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const appealType = appeal.appeal_type || "补交";
      const title = `${appeal.applicant_name || "成员"} 的${appealType}补交`;

      setPendingApprovals((current) =>
        current.filter((item) => (item.id || item.appeal_id) !== appealId),
      );

      const timerId = setTimeout(() => {
        undoQueueRef.current.delete(undoId);
        setActiveUndoList((current) => current.filter((item) => item.id !== undoId));
        void commitAppealReview(appealId, action, title, appeal, reason);
      }, 5000);

      undoQueueRef.current.set(undoId, {
        id: undoId,
        title,
        requestIds: [appealId],
        action,
        originalItems: [appeal],
        feedback: reason,
        timerId,
        source: "fulfillment_appeal",
        appealId,
      });

      setActiveUndoList((current) => [
        ...current,
        {
          id: undoId,
          title: reason ? `${title}（已附批注）` : title,
          action,
          remainingSeconds: 5,
        },
      ]);
    },
    [commitAppealReview],
  );

  // 整组审批：双极纯粹流转，批注由逐日切片承接
  const handleGroupAction = useCallback(
    (group: GroupedApprovalItem, action: "approved" | "rejected") => {
      if (group.requestIds.length === 0) {
        toast.error("申请编号无效，刷新后再试");
        return;
      }
      const natureName = group.nature === "leave" ? "请假" : "特殊豁免";

      scheduleReviewWithUndo(
        `${group.applicant_name} 的${natureName}`,
        group.requestIds,
        action,
        group.items,
        undefined,
        undefined,
      );
    },
    [scheduleReviewWithUndo],
  );

  // 单日审批的乐观更新：只改该日明细状态，整单 request_status 按后端聚合口径推导
  // （仍有 pending 日期则保持 pending；全部处理完时有任何 rejected 即为 rejected），
  // 避免单日操作把整单状态污染成已结单。
  const applyDailyOptimisticReview = (
    requestId: string,
    dateStr: string,
    action: "approved" | "rejected",
    feedback: string | null,
  ) => {
    const nowIso = new Date().toISOString();
    setPendingApprovals((prev) =>
      prev.map((item) => {
        if (resolveApprovalRequestId(item) !== requestId) return item;
        const daily = item.daily_items ?? [];
        const exists = daily.some((d) => d.request_date === dateStr);
        const nextDaily = exists
          ? daily.map((d) =>
              d.request_date === dateStr
                ? { ...d, status: action, feedback, reviewed_at: nowIso }
                : d,
            )
          : [
              ...daily,
              {
                id: `${requestId}-${dateStr}`,
                request_id: requestId,
                request_date: dateStr,
                reason: item.reason ?? null,
                status: action,
                feedback,
                reviewed_by: null,
                reviewed_at: nowIso,
              },
            ];
        const wasDaily = daily.length > 0;
        const remainingPending = nextDaily.filter((d) => d.status === "pending").length;
        // 仅逐日模型（原本已有完整明细）才按剩余 pending 推导整单状态；
        // 历史单原本无明细，保持 pending，避免把未审批的日期误标成已结单。
        const nextStatus: ExemptionRequest["request_status"] = !wasDaily
          ? item.request_status
          : remainingPending > 0
            ? "pending"
            : nextDaily.some((d) => d.status === "rejected")
              ? "rejected"
              : "approved";
        return { ...item, daily_items: nextDaily, request_status: nextStatus };
      }),
    );
  };

  // 单日审批
  const handleDailyAction = (
    group: GroupedApprovalItem,
    daily: DailyApprovalDetail,
    action: "approved" | "rejected",
    withFeedback = false,
  ) => {
    const targetItem = group.items.find(
      (item) => resolveApprovalRequestId(item) === daily.originalRequestId,
    ) || group.items[0];

    const natureName = daily.nature === "leave" ? "请假" : "特殊豁免";
    const feedbackKey = `daily-${daily.id}`;

    if (withFeedback) {
      if (activeFeedbackKey === feedbackKey) {
        setActiveFeedbackKey(null);
        setActiveFeedbackConfig(null);
        return;
      }
      setActiveFeedbackKey(feedbackKey);
      setActiveFeedbackConfig({
        initialAction: action,
        title: `${group.applicant_name} · ${daily.dateDisplay}`,
        scopeHint: "本次批注仅记录在该单日明细中",
        handler: (finalAction, feedbackText) => {
          setActiveFeedbackKey(null);
          applyDailyOptimisticReview(daily.originalRequestId, daily.dateStr, finalAction, feedbackText || null);
          scheduleReviewWithUndo(
            `${group.applicant_name} · ${daily.dateDisplay}`,
            [daily.originalRequestId],
            finalAction,
            targetItem ? [targetItem] : [],
            feedbackText || undefined,
            [daily.dateStr],
          );
        },
      });
      return;
    }

    applyDailyOptimisticReview(daily.originalRequestId, daily.dateStr, action, null);

    scheduleReviewWithUndo(
      `${group.applicant_name} · ${daily.dateDisplay} (${natureName})`,
      [daily.originalRequestId],
      action,
      targetItem ? [targetItem] : [],
      undefined,
      [daily.dateStr],
    );
  };

  // 历史记录打回待处理：撤销已发豁免，整单退回审批队列重新审批
  const handleReopenReviewDecision = async (item: ExemptionRequest) => {
    const reqId = resolveApprovalRequestId(item);
    if (!reqId) return;

    setActionProcessing({ id: reqId, action: "pending" });
    try {
      const result = await reopenExemptionRequest(reqId);
      if (result.ok) {
        const applicantName = item.applicant_name || "成员";
        toast.success(`已打回待处理：${applicantName} 的申请`);

        setHistoryApprovals((current) =>
          current.filter((h) => resolveApprovalRequestId(h) !== reqId),
        );
        void fetchApprovals();

        dispatchFulfillmentDataChanged({
          source: "command-hub",
          requestIds: [reqId],
        });
        onActionCenterChanged?.();
      } else {
        toast.error("打回失败", { description: result.error || "请稍后重试" });
      }
    } catch {
      toast.error("网络连接异常，请重试");
    } finally {
      setActionProcessing(null);
    }
  };

  // 补交申诉打回待处理：作废原审批结果，重发管理员待办，退回待审批队列
  const handleReopenAppeal = async (appealId: string) => {
    setActionProcessing({ id: appealId, action: "pending" });
    try {
      const result = await reopenFulfillmentAppeal(appealId);
      if (result.ok) {
        toast.success("已打回待处理，原通知已作废");
        setHistoryApprovals((current) =>
          current.filter((item) => (item.id || item.appeal_id) !== appealId),
        );
        void fetchApprovals();
        dispatchFulfillmentDataChanged({
          source: "command-hub",
          requestIds: [appealId],
        });
        onActionCenterChanged?.();
      } else {
        toast.error("打回失败", { description: result.error || "请稍后重试" });
      }
    } catch {
      toast.error("网络连接异常，请重试");
    } finally {
      setActionProcessing(null);
    }
  };

  // 待办标记完成：直连通知 done 接口（服务端已校验归属与实际更新行数）
  const handleToggleTodo = async (todo: ActionItem) => {
    if (todo.source === "exemption") return;
    if (todoProcessingId) return;
    setTodoProcessingId(todo.id);
    const succeeded = await markNotificationDone(todo.id);
    setTodoProcessingId(null);
    if (!succeeded) {
      toast.error("事项未能完成，已保留待处理");
      return;
    }

    setCompletedSessionTitles((prev) => ({
      ...prev,
      [todo.id]: todo.title,
    }));
    setCompletedSessionIds((prev) => [...prev, todo.id]);
    onActionCenterChanged?.();
  };

  const toggleAppealReject = useCallback((appealId: string) => {
    const feedbackKey = `appeal-reject-${appealId}`;
    setActiveFeedbackKey((prev) => (prev === feedbackKey ? null : feedbackKey));
  }, []);

  // 跳转去处理时顺手标记已读；失败不打扰用户，下次摘要刷新会回到未读
  const markTodoRead = (todoId: string) => {
    markNotificationRead(todoId);
  };

  // 快捷键 ESC 关闭与 1/2/3 切换
  const relativeTime = (iso: string) => {
    return getCommandHubRelativeTime(iso, now);
  };

  // 待办列表：完全由行动中枢摘要驱动（摘要接口已含通知 todo 与归属异常）
  const todoItems = useMemo(
    () => getTodoItems(summary, completedSessionIds),
    [completedSessionIds, summary],
  );

  // 区分请假豁免与补交申诉
  const { exemptionItems, appealItems } = useMemo(
    () => splitApprovalItems(pendingApprovals),
    [pendingApprovals],
  );

  // 分组后的待审批请假豁免
  const groupedApprovals = useMemo(
    () => groupPendingApprovals(exemptionItems),
    [exemptionItems],
  );

  // 待审批视图可见卡片（支持全部 / 请假 / 特殊豁免 / 补交申诉 4 档筛选）
  const visibleCards = useMemo(
    () => buildVisibleApprovalCards(filterNature, groupedApprovals, appealItems),
    [appealItems, filterNature, groupedApprovals],
  );

  // 批量审批全部待办项
  const handleApproveAll = () => {
    if (visibleCards.length === 0) return;
    const exemptionCards = visibleCards.filter(
      (c): c is { type: "exemption"; group: GroupedApprovalItem; id: string } => c.type === "exemption",
    );
    const appealCards = visibleCards.filter(
      (c): c is { type: "appeal"; appeal: ExemptionRequest; id: string } => c.type === "appeal",
    );

    if (exemptionCards.length > 0) {
      const allRequestIds = exemptionCards.flatMap((c) => c.group.requestIds);
      const allItems = exemptionCards.flatMap((c) => c.group.items);
      scheduleReviewWithUndo(
        `全部 ${exemptionCards.length} 位成员的请假/豁免`,
        allRequestIds,
        "approved",
        allItems,
      );
    }

    for (const c of appealCards) {
      scheduleAppealReviewWithUndo(c.appeal, "approved");
    }
  };

  const todoTabCount = summary
    ? Math.max(0, summary.todoCount - summary.approvalCount)
    : todoItems.length;
  const approvalTabCount = summary?.approvalCount ?? pendingApprovals.length;
  const actionsLoading = summaryLoading && summary === null;

  // 快捷键监听（ESC / 1-3 Tab 切换 / J-K 选卡 / A 同意 / R 拒绝 / C 批注 / Z 撤回）
  useEffect(() => {
    if (!open) return;

    const scrollCardIntoView = (index: number) => {
      const el = document.getElementById(`approval-card-${index}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // 带修饰键的组合（Cmd+1 切浏览器标签、Ctrl+A 全选、Cmd+Z 撤销输入等）交给浏览器，不劫持。
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Tab 切换（审批与历史仅管理员可见）
      if (e.key === "1" && isAdmin) {
        onTabChange("approvals");
        return;
      }
      if (e.key === "2") {
        onTabChange("todos");
        return;
      }
      if (e.key === "3" && isAdmin) {
        onTabChange("history");
        return;
      }

      // 关闭与收起
      if (e.key === "Escape") {
        if (activeFeedbackKey) {
          setActiveFeedbackKey(null);
          return;
        }
        onOpenChange(false);
        return;
      }

      // 撤回快捷键 (Z)
      if (e.key.toLowerCase() === "z" && activeUndoList.length > 0) {
        e.preventDefault();
        const lastUndo = activeUndoList[activeUndoList.length - 1];
        if (lastUndo) handleUndo(lastUndo.id);
        return;
      }

      // 审批卡片聚焦与快捷流转 (仅在 approvals Tab 生效)
      if (activeTab === "approvals" && visibleCards.length > 0) {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedCardIndex((prev) => {
            const next = Math.min(visibleCards.length - 1, prev + 1);
            scrollCardIntoView(next);
            return next;
          });
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setFocusedCardIndex((prev) => {
            const next = Math.max(0, prev - 1);
            scrollCardIntoView(next);
            return next;
          });
          return;
        }

        const focusedCard = visibleCards[focusedCardIndex] || visibleCards[0];
        if (focusedCard) {
          if (focusedCard.type === "exemption") {
            if (e.key.toLowerCase() === "a") {
              e.preventDefault();
              handleGroupAction(focusedCard.group, "approved");
            } else if (e.key.toLowerCase() === "r") {
              e.preventDefault();
              handleGroupAction(focusedCard.group, "rejected");
            }
          } else if (focusedCard.type === "appeal") {
            if (e.key.toLowerCase() === "a") {
              e.preventDefault();
              scheduleAppealReviewWithUndo(focusedCard.appeal, "approved");
            } else if (e.key.toLowerCase() === "r") {
              e.preventDefault();
              toggleAppealReject(focusedCard.appeal.id);
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    open,
    isAdmin,
    activeTab,
    activeFeedbackKey,
    activeUndoList,
    visibleCards,
    focusedCardIndex,
    handleGroupAction,
    scheduleAppealReviewWithUndo,
    toggleAppealReject,
    onOpenChange,
    onTabChange,
  ]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden">
          {/* Backdrop (轻透微光感，非阻断式便签体验) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 bg-[#141413]/12 backdrop-blur-[2px]"
          />

          {/* Main Modal Workbench Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.985, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, y: 6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex w-[min(440px,calc(100vw-2rem))] sm:w-[min(880px,calc(100vw-2rem))] max-h-[min(580px,calc(100dvh-var(--app-top-offset,64px)-1rem))] sm:max-h-[min(720px,calc(100dvh-var(--app-top-offset,64px)-1rem))] h-[min(580px,calc(100dvh-var(--app-top-offset,64px)-1rem))] sm:h-[min(720px,calc(100dvh-var(--app-top-offset,64px)-1rem))] flex-col overflow-hidden rounded-2xl border border-[#E2E2DF] bg-white shadow-claude-dialog"
          >
            <WorkbenchHeader
              activeTab={activeTab}
              onTabChange={onTabChange}
              isAdmin={isAdmin}
              approvalTabCount={approvalTabCount}
              todoTabCount={todoTabCount}
              historyApprovals={historyApprovals}
              summaryLoading={summaryLoading}
              approvalsLoading={approvalsLoading}
              onRefreshSummary={onRefreshSummary}
              onOpenChange={onOpenChange}
            />

            <UndoStrip
              activeUndoList={activeUndoList}
              handleUndo={handleUndo}
            />

            {/* Main Content Area: 纯净白纸质感，消除三重套娃底板 */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-3 bg-white">
              <ApprovalsTab
                activeTab={activeTab}
                isAdmin={isAdmin}
                filterNature={filterNature}
                setFilterNature={setFilterNature}
                focusedCardIndex={focusedCardIndex}
                setFocusedCardIndex={setFocusedCardIndex}
                groupedApprovals={groupedApprovals}
                appealItems={appealItems}
                visibleCards={visibleCards}
                pendingApprovals={pendingApprovals}
                handleApproveAll={handleApproveAll}
                approvalError={approvalError}
                fetchApprovals={fetchApprovals}
                approvalsLoading={approvalsLoading}
                todoTabCount={todoTabCount}
                onTabChange={onTabChange}
                activeFeedbackKey={activeFeedbackKey}
                activeFeedbackConfig={activeFeedbackConfig}
                actionProcessing={actionProcessing}
                scheduleAppealReviewWithUndo={scheduleAppealReviewWithUndo}
                toggleAppealReject={toggleAppealReject}
                setActiveFeedbackKey={setActiveFeedbackKey}
                handleGroupAction={handleGroupAction}
                handleDailyAction={handleDailyAction}
              />

              <TodosTab
                activeTab={activeTab}
                todoTabCount={todoTabCount}
                summaryError={summaryError}
                onRefreshSummary={onRefreshSummary}
                actionsLoading={actionsLoading}
                todoItems={todoItems}
                todoProcessingId={todoProcessingId}
                handleToggleTodo={handleToggleTodo}
                relativeTime={relativeTime}
                completedSessionIds={completedSessionIds}
                completedSessionTitles={completedSessionTitles}
                markTodoRead={markTodoRead}
                onOpenChange={onOpenChange}
              />

              <HistoryTab
                activeTab={activeTab}
                isAdmin={isAdmin}
                historyApprovals={historyApprovals}
                historyError={historyError}
                fetchHistoryApprovals={fetchHistoryApprovals}
                historyLoading={historyLoading}
                actionProcessing={actionProcessing}
                handleReopenAppeal={handleReopenAppeal}
                handleReopenReviewDecision={handleReopenReviewDecision}
              />
            </div>

            {/* Footer: 默认隐形，划入或聚焦时平滑显示 */}
            <div className="shrink-0 flex items-center justify-between border-t border-[#E2E2DF]/60 bg-white px-5 sm:px-6 py-2.5 text-[12px] text-[#78716C] opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
              <span>✦ 决策实时同步至发布管理与个人工作台</span>
              {isAdmin && (
                <div className="hidden sm:flex items-center gap-2 text-[12px] text-[#78716C]">
                  <span><strong className="font-mono text-[#1F1E1D] font-normal">J/K</strong> 选卡</span>
                  <span>·</span>
                  <span><strong className="font-mono text-[#1F1E1D] font-normal">A</strong> 同意</span>
                  <span>·</span>
                  <span><strong className="font-mono text-[#1F1E1D] font-normal">R</strong> 拒绝</span>
                  <span>·</span>
                  <span><strong className="font-mono text-[#1F1E1D] font-normal">Z</strong> 撤回</span>
                  <span>·</span>
                  <span><strong className="font-mono text-[#1F1E1D] font-normal">1-3</strong> 视图</span>
                  <span>·</span>
                  <span><strong className="font-mono text-[#1F1E1D] font-normal">Esc</strong> 关闭</span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
