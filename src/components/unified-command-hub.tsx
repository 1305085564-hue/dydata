"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Check,
  CheckCircle2,
  Circle,
  ArrowRight,
  Loader2,
  RefreshCw,
  TriangleAlert,
  RotateCcw,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/ui/section-heading";
import { ItemHeading } from "@/components/ui/item-heading";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  isReviewExemptionAction,
  sortActionItems,
  type ActionCenterSummary,
  type ActionItem,
} from "@/lib/action-center/types";
import { toast } from "sonner";
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
import type { ApprovalCard, ApprovalFilterNature } from "./command-hub/types";
import { FulfillmentAppealCard } from "./command-hub/fulfillment-appeal-card";
import { HistoryAppealCard } from "./command-hub/history-appeal-card";
import { HistoryExemptionCard } from "./command-hub/history-exemption-card";
import { ExemptionApprovalCard } from "./command-hub/exemption-approval-card";

export function getOrphanExemptionReminderMeta(
  count: number,
  canViewDetails: boolean,
) {
  if (count <= 0) return null;

  return {
    title: canViewDetails ? "待归属申请" : "归属异常",
    badge: `${count} 条`,
    description: canViewDetails
      ? "请前往成员管理处理归属异常申请。"
      : "有待公司所有者处理的归属异常。",
  };
}

export function getActionTabExplanation(tab: "todos" | "approvals" | "history") {
  if (tab === "approvals") {
    return "等待你通过或拒绝的正式申请，目前是成员提交的请假/豁免。处理结果直接影响发布考核口径。";
  }
  if (tab === "history") {
    return "历史审批记录，记录了过往的通过与拒绝决定，支持随时打回待处理重新审批。";
  }
  return "需要你处理或跟进的事项，来自权限申请、归属异常、AI 任务失败、系统风险等。有明确动作，处理完成后自动消失。";
}

export function getCommandHubTitle(isAdmin: boolean) {
  return isAdmin ? "审批工作台" : "通知与待办";
}

// ==========================================
// 3. 主组件：独立审批工作台弹窗
// ==========================================

interface UnifiedCommandHubProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: "todos" | "approvals" | "history";
  onTabChange: (tab: "todos" | "approvals" | "history") => void;
  isAdmin: boolean;
  summary: ActionCenterSummary | null;
  summaryLoading?: boolean;
  summaryError?: string | null;
  onRefreshSummary?: () => Promise<ActionCenterSummary | null>;
  onActionCenterChanged?: () => void;
}

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
  const [activeFeedbackConfig, setActiveFeedbackConfig] = useState<{
    initialAction: "approved" | "rejected";
    title: string;
    scopeHint: string;
    handler: (action: "approved" | "rejected", feedback: string) => void;
    required?: boolean;
    confirmLabel?: string;
  } | null>(null);

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
  const [activeUndoList, setActiveUndoList] = useState<Array<{
    id: string;
    title: string;
    action: "approved" | "rejected";
    remainingSeconds: number;
  }>>([]);

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
  >(new Map());

  // 拉取待审批数据
  const fetchApprovals = useCallback(async () => {
    if (!isAdmin) return;
    setApprovalsLoading(true);
    setApprovalError(null);
    try {
      const res = await fetch("/api/exemptions/pending", { cache: "no-store" });
      if (!res.ok) throw new Error("pending approvals fetch failed");
      const json = await res.json();
      const data = json.data ?? [];
      setPendingApprovals(data);
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
      const res = await fetch("/api/exemptions/history?limit=50", { cache: "no-store" });
      if (!res.ok) throw new Error("history approvals fetch failed");
      const json = await res.json();
      setHistoryApprovals(json.data ?? []);
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
          try {
            const res = await fetch("/api/exemptions/review", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                request_id: requestId,
                action: entry.action,
                feedback: entry.feedback ?? null,
                dates: entry.dates,
              }),
            });
            if (res.ok) return { entry, requestId, ok: true as const, status: res.status, message: "" };
            let message = "";
            try {
              const json = (await res.json()) as { error?: unknown };
              message = typeof json?.error === "string" ? json.error : "";
            } catch {
              message = "";
            }
            return { entry, requestId, ok: false as const, status: res.status, message };
          } catch {
            return { entry, requestId, ok: false as const, status: 0, message: "" };
          }
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
        const decision = action === "approved" ? "approve" : "reject";
        const res = await fetch("/api/admin/fulfillment/appeal/handle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appealId,
            decision,
            reason: reason || undefined,
          }),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          businessSucceeded?: boolean;
          error?: string;
        };

        if (!res.ok || payload.businessSucceeded === false) {
          setPendingApprovals((current) => [originalAppeal, ...current]);
          toast.error("审批未能保存，已恢复待处理", {
            description: payload.error || "网络异常，请刷新后重试",
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

  // 整组审批
  const handleGroupAction = useCallback(
    (
      group: GroupedApprovalItem,
      action: "approved" | "rejected",
      withFeedback = false,
    ) => {
      if (group.requestIds.length === 0) {
        toast.error("申请编号无效，刷新后再试");
        return;
      }
      const natureName = group.nature === "leave" ? "请假" : "特殊豁免";
      const feedbackKey = `group-${group.groupKey}`;

      if (withFeedback) {
        if (activeFeedbackKey === feedbackKey) {
          setActiveFeedbackKey(null);
          setActiveFeedbackConfig(null);
          return;
        }
        setActiveFeedbackKey(feedbackKey);
        setActiveFeedbackConfig({
          initialAction: action,
          title: `${group.applicant_name} 的${natureName}`,
          scopeHint: "本次批注将同步应用至该申请涵盖的每个待处理日期",
          handler: (finalAction, feedbackText) => {
            setActiveFeedbackKey(null);
            scheduleReviewWithUndo(
              `${group.applicant_name} 的${natureName}`,
              group.requestIds,
              finalAction,
              group.items,
              feedbackText || undefined,
              undefined,
            );
          },
        });
        return;
      }

      scheduleReviewWithUndo(
        `${group.applicant_name} 的${natureName}`,
        group.requestIds,
        action,
        group.items,
        undefined,
        undefined,
      );
    },
    [activeFeedbackKey, scheduleReviewWithUndo],
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
      const res = await fetch("/api/exemptions/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: reqId }),
      });
      if (res.ok) {
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
        const json = await res.json();
        toast.error("打回失败", { description: json.error || "请稍后重试" });
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
      const res = await fetch("/api/admin/fulfillment/appeal/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appealId }),
      });
      if (res.ok) {
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
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error("打回失败", { description: json.error || "请稍后重试" });
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
    let succeeded = false;
    try {
      const res = await fetch(`/api/notifications/${todo.id}/done`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "done" }),
      });
      succeeded = res.ok;
    } catch {
      succeeded = false;
    }
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
    void fetch(`/api/notifications/${todoId}/read`, { method: "PATCH" }).catch(() => {});
  };

  // 快捷键 ESC 关闭与 1/2/3 切换
  const relativeTime = (iso: string) => {
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return "";
    const diff = now - ts;
    const hr = Math.floor(diff / 3_600_000);
    if (hr < 24) return `${hr} 小时前`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day} 天前`;
    return new Date(iso).toLocaleDateString("zh-CN", {
      month: "numeric",
      day: "numeric",
    });
  };

  // 待办列表：完全由行动中枢摘要驱动（摘要接口已含通知 todo 与归属异常）
  const todoItems = useMemo(() => {
    const summaryItems = (summary?.topItems ?? []).filter(
      (item) => !isReviewExemptionAction(item.action),
    );
    return sortActionItems(summaryItems).filter(
      (item) => !completedSessionIds.includes(item.id),
    );
  }, [completedSessionIds, summary]);

  // 区分请假豁免与补交申诉
  const exemptionItems = useMemo(
    () => pendingApprovals.filter((item) => item.source !== "fulfillment_appeal"),
    [pendingApprovals],
  );
  const appealItems = useMemo(
    () => pendingApprovals.filter((item) => item.source === "fulfillment_appeal"),
    [pendingApprovals],
  );

  // 分组后的待审批请假豁免
  const groupedApprovals = useMemo(
    () => groupPendingApprovals(exemptionItems),
    [exemptionItems],
  );

  // 待审批视图可见卡片（支持全部 / 请假 / 特殊豁免 / 补交申诉 4 档筛选）
  const visibleCards = useMemo<ApprovalCard[]>(() => {
    if (filterNature === "leave") {
      return groupedApprovals
        .filter((g) => g.nature === "leave")
        .map((group) => ({ type: "exemption", group, id: group.groupKey }));
    }
    if (filterNature === "waive") {
      return groupedApprovals
        .filter((g) => g.nature === "waive")
        .map((group) => ({ type: "exemption", group, id: group.groupKey }));
    }
    if (filterNature === "appeal") {
      return appealItems.map((appeal) => ({
        type: "appeal",
        appeal,
        id: appeal.id || appeal.appeal_id || "",
      }));
    }
    const exCards: ApprovalCard[] = groupedApprovals.map((group) => ({
      type: "exemption",
      group,
      id: group.groupKey,
    }));
    const apCards: ApprovalCard[] = appealItems.map((appeal) => ({
      type: "appeal",
      appeal,
      id: appeal.id || appeal.appeal_id || "",
    }));
    return [...exCards, ...apCards].sort((a, b) => {
      const timeA =
        a.type === "exemption"
          ? new Date(a.group.created_at).getTime()
          : new Date(a.appeal.created_at).getTime();
      const timeB =
        b.type === "exemption"
          ? new Date(b.group.created_at).getTime()
          : new Date(b.appeal.created_at).getTime();
      return timeB - timeA;
    });
  }, [appealItems, filterNature, groupedApprovals]);

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
              handleGroupAction(focusedCard.group, "approved", false);
            } else if (e.key.toLowerCase() === "r") {
              e.preventDefault();
              handleGroupAction(focusedCard.group, "rejected", false);
            } else if (e.key.toLowerCase() === "c") {
              e.preventDefault();
              handleGroupAction(focusedCard.group, "approved", true);
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
            {/* Top Navigation & Workspace Header */}
            <div className="shrink-0 border-b border-[#E2E2DF]/60 bg-white px-5 sm:px-6 pt-4 pb-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-xl bg-[#F1F1F0] text-[#141413] shadow-card-ring border border-[#E2E2DF]/60">
                    <ClipboardCheck className="size-3.5 stroke-[1.8]" />
                  </div>
                  <div>
                    <SectionHeading as="h3" className="tracking-tight">
                      {getCommandHubTitle(isAdmin)}
                    </SectionHeading>
                  </div>
                </div>

                {/* Header Actions: Refresh & Close */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void onRefreshSummary?.()}
                    disabled={summaryLoading || !onRefreshSummary}
                    aria-label="刷新数据"
                    title="刷新数据"
                    className="flex size-7 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <RefreshCw className={cn("size-3.5", (summaryLoading || approvalsLoading) && "animate-spin")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="关闭工作台"
                    className="flex size-7 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors cursor-pointer"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              {/* Navigation Tabs (待审批 vs 待办 vs 已处理) */}
              <div className="mt-3.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-md bg-[#F1F1F0] p-1">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onTabChange("approvals")}
                      className={cn(
                        "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] transition-colors duration-150 z-10 select-none cursor-pointer",
                        activeTab === "approvals"
                          ? "text-[#141413] font-normal"
                          : "text-[#78716C] hover:text-[#1F1E1D]",
                      )}
                    >
                      {activeTab === "approvals" && (
                        <motion.div
                          layoutId="workbenchTabIndicator"
                          className="absolute inset-0 rounded-md bg-white shadow-input border border-[#E2E2DF]/60 -z-10"
                          transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                      )}
                      <span>待审批申请</span>
                      {approvalTabCount > 0 && (
                        <span
                          className={cn(
                            "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[12px] font-normal tabular-nums",
                            activeTab === "approvals"
                              ? "bg-[#E4E4E1] text-[#141413] font-medium"
                              : "bg-[#F1F1F0] text-[#78716C]",
                          )}
                        >
                          {approvalTabCount > 99 ? "99+" : approvalTabCount}
                        </span>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onTabChange("todos")}
                    className={cn(
                      "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] transition-colors duration-150 z-10 select-none cursor-pointer",
                      activeTab === "todos"
                        ? "text-[#141413] font-normal"
                        : "text-[#78716C] hover:text-[#1F1E1D]",
                    )}
                  >
                    {activeTab === "todos" && (
                      <motion.div
                        layoutId="workbenchTabIndicator"
                        className="absolute inset-0 rounded-md bg-white shadow-input border border-[#E2E2DF]/60 -z-10"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                    <span>团队待办</span>
                    {todoTabCount > 0 && (
                      <span
                        className={cn(
                          "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[12px] font-normal tabular-nums",
                          activeTab === "todos"
                            ? "bg-[#E4E4E1] text-[#141413] font-medium"
                            : "bg-[#F1F1F0] text-[#78716C]",
                        )}
                      >
                        {todoTabCount > 99 ? "99+" : todoTabCount}
                      </span>
                    )}
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onTabChange("history")}
                      className={cn(
                        "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] transition-colors duration-150 z-10 select-none cursor-pointer",
                        activeTab === "history"
                          ? "text-[#141413] font-normal"
                          : "text-[#78716C] hover:text-[#1F1E1D]",
                      )}
                    >
                      {activeTab === "history" && (
                        <motion.div
                          layoutId="workbenchTabIndicator"
                          className="absolute inset-0 rounded-md bg-white shadow-input border border-[#E2E2DF]/60 -z-10"
                          transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                      )}
                      <span>已处理记录</span>
                      {historyApprovals.length > 0 && (
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F1F1F0] px-1.5 text-[12px] font-normal text-[#78716C] tabular-nums">
                          {historyApprovals.length}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                <div className="hidden sm:flex items-center gap-1 text-[12px] text-[#78716C]">
                  <span>✦</span>
                  <span>审阅与考勤口径实时同步</span>
                </div>
              </div>
            </div>

            {/* Top Pinned Undo Notification Strip (顶部非阻断撤回状态条，绝不遮挡底部卡片) */}
            <AnimatePresence>
              {activeUndoList.length > 0 && (
                <motion.div
                  key="undo-banner-top"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="shrink-0 overflow-hidden border-b border-[#E2E2DF]/60 bg-white px-5 sm:px-6"
                >
                  <div className="py-2 space-y-1">
                    {activeUndoList.map((activeUndo) => (
                      <div key={activeUndo.id} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[#78716C] text-[12px]">✦</span>
                          <span className="truncate text-[12px] font-normal text-[#141413]">
                            {activeUndo.action === "approved" ? "已同意" : "已拒绝"} {activeUndo.title}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUndo(activeUndo.id)}
                          className="inline-flex items-center gap-1 shrink-0 rounded-md bg-white border border-[#E2E2DF] hover:bg-[#EBEBE9] px-2.5 py-0.5 text-[12px] font-normal text-[#1F1E1D] shadow-input transition-colors cursor-pointer"
                        >
                          <RotateCcw className="size-3 text-[#78716C]" />
                          <span>撤回 ({activeUndo.remainingSeconds}s)</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-3 bg-[#FCFCFB]">
              {/* 1. APPROVALS WORKBENCH TAB (待审批工作台) */}
              {activeTab === "approvals" && isAdmin && (
                <div className="space-y-3">
                  {/* Filter & Metric Bar: 纯净目录排版 (消灭双层胶囊打架) */}
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
                        <span className="ml-1 text-[12px] text-[#78716C]">
                          ({groupedApprovals.length + appealItems.length})
                        </span>
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
                        <span className="ml-1 text-[12px] text-[#78716C]">
                          ({groupedApprovals.filter((g) => g.nature === "leave").length})
                        </span>
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
                        <span className="ml-1 text-[12px] text-[#78716C]">
                          ({groupedApprovals.filter((g) => g.nature === "waive").length})
                        </span>
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
                        <span className="ml-1 text-[12px] text-[#78716C]">
                          ({appealItems.length})
                        </span>
                        {filterNature === "appeal" && (
                          <motion.div
                            layoutId="approvalFilterUnderline"
                            className="absolute bottom-0 inset-x-0 h-[2px] bg-[#141413] rounded-full"
                          />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      {visibleCards.length > 1 && (
                        <button
                          type="button"
                          onClick={handleApproveAll}
                          className="inline-flex items-center gap-1 rounded-md bg-[#D97757]/12 hover:bg-[#D97757]/20 text-[#C46A4D] hover:text-[#D97757] px-2.5 py-1 text-[12px] font-normal transition-all active:scale-[0.98] cursor-pointer"
                        >
                          <Check className="size-3 stroke-[2.2]" />
                          <span>一键全部同意 ({visibleCards.length}) →</span>
                        </button>
                      )}
                      <div className="text-[12px] text-[#78716C] tabular-nums">
                        共 {pendingApprovals.length} 份明细
                      </div>
                    </div>
                  </div>

                  {approvalError && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-status-danger/20 bg-status-danger/[0.04] p-3 text-[12px] text-status-danger">
                      <span className="inline-flex items-center gap-2">
                        <TriangleAlert className="size-4 shrink-0" />
                        <span>{approvalError}</span>
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
                  {approvalsLoading && pendingApprovals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Loader2 className="size-5 animate-spin text-[#D97757] mb-2" />
                      <p className="text-[13px] text-[#78716C]">正在同步待审批记录...</p>
                    </div>
                  ) : visibleCards.length === 0 ? (
                    <EmptyState
                      variant="compact"
                      title={
                        filterNature !== "all"
                          ? "当前筛选下无匹配记录"
                          : "全部申请已阅毕"
                      }
                      description={
                        filterNature !== "all"
                          ? "可切换筛选条件查看其他申请。"
                          : "团队成员请假、豁免与补交申诉均已处理，考勤口径保持最新。"
                      }
                      action={
                        filterNature === "all" && todoTabCount > 0
                          ? {
                              label: `前往团队待办 (${todoTabCount})`,
                              onClick: () => onTabChange("todos"),
                            }
                          : undefined
                      }
                    />
                  ) : (
                    /* Grouped Approvals List: 平滑布局动效 + 键盘导航 */
                    <motion.div layout className="space-y-3">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {visibleCards.map((card, index) => {
                          const isFocused = focusedCardIndex === index;

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
                    </motion.div>
                  )}
                </div>
              )}

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

              {/* 3. HISTORY TAB (已处理历史) */}
              {activeTab === "history" && isAdmin && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 min-h-[36px] pb-2 border-b border-[#E2E2DF]/60">
                    <div className="flex items-center gap-2 text-[13px] font-normal text-[#141413]">
                      <span>已处理审批记录</span>
                      <span className="text-[12px] text-[#78716C] font-normal">（支持查阅与随时打回待处理）</span>
                    </div>
                    <div className="text-[12px] text-[#78716C] tabular-nums">
                      共 {historyApprovals.length} 条记录
                    </div>
                  </div>

                  {historyError && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-status-danger/20 bg-status-danger/[0.04] p-3 text-[12px] text-status-danger">
                      <span className="inline-flex items-center gap-2">
                        <TriangleAlert className="size-4 shrink-0" />
                        <span>{historyError}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void fetchHistoryApprovals()}
                        className="rounded-md px-2 py-1 font-normal hover:bg-status-danger/10 transition-colors cursor-pointer"
                      >
                        重试
                      </button>
                    </div>
                  )}

                  {historyLoading && historyApprovals.length === 0 ? (
                    <EmptyState
                      variant="compact"
                      title="正在加载历史记录..."
                    />
                  ) : historyApprovals.length === 0 ? (
                    <EmptyState
                      variant="compact"
                      title="暂无历史审批记录"
                      description="所有审阅处理后的申请记录将在此处归档，可随时回溯。"
                    />
                  ) : (
                    <div className="space-y-3">
                      {historyApprovals.map((item) => {
                        const isAppeal = item.source === "fulfillment_appeal";
                        const itemId = item.id || item.appeal_id || "";
                        const isProcessing = Boolean(actionProcessing?.id === itemId);

                        if (isAppeal) {
                          return (
                            <HistoryAppealCard
                              key={itemId}
                              appeal={item}
                              isProcessing={isProcessing}
                              onReopen={handleReopenAppeal}
                            />
                          );
                        }

                        const reqId = resolveApprovalRequestId(item);
                        return (
                          <HistoryExemptionCard
                            key={reqId || item.id}
                            item={item}
                            isProcessing={Boolean(reqId && actionProcessing?.id === reqId)}
                            onReopen={(ex) => void handleReopenReviewDecision(ex)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer: 无框轻量纯排版 */}
            <div className="shrink-0 flex items-center justify-between border-t border-[#E2E2DF]/60 bg-white px-5 sm:px-6 py-2.5 text-[12px] text-[#78716C]">
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
