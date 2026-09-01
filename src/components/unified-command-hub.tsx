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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  useNotifications,
} from "./notifications/notification-store";
import {
  buildNotificationActionItem,
  isReviewExemptionAction,
  sortActionItems,
  type ActionCenterSummary,
  type ActionItem,
} from "@/lib/action-center/types";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  collectApprovalRequestIds,
  removeReviewedApproval,
  restoreApprovalItems,
  resolveApprovalRequestId,
} from "@/lib/exemption-approvals";
import {
  dispatchFulfillmentDataChanged,
  FULFILLMENT_DATA_CHANGED_EVENT,
  type FulfillmentDataChangedDetail,
} from "@/lib/fulfillment-sync";
import {
  getExemptionCategoryLabel,
  normalizeExemptionCategoryForDisplay,
  toExemptionCategory,
  type ExemptionCategoryValue,
} from "@/lib/exemption-category";
import { createInFlightRequest } from "@/lib/in-flight-request";

interface ExemptionRequest {
  id: string;
  request_id?: string | null;
  applicant_user_id: string;
  applicant_name: string | null;
  team_id: string | null;
  team_name: string | null;
  exemption_type: string;
  exemption_category: ExemptionCategoryValue;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  request_status: "pending" | "approved" | "rejected";
  reviewed_by?: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function formatShortDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(dateStr.trim());
  if (match) {
    const [, , m, d] = match;
    return `${Number(m)}月${Number(d)}日`;
  }
  return dateStr;
}

export interface GroupedApprovalItem {
  groupKey: string;
  applicant_user_id: string;
  applicant_name: string;
  team_name: string | null;
  nature: "leave" | "waive"; // 请假 vs 豁免/免交
  isPermanent: boolean;
  categoryBadge: string;
  dateRangeText: string;
  dayCount: number;
  reasons: string[];
  created_at: string;
  requestIds: string[];
  items: ExemptionRequest[];
}

// "YYYY-MM-DD" 按 UTC 午夜解析，避免本地时区（如上海凌晨）导致的跨天误差
function parseUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseDateDaysDifference(startStr: string, endStr: string): number {
  const d1 = parseUtcDate(startStr).getTime();
  const d2 = parseUtcDate(endStr).getTime();
  return Math.abs(d2 - d1) / 86_400_000 + 1;
}

// 把 [start,end] 展开成逐日日期字符串集合（UTC 递增，无夏令时干扰）
function expandDateRange(startDate: string, endDate: string | null): string[] {
  const start = parseUtcDate(startDate);
  const end = endDate ? parseUtcDate(endDate) : start;
  const dates: string[] = [];
  let cursor = start.getTime();
  while (cursor <= end.getTime()) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return dates;
}

export function groupPendingApprovals(items: ExemptionRequest[]): GroupedApprovalItem[] {
  const groupsMap = new Map<string, ExemptionRequest[]>();

  for (const item of items) {
    const isPermanent = item.exemption_type === "permanent";
    // 严格按 exemption_category 区分请假与免交，不能只按 exemption_type 判断
    const nature = normalizeExemptionCategoryForDisplay(item.exemption_category);
    const groupKey = `${item.applicant_user_id}_${nature}_${isPermanent ? "perm" : "temp"}`;

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, []);
    }
    groupsMap.get(groupKey)!.push(item);
  }

  const result: GroupedApprovalItem[] = [];

  for (const [groupKey, groupItems] of groupsMap.entries()) {
    const first = groupItems[0];
    const isPermanent = first.exemption_type === "permanent";
    const nature = normalizeExemptionCategoryForDisplay(first.exemption_category);
    const hasLegacyCategory = groupItems.some((item) => item.exemption_category === null);
    const applicant_name = first.applicant_name || "未命名成员";
    const team_name = first.team_name || null;

    // 按完整日期范围展开后合并：区间重叠/相邻视为连续，天数取并集天数
    const allDatesSet = new Set<string>();
    for (const gi of groupItems) {
      for (const d of expandDateRange(gi.start_date, gi.end_date)) {
        allDatesSet.add(d);
      }
    }
    const sortedDates = Array.from(allDatesSet).sort();

    let dateRangeText = "";
    let dayCount = 0;

    if (isPermanent) {
      dateRangeText = "长期 / 永久";
      dayCount = 0;
    } else if (sortedDates.length === 0) {
      dateRangeText = "未指定日期";
      dayCount = 1;
    } else {
      dayCount = sortedDates.length;
      const minDate = sortedDates[0];
      const maxDate = sortedDates[sortedDates.length - 1];
      // 并集日期首尾相连（无空洞）即视为连续区间
      const spanDays = parseDateDaysDifference(minDate, maxDate);
      if (spanDays === sortedDates.length) {
        dateRangeText = `${formatShortDate(minDate)} 至 ${formatShortDate(maxDate)}`;
      } else {
        dateRangeText = sortedDates.map(formatShortDate).join(" · ");
      }
    }

    // 徽标文案：严格区分请假与豁免
    let categoryBadge = "";
    if (isPermanent) {
      categoryBadge = nature === "leave"
        ? "永久请假"
        : hasLegacyCategory ? "永久免交（历史兼容）" : "永久豁免";
    } else if (nature === "leave") {
      categoryBadge = dayCount > 1 ? `请假${dayCount}天` : "请假1天";
    } else {
      categoryBadge = hasLegacyCategory
        ? dayCount > 1 ? `免交${dayCount}天（历史兼容）` : "免交申请（历史兼容）"
        : dayCount > 1 ? `免交${dayCount}天` : "免交申请";
    }

    // 去重事由
    const reasons = Array.from(
      new Set(
        groupItems
          .map((gi) => gi.reason?.trim())
          .filter((r): r is string => Boolean(r)),
      ),
    );

    // 最新提交时间
    const created_at = groupItems.reduce(
      (latest, gi) => (gi.created_at > latest ? gi.created_at : latest),
      first.created_at,
    );

    const requestIds = collectApprovalRequestIds(groupItems);

    result.push({
      groupKey,
      applicant_user_id: first.applicant_user_id,
      applicant_name,
      team_name,
      nature,
      isPermanent,
      categoryBadge,
      dateRangeText,
      dayCount,
      reasons,
      created_at,
      requestIds,
      items: groupItems,
    });
  }

  return result;
}

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
    return "历史审批记录，记录了过往的通过与拒绝决定，支持随时改判修正。";
  }
  return "需要你处理或跟进的事项，来自权限申请、归属异常、AI 任务失败、系统风险等。有明确动作，处理完成后自动消失。";
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
  const { notifications, loading, markRead, markDone } = useNotifications();
  const drawerRef = useRef<HTMLDivElement>(null);
  // 捕获挂载时刻用于相对时间显示，避免 render 中调用 Date.now()（React Compiler purity）
  const [now] = useState(() => Date.now());

  // Approvals State
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ExemptionRequest[]>(
    [],
  );
  const [historyApprovals, setHistoryApprovals] = useState<ExemptionRequest[]>(
    [],
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<Set<string>>(
    new Set(),
  );
  const [actionProcessing, setActionProcessing] = useState<{
    id: string;
    action: "approved" | "rejected";
  } | null>(null);
  const [dismissedSummaryApprovalIds, setDismissedSummaryApprovalIds] = useState<Set<string>>(new Set());

  const fetchApprovals = useCallback(async () => {
    if (!isAdmin) return;
    setApprovalsLoading(true);
    setApprovalError(null);
    try {
      const res = await fetch("/api/exemptions/pending", { cache: "no-store" });
      if (!res.ok) throw new Error("pending approvals fetch failed");
      const json = await res.json();
      const data = json.data ?? [];
      const validRequestIds = new Set(collectApprovalRequestIds(data));
      setPendingApprovals(data);
      setSelectedApprovalIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(
          Array.from(prev).filter((id) => validRequestIds.has(id)),
        );
        return next;
      });
    } catch (err) {
      console.error("Failed to fetch approvals:", err);
      setApprovalError("审批列表暂时没同步到最新");
    } finally {
      setApprovalsLoading(false);
    }
  }, [isAdmin]);

  const fetchHistoryApprovals = useMemo(
    () => createInFlightRequest(async () => {
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
        setHistoryError("历史记录暂时没同步到最新");
      } finally {
        setHistoryLoading(false);
      }
    }),
    [isAdmin],
  );

  useEffect(() => {
    if (!isAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 权限变化时清空审批队列与勾选
      setPendingApprovals([]);
      setHistoryApprovals([]);
      setSelectedApprovalIds(new Set());
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
    window.addEventListener(
      FULFILLMENT_DATA_CHANGED_EVENT,
      handleFulfillmentDataChanged,
    );
    return () => {
      window.removeEventListener(
        FULFILLMENT_DATA_CHANGED_EVENT,
        handleFulfillmentDataChanged,
      );
    };
  }, [fetchApprovals, fetchHistoryApprovals]);

  const handleModifyReviewDecision = async (
    item: ExemptionRequest,
    newAction: "approved" | "rejected",
  ) => {
    const reqId = resolveApprovalRequestId(item);
    if (!reqId) return;

    setActionProcessing({ id: reqId, action: newAction });
    try {
      const res = await fetch("/api/exemptions/re-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: reqId, action: newAction }),
      });
      if (res.ok) {
        const applicantName = item.applicant_name || "成员";
        const actionLabel = newAction === "approved" ? "已改为通过" : "已改为拒绝";
        toast.success(`${actionLabel}：${applicantName} 的申请`);

        setHistoryApprovals((current) =>
          current.map((h) =>
            resolveApprovalRequestId(h) === reqId
              ? { ...h, request_status: newAction }
              : h,
          ),
        );

        dispatchFulfillmentDataChanged({
          source: "command-hub",
          requestIds: [reqId],
        });
        onActionCenterChanged?.();
      } else {
        const json = await res.json();
        toast.error("修改决策失败", { description: json.error || "请稍后重试" });
      }
    } catch {
      toast.error("网络连接异常，请重试");
    } finally {
      setActionProcessing(null);
    }
  };

  const submitExemptionReview = async (
    requestId: string,
    action: "approved" | "rejected",
  ) => {
    if (!requestId) {
      toast.error("申请编号无效，刷新后再试");
      return false;
    }

    setActionProcessing({ id: requestId, action });
    try {
      const res = await fetch("/api/exemptions/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, action }),
      });
      if (res.ok) {
        setPendingApprovals((current) => {
          const next = removeReviewedApproval(current, requestId);
          return next;
        });
        setDismissedSummaryApprovalIds((current) => {
          const next = new Set(current);
          next.add(requestId);
          return next;
        });
        setSelectedApprovalIds((current) => {
          const next = new Set(current);
          next.delete(requestId);
          return next;
        });
        dispatchFulfillmentDataChanged({
          source: "command-hub",
          requestIds: [requestId],
        });
        onActionCenterChanged?.();
        return true;
      } else {
        const json = await res.json();
        toast.error("审批未能保存", { description: json.error || "请稍后重试" });
        return false;
      }
    } catch {
      toast.error("网络连接异常，请重试");
      return false;
    } finally {
      setActionProcessing(null);
    }
  };

  // 5秒撤回缓冲队列：支持多条审批同时进行、每条都可单独撤回
  const [activeUndoList, setActiveUndoList] = useState<Array<{
    id: string;
    title: string;
    action: "approved" | "rejected";
    remainingSeconds: number;
  }>>([]);

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

  const undoQueueRef = useRef<
    Map<
      string,
      {
        id: string;
        title: string;
        requestIds: string[];
        action: "approved" | "rejected";
        originalItems: ExemptionRequest[];
        timerId: ReturnType<typeof setTimeout>;
      }
    >
  >(new Map());

  const commitReview = useCallback(
    async (
      entries: Array<{
        id: string;
        title: string;
        requestIds: string[];
        action: "approved" | "rejected";
        originalItems: ExemptionRequest[];
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
              body: JSON.stringify({ request_id: requestId, action: entry.action }),
            });
            return { entry, requestId, ok: res.ok };
          } catch {
            return { entry, requestId, ok: false };
          }
        }),
      );

      const successIds = results.filter((r) => r.ok).map((r) => r.requestId);
      const failedRequestIds = results.filter((r) => !r.ok).map((r) => r.requestId);
      const failedEntries = new Set(
        results.filter((r) => !r.ok).map((r) => r.entry.id),
      );

      if (successIds.length > 0) {
        setDismissedSummaryApprovalIds((current) => {
          const next = new Set(current);
          for (const id of successIds) next.add(id);
          return next;
        });
        dispatchFulfillmentDataChanged({
          source: "command-hub",
          requestIds: successIds,
        });
        onActionCenterChanged?.();
      }

      if (failedRequestIds.length > 0) {
        // 网络失败：恢复原卡片并提示用户，避免静默丢失
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
        const titles = entries
          .filter((entry) => failedEntries.has(entry.id))
          .map((entry) => entry.title);
        for (const title of titles) {
          toast.error("审批未能保存，已恢复待处理", {
            description: `「${title}」网络异常，请重新操作`,
          });
        }
      }
    },
    [onActionCenterChanged],
  );

  const flushPendingUndoReviews = useCallback(() => {
    if (undoQueueRef.current.size === 0) return;
    const pending = Array.from(undoQueueRef.current.values());
    undoQueueRef.current.clear();
    setActiveUndoList([]);
    // 关闭弹窗/组件卸载/刷新时用 sendBeacon 可靠落库（fetch 在 unload 阶段不可靠）
    const url = "/api/exemptions/review";
    for (const entry of pending) {
      clearTimeout(entry.timerId);
      for (const requestId of entry.requestIds) {
        const body = JSON.stringify({ request_id: requestId, action: entry.action });
        const sent = typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
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
  }, []);

  useEffect(() => {
    const handlePageExit = () => {
      flushPendingUndoReviews();
    };
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

    // 乐观插回待审列表
    setPendingApprovals((current) => [
      ...restoreApprovalItems(current, pending.originalItems),
      ...current,
    ]);

    toast.success(`已撤回对「${pending.title}」的操作`);
  };

  const scheduleReviewWithUndo = (
    title: string,
    requestIds: string[],
    action: "approved" | "rejected",
    itemsToRemove: ExemptionRequest[],
  ) => {
    if (requestIds.length === 0) return;

    const undoId = `undo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 1. 立即从待审列表中移出（即时响应）
    const idSet = new Set(requestIds);
    setPendingApprovals((current) =>
      current.filter((item) => {
        const reqId = resolveApprovalRequestId(item);
        return !reqId || !idSet.has(reqId);
      }),
    );
    setSelectedApprovalIds((current) => {
      const next = new Set(current);
      for (const id of requestIds) next.delete(id);
      return next;
    });

    // 2. 设定 5 秒后静默落库
    const timerId = setTimeout(() => {
      undoQueueRef.current.delete(undoId);
      setActiveUndoList((current) => current.filter((item) => item.id !== undoId));
      void commitReview([
        { id: undoId, title, requestIds, action, originalItems: itemsToRemove },
      ]);
    }, 5000);

    undoQueueRef.current.set(undoId, {
      id: undoId,
      title,
      requestIds,
      action,
      originalItems: itemsToRemove,
      timerId,
    });

    // 3. 激活弹窗内悬浮撤回条
    setActiveUndoList((current) => [
      ...current,
      { id: undoId, title, action, remainingSeconds: 5 },
    ]);
  };

  const handleReviewGroup = async (
    group: GroupedApprovalItem,
    action: "approved" | "rejected",
  ) => {
    if (group.requestIds.length === 0) {
      toast.error("申请编号无效，刷新后再试");
      return;
    }
    const label = `${group.applicant_name} 的${group.nature === "leave" ? "请假" : "豁免"}`;
    scheduleReviewWithUndo(label, group.requestIds, action, group.items);
  };

  const handleReviewActionItem = async (
    item: ActionItem,
    action: "approved" | "rejected",
  ) => {
    if (!isReviewExemptionAction(item.action)) return;
    await submitExemptionReview(item.action.requestId, action);
  };

  const toggleGroupSelection = (group: GroupedApprovalItem, checked: boolean) => {
    setSelectedApprovalIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of group.requestIds) next.add(id);
      } else {
        for (const id of group.requestIds) next.delete(id);
      }
      return next;
    });
  };

  const groupedApprovals = useMemo(
    () => groupPendingApprovals(pendingApprovals),
    [pendingApprovals],
  );

  const handleBatchApproveApprovals = () => {
    if (selectedApprovalIds.size === 0) return;
    const idsArray = Array.from(selectedApprovalIds);
    const selectedItems = pendingApprovals.filter((item) => {
      const reqId = resolveApprovalRequestId(item);
      return reqId && selectedApprovalIds.has(reqId);
    });
    scheduleReviewWithUndo(
      `共 ${selectedItems.length} 份申请`,
      idsArray,
      "approved",
      selectedItems,
    );
  };

  const allApprovalIds = collectApprovalRequestIds(pendingApprovals);
  const allSelected =
    allApprovalIds.length > 0 &&
    allApprovalIds.every((id) => selectedApprovalIds.has(id));

  // Track recently completed todo IDs in the current session for smooth animations
  const [completedSessionIds, setCompletedSessionIds] = useState<string[]>([]);
  const [completedSessionTitles, setCompletedSessionTitles] = useState<
    Record<string, string>
  >({});
  const [todoProcessingId, setTodoProcessingId] = useState<string | null>(null);
  // Close drawer on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  // 已读但未完成的 todo 仍然属于行动项；只有 done/ignored 才从这里消失。
  const notificationActionItems = useMemo(() => {
    return notifications
      .filter((notification) =>
        notification.category === "todo"
        && (notification.status === "unread" || notification.status === "read"),
      )
      .map(buildNotificationActionItem);
  }, [notifications]);

  // summary 先到时先展示缓存；详细通知到达后，以通知行补全，并按 dedupeKey 合并。
  const todoItems = useMemo(() => {
    const liveKeys = new Set(notificationActionItems.map((item) => item.dedupeKey));
    const summaryItems = (summary?.topItems ?? []).filter(
      (item) => !isReviewExemptionAction(item.action) && !liveKeys.has(item.dedupeKey),
    );
    return sortActionItems([...notificationActionItems, ...summaryItems]).filter(
      (item) => !completedSessionIds.includes(item.id),
    );
  }, [completedSessionIds, notificationActionItems, summary]);

  const summaryApprovalItems = useMemo(
    () =>
      (summary?.topItems ?? []).filter(
        (item) =>
          isReviewExemptionAction(item.action) &&
          !dismissedSummaryApprovalIds.has(item.action.requestId),
      ),
    [dismissedSummaryApprovalIds, summary],
  );

  const getPriorityBadge = (priority: ActionItem["priority"]) => {
    switch (priority) {
      case "P0":
        return "bg-[#C0685C]/10 text-[#C0685C] border-transparent";
      case "P1":
        return "bg-[#D99E55]/10 text-[#8A6A2F] border-transparent";
      default:
        return "bg-[#FBF9F5] text-[#292524] border-[#ECE7DE]";
    }
  };

  const getSourceLabel = (source: ActionItem["source"]) => {
    switch (source) {
      case "permission":
        return "权限申请";
      case "exemption":
        return "归属 / 豁免";
      case "fulfillment":
        return "发布管理";
      case "ai":
        return "AI 风险";
      case "system":
        return "系统风险";
      default:
        return "通知行动项";
    }
  };

  const handleToggleTodo = async (todo: ActionItem) => {
    if (todo.source === "exemption") return;
    if (todoProcessingId) return;
    setTodoProcessingId(todo.id);
    const succeeded = await markDone(todo.id, "done");
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

  const todoTabCount = summary
    ? Math.max(0, summary.todoCount - summary.approvalCount)
    : todoItems.length;
  const approvalTabCount = summary?.approvalCount ?? pendingApprovals.length;
  const actionsLoading = loading || (summaryLoading && summary === null);
  const actionStateUnavailable = summaryError !== null && summary === null;

  // Keyboard shortcut for tab switching (1, 2, 3)
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if (!open) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (e.key === "1") {
        onTabChange("todos");
      } else if (e.key === "2" && isAdmin) {
        onTabChange("approvals");
      } else if (e.key === "3" && isAdmin) {
        onTabChange("history");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [open, isAdmin, onTabChange]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Subtle Backdrop to handle click outside seamlessly */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-40 bg-[#1C1917]/10 backdrop-blur-[1.5px]"
          />

          {/* Raycast / macOS style Topbar Command Popover */}
          <motion.div
            ref={drawerRef}
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "fixed right-4 top-[calc(var(--app-top-offset,64px)+0.5rem)] z-[60] flex w-[min(440px,calc(100vw-2rem))] max-h-[min(580px,calc(100dvh-var(--app-top-offset,64px)-1rem))] flex-col overflow-hidden rounded-2xl border border-[#ECE7DE] bg-[#FAF8F4] shadow-claude-float sm:right-6 lg:right-8 xl:right-[calc((100vw-80rem)/2+2rem)]",
              "max-md:inset-x-3 max-md:top-[calc(var(--app-top-offset,64px)+0.5rem)] max-md:w-auto",
            )}
          >
            {/* Header & Spring Segmented Controller */}
            <div className="shrink-0 border-b border-[#ECE7DE]/80 bg-[#FAF8F4] px-4 pt-3 pb-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-semibold text-[#1C1917] tracking-tight">
                      行动中枢
                    </h3>
                    {summaryLoading ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#78716C]">
                        <Loader2 className="size-2.5 animate-spin text-[#D97757]" />
                        同步中
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#78716C]/75 font-normal">
                        待办与审批
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void onRefreshSummary?.()}
                    disabled={summaryLoading || !onRefreshSummary}
                    aria-label="刷新行动中枢"
                    title="刷新行动中枢"
                    className="flex size-7 items-center justify-center rounded-lg text-[#78716C] transition-colors duration-150 hover:bg-[#F5F3EE] hover:text-[#1C1917] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RefreshCw className={cn("size-3.5 stroke-[1.8]", summaryLoading && "animate-spin")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="关闭行动中枢"
                    className="flex size-7 items-center justify-center rounded-lg text-[#78716C] transition-colors duration-150 hover:bg-[#F5F3EE] hover:text-[#1C1917]"
                  >
                    <X className="size-3.5 stroke-[1.9]" />
                  </button>
                </div>
              </div>

              {/* Segmented Controller & Status Indicators */}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-0.5 rounded-lg bg-[#F5F3EE] p-0.5 border border-[#ECE7DE]/50">
                  <button
                    type="button"
                    onClick={() => onTabChange("todos")}
                    className={cn(
                      "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition-colors duration-150 z-10 select-none cursor-pointer",
                      activeTab === "todos"
                        ? "text-[#1C1917] font-medium"
                        : "text-[#78716C] hover:text-[#292524]",
                    )}
                  >
                    {activeTab === "todos" && (
                      <motion.div
                        layoutId="commandHubTabIndicator"
                        className="absolute inset-0 rounded-md bg-white shadow-2xs border border-[#ECE7DE]/70 -z-10"
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 35,
                        }}
                      />
                    )}
                    <span>待办</span>
                    {todoTabCount > 0 && (
                      <span
                        className={cn(
                          "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                          activeTab === "todos"
                            ? "bg-[#D97757] text-white"
                            : "bg-[#E5E0D6] text-[#292524]",
                        )}
                      >
                        {todoTabCount > 99 ? "99+" : todoTabCount}
                      </span>
                    )}
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onTabChange("approvals")}
                      className={cn(
                        "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition-colors duration-150 z-10 select-none cursor-pointer",
                        activeTab === "approvals"
                          ? "text-[#1C1917] font-medium"
                          : "text-[#78716C] hover:text-[#292524]",
                      )}
                    >
                      {activeTab === "approvals" && (
                        <motion.div
                          layoutId="commandHubTabIndicator"
                          className="absolute inset-0 rounded-md bg-white shadow-2xs border border-[#ECE7DE]/70 -z-10"
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 35,
                          }}
                        />
                      )}
                      <span>审批</span>
                      {approvalTabCount > 0 && (
                        <span
                          className={cn(
                            "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                            activeTab === "approvals"
                              ? "bg-[#D97757] text-white"
                              : "bg-[#E5E0D6] text-[#292524]",
                          )}
                        >
                          {approvalTabCount > 99 ? "99+" : approvalTabCount}
                        </span>
                      )}
                    </button>
                  )}

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onTabChange("history")}
                      className={cn(
                        "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition-colors duration-150 z-10 select-none cursor-pointer",
                        activeTab === "history"
                          ? "text-[#1C1917] font-medium"
                          : "text-[#78716C] hover:text-[#292524]",
                      )}
                    >
                      {activeTab === "history" && (
                        <motion.div
                          layoutId="commandHubTabIndicator"
                          className="absolute inset-0 rounded-md bg-white shadow-2xs border border-[#ECE7DE]/70 -z-10"
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 35,
                          }}
                        />
                      )}
                      <span>已处理</span>
                      {historyApprovals.length > 0 && (
                        <span
                          className={cn(
                            "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                            activeTab === "history"
                              ? "bg-[#1C1917] text-white"
                              : "bg-[#E5E0D6] text-[#292524]",
                          )}
                        >
                          {historyApprovals.length > 99 ? "99+" : historyApprovals.length}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* Right: Urgent risk badge or calm status */}
                <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
                  {summary?.urgentCount ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#C0685C]/10 px-2 py-0.5 text-[11px] font-medium text-[#C0685C]">
                      <TriangleAlert className="size-3" />
                      {summary.urgentCount} 风险
                    </span>
                  ) : (
                    <span className="text-[#78716C] text-[11px]">
                      {activeTab === "todos"
                        ? `${todoTabCount} 项需处理`
                        : activeTab === "approvals"
                          ? `${approvalTabCount} 份待审批`
                          : `${historyApprovals.length} 份已处理`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {summaryError && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-xl border border-[#D99E55]/25 bg-[#D99E55]/[0.07] p-3 text-[11px] text-[#8A6A2F]"
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{summaryError}</p>
                    <p className="mt-0.5 leading-relaxed text-[#78716C]">
                      面板仍保留已缓存或已加载的事项。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onRefreshSummary?.()}
                    disabled={summaryLoading || !onRefreshSummary}
                    className="shrink-0 rounded-md px-1.5 py-1 font-medium text-[#8A6A2F] hover:bg-[#D99E55]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    重试
                  </button>
                </div>
              )}

              {/* APPROVALS TAB (待审列表) */}
              {activeTab === "approvals" && isAdmin && (
                <div className="space-y-2.5">
                  {/* Flat Action Toolbar: 全选与批量通过 */}
                  {pendingApprovals.length > 0 && (
                    <div className="flex items-center justify-between pb-0.5 px-0.5">
                      <div className="text-[12px] text-[#78716C] tabular-nums">
                        共 {pendingApprovals.length} 份待审批申请
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer rounded-md px-1.5 py-1 hover:bg-[#F5F3EE] transition-colors text-[11.5px] text-[#292524] select-none">
                          <Checkbox
                            checked={allSelected}
                            aria-label="全选"
                            onCheckedChange={(checked) => {
                              const nextChecked = Boolean(checked);
                              setSelectedApprovalIds(
                                nextChecked
                                  ? new Set(allApprovalIds)
                                  : new Set(),
                              );
                            }}
                            className="size-3.5 border-[#ECE7DE] rounded"
                          />
                          <span>全选</span>
                          {selectedApprovalIds.size > 0 && (
                            <span className="text-[11px] font-semibold text-[#1C1917] tabular-nums">
                              ({selectedApprovalIds.size})
                            </span>
                          )}
                        </label>

                        <button
                          type="button"
                          disabled={selectedApprovalIds.size === 0}
                          onClick={() => void handleBatchApproveApprovals()}
                          className={cn(
                            "inline-flex h-6.5 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium transition-all active:scale-[0.99] select-none",
                            selectedApprovalIds.size === 0
                              ? "cursor-not-allowed bg-[#F5F3EE] text-[#78716C]"
                              : "bg-[#D97757] text-white hover:bg-[#C46A4D] shadow-2xs",
                          )}
                        >
                          <Check className="size-3 stroke-[2.2]" />
                          <span>批量通过</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {approvalError && (
                    <div
                      role="alert"
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/[0.05] px-3 py-2 text-[11px] text-[#C0685C]"
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <TriangleAlert className="size-3.5 shrink-0" />
                        <span>{approvalError}，审批状态可能已变化。</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void fetchApprovals()}
                        disabled={approvalsLoading}
                        className="shrink-0 rounded-md px-1.5 py-1 font-medium hover:bg-[#C0685C]/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        重试
                      </button>
                    </div>
                  )}

                  {approvalsLoading && pendingApprovals.length === 0 ? (
                    <div className="space-y-2">
                      {summaryApprovalItems.length > 0 && (
                        <div className="rounded-xl border border-[#ECE7DE] bg-white/60 p-3">
                          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#78716C]">
                            <Loader2 className="size-3.5 animate-spin text-[#D97757]" />
                            <span>正在同步审批详情...</span>
                          </div>
                          <div className="space-y-2">
                            {summaryApprovalItems.map((item) => {
                              const reviewAction = item.action;
                              if (!isReviewExemptionAction(reviewAction)) return null;
                              const isProcessing = actionProcessing?.id === reviewAction.requestId;
                              return (
                                <div key={item.dedupeKey} className="rounded-lg border border-[#ECE7DE]/70 bg-white p-2.5 shadow-2xs">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-[12.5px] font-medium text-[#1C1917]">{item.title}</p>
                                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#78716C]">{item.description}</p>
                                    </div>
                                    <span className="shrink-0 rounded-md bg-[#D99E55]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#8A6A2F]">P1</span>
                                  </div>
                                  <div className="mt-2 flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      disabled={isProcessing}
                                      onClick={() => void handleReviewActionItem(item, "approved")}
                                      className="inline-flex h-6 items-center gap-1 rounded-md bg-[#6FAA7D]/15 px-2 text-[11px] font-medium text-[#2E5E3B] hover:bg-[#6FAA7D]/25 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.99]"
                                    >
                                      {isProcessing && actionProcessing?.action === "approved" ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                                      通过
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isProcessing}
                                      onClick={() => void handleReviewActionItem(item, "rejected")}
                                      className="inline-flex h-6 items-center gap-1 rounded-md bg-[#F5F3EE] px-2 text-[11px] font-medium text-[#78716C] hover:bg-[#C0685C]/10 hover:text-[#C0685C] disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.99]"
                                    >
                                      {isProcessing && actionProcessing?.action === "rejected" ? <Loader2 className="size-3 animate-spin" /> : null}
                                      拒绝
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {summaryApprovalItems.length === 0 && (
                        <div className="flex items-center justify-center gap-2 rounded-xl py-12 text-[12px] text-[#78716C]">
                          <Loader2 className="size-4 animate-spin text-[#D97757]" />
                          正在加载待审批申请...
                        </div>
                      )}
                    </div>
                  ) : pendingApprovals.length === 0 && (approvalError || actionStateUnavailable) ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-[#C0685C]/15 bg-[#C0685C]/[0.03] py-10 text-center">
                      <div className="mb-2.5 flex size-9 items-center justify-center rounded-xl bg-[#C0685C]/10 text-[#C0685C]">
                        <TriangleAlert className="size-4.5 stroke-[1.8]" />
                      </div>
                      <h3 className="text-[13px] font-medium text-[#1C1917]">
                        暂时无法确认审批状态
                      </h3>
                      <p className="mt-1 max-w-[240px] text-[11.5px] leading-relaxed text-[#78716C]">
                        请点击上方重试，确认当前范围内是否有待处理申请。
                      </p>
                    </div>
                  ) : pendingApprovals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl py-12 text-center">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-[#6FAA7D]/10 text-[#6FAA7D] mb-2.5">
                        <CheckCircle2 className="size-5 stroke-[1.9]" />
                      </div>
                      <h3 className="text-[13.5px] font-medium text-[#1C1917]">
                        暂无待审批申请
                      </h3>
                      <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-[#78716C]">
                        当前团队所有请假与豁免均已处理完毕。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {groupedApprovals.map((group) => {
                        const isSelected =
                          group.requestIds.length > 0 &&
                          group.requestIds.every((id) =>
                            selectedApprovalIds.has(id),
                          );
                        const isApproving =
                          group.requestIds.some(
                            (id) =>
                              actionProcessing?.id === id &&
                              actionProcessing.action === "approved",
                          );
                        const isRejecting =
                          group.requestIds.some(
                            (id) =>
                              actionProcessing?.id === id &&
                              actionProcessing.action === "rejected",
                          );
                        const hasInvalidId =
                          group.requestIds.length < group.items.length;

                        return (
                          <div
                            key={group.groupKey}
                            className={cn(
                              "group relative rounded-xl border p-3 transition-all duration-150 space-y-2",
                              isSelected
                                ? "border-[#D97757]/40 bg-[#FAF8F4] shadow-2xs"
                                : "border-[#ECE7DE]/70 bg-white/70 hover:bg-white hover:border-[#ECE7DE] hover:shadow-2xs",
                            )}
                          >
                            {/* Row 1: Checkbox + User Info + Nature Badge + Time */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Checkbox
                                  checked={isSelected}
                                  aria-label={`选择 ${group.applicant_name}`}
                                  disabled={group.requestIds.length === 0}
                                  onCheckedChange={(checked) => {
                                    toggleGroupSelection(
                                      group,
                                      Boolean(checked),
                                    );
                                  }}
                                  className="size-3.5 border-[#ECE7DE] rounded shrink-0"
                                />
                                <span className="truncate text-[13px] font-medium text-[#1C1917]">
                                  {group.applicant_name}
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium shrink-0",
                                    group.isPermanent
                                      ? "bg-[#E5E0D6] text-[#1C1917]"
                                      : group.nature === "leave"
                                        ? "bg-[#F5F3EE] text-[#292524]"
                                        : "bg-[#BCD1CA]/30 text-[#2E5E3B]",
                                  )}
                                >
                                  {group.categoryBadge}
                                </span>
                              </div>

                              <span className="shrink-0 text-[11px] text-[#78716C] tabular-nums">
                                {relativeTime(group.created_at)}
                              </span>
                            </div>

                            {/* Row 2: Department & Date */}
                            <div className="pl-5.5 text-[11.5px] text-[#78716C] tabular-nums">
                              {group.team_name || "未分组"} · {group.dateRangeText}
                            </div>

                            {/* Row 3: Reason Text in subtle paper container */}
                            <div className="pl-5.5 text-[12px] text-[#292524] leading-relaxed">
                              <div className="rounded-lg bg-[#FAF8F4] border border-[#ECE7DE]/50 px-2.5 py-1.5 text-[11.5px] text-[#292524] space-y-1">
                                <span className="text-[#78716C]">事由：</span>
                                {group.reasons.length > 0 ? (
                                  group.reasons.map((reason, idx) => (
                                    <p key={idx} className="leading-relaxed">
                                      {group.reasons.length > 1
                                        ? `${idx + 1}. ${reason}`
                                        : reason}
                                    </p>
                                  ))
                                ) : (
                                  <span className="text-[#78716C]">
                                    未填写事由
                                  </span>
                                )}
                              </div>
                            </div>

                            {hasInvalidId && (
                              <div className="pl-5.5 text-[11px] font-medium text-[#C0685C]">
                                部分申请编号异常，请刷新后再试
                              </div>
                            )}

                            {/* Row 4: Action Buttons in card bottom-right */}
                            <div className="flex items-center justify-end gap-1.5 pt-0.5">
                              <button
                                type="button"
                                disabled={
                                  group.requestIds.length === 0 ||
                                  group.requestIds.some(
                                    (id) => actionProcessing?.id === id,
                                  )
                                }
                                onClick={() =>
                                  void handleReviewGroup(group, "approved")
                                }
                                className="inline-flex h-6.5 items-center gap-1 rounded-md bg-[#6FAA7D]/15 px-2.5 text-[11.5px] font-medium text-[#2E5E3B] transition-all hover:bg-[#6FAA7D]/25 active:scale-[0.99] active:duration-120 disabled:cursor-not-allowed disabled:opacity-40 select-none cursor-pointer"
                              >
                                {isApproving ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Check className="size-3 stroke-[2.2]" />
                                )}
                                <span>通过</span>
                              </button>

                              <button
                                type="button"
                                disabled={
                                  group.requestIds.length === 0 ||
                                  group.requestIds.some(
                                    (id) => actionProcessing?.id === id,
                                  )
                                }
                                onClick={() =>
                                  void handleReviewGroup(group, "rejected")
                                }
                                className="inline-flex h-6.5 items-center gap-1 rounded-md bg-[#F5F3EE] px-2 text-[11.5px] font-medium text-[#78716C] transition-all hover:bg-[#C0685C]/10 hover:text-[#C0685C] active:scale-[0.99] active:duration-120 disabled:cursor-not-allowed disabled:opacity-40 select-none cursor-pointer"
                              >
                                {isRejecting ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : null}
                                <span>拒绝</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* HISTORY TAB (已处理历史) */}
              {activeTab === "history" && isAdmin && (
                <div className="space-y-2.5">
                  {historyError && (
                    <div
                      role="alert"
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/[0.05] px-3 py-2 text-[11px] text-[#C0685C]"
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <TriangleAlert className="size-3.5 shrink-0" />
                        <span>{historyError}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void fetchHistoryApprovals()}
                        disabled={historyLoading}
                        className="shrink-0 rounded-md px-1.5 py-1 font-medium hover:bg-[#C0685C]/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        重试
                      </button>
                    </div>
                  )}

                  {historyLoading && historyApprovals.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 rounded-xl py-12 text-[12px] text-[#78716C]">
                      <Loader2 className="size-4 animate-spin text-[#D97757]" />
                      正在加载已处理历史...
                    </div>
                  ) : historyApprovals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl py-12 text-center">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-[#6FAA7D]/10 text-[#6FAA7D] mb-2.5">
                        <CheckCircle2 className="size-5 stroke-[1.9]" />
                      </div>
                      <h3 className="text-[13.5px] font-medium text-[#1C1917]">
                        暂无已处理历史
                      </h3>
                      <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-[#78716C]">
                        历史审批记录将在此保存，支持随时修改决定。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {historyApprovals.map((item) => {
                        const reqId = resolveApprovalRequestId(item);
                        const isApproved = item.request_status === "approved";
                        const isProcessing = Boolean(reqId && actionProcessing?.id === reqId);
                        const isPermanent = item.exemption_type === "permanent";
                        const exemptionCategory = toExemptionCategory(item.exemption_category);
                        const nature = normalizeExemptionCategoryForDisplay(exemptionCategory);
                        const categoryLabel = getExemptionCategoryLabel(exemptionCategory);
                        const dateText = isPermanent
                          ? "永久生效"
                          : item.end_date && item.end_date !== item.start_date
                            ? `${formatShortDate(item.start_date)} 至 ${formatShortDate(item.end_date)}`
                            : formatShortDate(item.start_date);

                        return (
                          <div
                            key={reqId || item.id}
                            className="rounded-xl border border-[#ECE7DE]/70 bg-white/70 hover:bg-white hover:border-[#ECE7DE] p-3 transition-all duration-150 space-y-2 shadow-2xs"
                          >
                            {/* Row 1: Applicant Name + Status Badge + Reviewed Time */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="truncate text-[13px] font-medium text-[#1C1917]">
                                  {item.applicant_name || "成员"}
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium shrink-0",
                                    isApproved
                                      ? "bg-[#6FAA7D]/15 text-[#2E5E3B]"
                                      : "bg-[#F5F3EE] text-[#78716C]",
                                  )}
                                >
                                  {isApproved ? "已通过" : "已拒绝"}
                                </span>
                                <span className="text-[11px] text-[#78716C]">
                                  {nature === "leave" ? "请假" : categoryLabel}
                                </span>
                              </div>

                              <span className="shrink-0 text-[11px] text-[#78716C] tabular-nums">
                                {item.reviewed_at ? relativeTime(item.reviewed_at) : relativeTime(item.created_at)}
                              </span>
                            </div>

                            {/* Row 2: Department & Date */}
                            <div className="text-[11.5px] text-[#78716C] tabular-nums">
                              {item.team_name || "未分组"} · {dateText}
                            </div>

                            {/* Row 3: Reviewer note if present */}
                            {item.reviewed_by_name && (
                              <div className="text-[11px] text-[#78716C]/85">
                                由 {item.reviewed_by_name} 审批
                              </div>
                            )}

                            {/* Row 4: Reason */}
                            {item.reason && (
                              <div className="rounded-lg bg-[#FAF8F4] border border-[#ECE7DE]/50 px-2.5 py-1.5 text-[11.5px] text-[#292524]">
                                <span className="text-[#78716C]">事由：</span>
                                <span>{item.reason}</span>
                              </div>
                            )}

                            {/* Row 5: Action Button to Re-Review / Modify Decision */}
                            <div className="flex items-center justify-end gap-1.5 pt-0.5">
                              {isApproved ? (
                                <button
                                  type="button"
                                  disabled={isProcessing || !reqId}
                                  onClick={() => void handleModifyReviewDecision(item, "rejected")}
                                  className="inline-flex h-6.5 items-center gap-1 rounded-md bg-[#F5F3EE] px-2.5 text-[11.5px] font-medium text-[#78716C] transition-all hover:bg-[#C0685C]/10 hover:text-[#C0685C] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 select-none cursor-pointer"
                                >
                                  {isProcessing && actionProcessing?.action === "rejected" ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : null}
                                  <span>改为拒绝</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isProcessing || !reqId}
                                  onClick={() => void handleModifyReviewDecision(item, "approved")}
                                  className="inline-flex h-6.5 items-center gap-1 rounded-md bg-[#6FAA7D]/15 px-2.5 text-[11.5px] font-medium text-[#2E5E3B] transition-all hover:bg-[#6FAA7D]/25 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 select-none cursor-pointer"
                                >
                                  {isProcessing && actionProcessing?.action === "approved" ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Check className="size-3 stroke-[2.2]" />
                                  )}
                                  <span>改为通过</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TODOS TAB */}
              {activeTab === "todos" && (
                <div className="space-y-2.5">
                  {/* Header Flat Toolbar */}
                  <div className="flex items-center justify-between pb-0.5 px-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-medium text-[#1C1917]">
                        待办与跟进
                      </span>
                      <span className="inline-flex items-center rounded-full bg-[#F5F3EE] px-1.5 py-0.2 text-[10.5px] font-medium text-[#78716C] tabular-nums">
                        {todoTabCount}
                      </span>
                    </div>

                    <span className="text-[10.5px] text-[#78716C]">
                      处理完成后自动消失
                    </span>
                  </div>

                  {actionsLoading && todoItems.length === 0 && (
                    <div className="py-12 text-center text-[12px] text-[#78716C] animate-pulse">
                      正在加载行动项...
                    </div>
                  )}

                  {/* Action Items List */}
                  {!actionsLoading && todoItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div
                        className={cn(
                          "mb-2.5 flex size-10 items-center justify-center rounded-xl",
                          actionStateUnavailable
                            ? "bg-[#C0685C]/10 text-[#C0685C]"
                            : "bg-[#6FAA7D]/10 text-[#6FAA7D]",
                        )}
                      >
                        {actionStateUnavailable ? (
                          <TriangleAlert className="size-5 stroke-[1.8]" />
                        ) : (
                          <CheckCircle2 className="size-5 stroke-[1.9]" />
                        )}
                      </div>
                      <h3 className="text-[13.5px] font-medium text-[#1C1917]">
                        {actionStateUnavailable ? "暂时无法确认待办状态" : "今日待办已全部完成"}
                      </h3>
                      <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-[#78716C]">
                        {actionStateUnavailable
                          ? "请点击上方重试，确认最新的待办与风险。"
                          : "当前范围内没有需要处理的待办或风险。"}
                      </p>
                    </div>
                  ) : todoItems.length > 0 ? (
                    <div className="space-y-2">
                      <AnimatePresence initial={false}>
                        {todoItems.map((todo) => {
                          const isCritical = todo.priority === "P0";
                          const isWarning = todo.priority === "P1";
                          const canMarkDone = todo.source !== "exemption";
                          const isProcessing = todoProcessingId === todo.id;
                          return (
                            <motion.div
                              key={todo.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{
                                opacity: 0,
                                x: -20,
                                height: 0,
                                marginBottom: 0,
                                padding: 0,
                              }}
                              transition={{
                                type: "spring",
                                stiffness: 500,
                                damping: 30,
                              }}
                              className={cn(
                                "group flex items-start gap-2.5 rounded-xl border p-3 transition-all duration-150",
                                isCritical
                                  ? "border-[#C0685C]/30 bg-white/85 hover:border-[#C0685C]/60 hover:shadow-2xs"
                                  : isWarning
                                    ? "border-[#D99E55]/30 bg-white/80 hover:border-[#D99E55]/60 hover:shadow-2xs"
                                    : "border-[#ECE7DE]/70 bg-white/70 hover:bg-white hover:border-[#ECE7DE] hover:shadow-2xs",
                              )}
                            >
                              {canMarkDone ? (
                                <button
                                  type="button"
                                  onClick={() => void handleToggleTodo(todo)}
                                  disabled={Boolean(todoProcessingId)}
                                  aria-label={`标记完成：${todo.title}`}
                                  className="mt-0.5 shrink-0 text-[#78716C] transition-colors outline-none hover:text-[#D97757] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isProcessing ? (
                                    <Loader2 className="size-4 animate-spin text-[#D97757]" />
                                  ) : (
                                    <Circle className="size-4 stroke-[1.8] hover:stroke-[#D97757]" />
                                  )}
                                </button>
                              ) : (
                                <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[#B98A54]">
                                  <TriangleAlert className="size-3.5" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span
                                    className={cn(
                                      "inline-flex px-1.5 py-0.2 rounded text-[10px] font-medium tracking-wide",
                                      getPriorityBadge(todo.priority),
                                    )}
                                  >
                                    {isCritical
                                      ? "P0 紧急"
                                      : isWarning
                                        ? "P1 待处理"
                                        : "P2 常规"}
                                  </span>
                                  <span className="text-[11px] text-[#78716C] tabular-nums">
                                    {getSourceLabel(todo.source)} · {relativeTime(todo.createdAt)}
                                  </span>
                                </div>
                                <h4 className="text-[12.5px] font-medium text-[#1C1917] leading-snug mt-1">
                                  {todo.title}
                                </h4>
                                {todo.description && (
                                  <p className="text-[11.5px] text-[#78716C] leading-relaxed mt-0.5">
                                    {todo.description}
                                  </p>
                                )}

                                {todo.actionUrl && (
                                  <div className="mt-2 flex items-center justify-end gap-1.5">
                                    <Link
                                      href={todo.actionUrl}
                                      onClick={() => {
                                        if (todo.source !== "exemption") void markRead(todo.id);
                                        onOpenChange(false);
                                      }}
                                      className="inline-flex h-6 items-center gap-1 rounded-md bg-[#D97757]/10 px-2 text-[11px] font-medium text-[#D97757] hover:bg-[#D97757]/15 transition-colors select-none"
                                    >
                                      <span>{todo.actionLabel}</span>
                                      <ArrowRight className="size-2.5 stroke-[2]" />
                                    </Link>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  ) : null}

                  {/* Completed List (in this session) */}
                  {completedSessionIds.length > 0 && (
                    <div className="pt-2 border-t border-[#ECE7DE]/80">
                      <div className="text-[11px] font-medium text-[#78716C] mb-1.5 px-0.5">
                        本次已完成 ({completedSessionIds.length})
                      </div>
                      <div className="space-y-1.5 opacity-75">
                        {completedSessionIds.map((id) => (
                          <div
                            key={id}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-[#F5F3EE]/60 border border-[#ECE7DE]/50"
                          >
                            <span className="text-[#6FAA7D] shrink-0">
                              <CheckCircle2 className="size-3.5 stroke-[2]" />
                            </span>
                            <span className="text-[11.5px] font-normal text-[#78716C] line-through truncate flex-1">
                              {completedSessionTitles[id] || "完成的待办事项"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* In-Hub Floating Undo Banner */}
            <AnimatePresence>
              {activeUndoList.length > 0 && (
                <motion.div
                  key="undo-banner"
                  initial={{ opacity: 0, y: 14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 450, damping: 30 }}
                  className="absolute bottom-11 inset-x-3 z-30 overflow-hidden rounded-xl border border-[#38332F] bg-[#1C1917]/95 backdrop-blur-md p-2.5 text-[#FAF8F4] shadow-xl"
                >
                  {/* 5s Linear Progress Bar */}
                  <motion.div
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: 5, ease: "linear" }}
                    className="absolute top-0 left-0 h-0.5 bg-[#D97757]"
                  />

                  <div className="space-y-1.5 px-0.5 pt-0.5">
                    {activeUndoList.map((activeUndo) => (
                      <div
                        key={activeUndo.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="size-1.5 rounded-full bg-[#6FAA7D] shrink-0 animate-pulse" />
                          <span className="truncate text-[12px] font-medium text-white/90">
                            {activeUndo.action === "approved" ? "已通过" : "已拒绝"} {activeUndo.title}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleUndo(activeUndo.id)}
                          className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-[#D97757] px-2.5 py-1 text-[11.5px] font-semibold text-white shadow-2xs hover:bg-[#C0685C] active:scale-95 transition-all select-none cursor-pointer"
                        >
                          <RotateCcw className="size-3 stroke-[2.4]" />
                          <span>撤回 ({activeUndo.remainingSeconds}s)</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer summary & shortcut bar */}
            <div className="shrink-0 flex items-center justify-between border-t border-[#ECE7DE]/80 bg-[#FAF8F4] px-4 py-2 text-[11px] text-[#78716C]">
              <span className="font-normal">处理结果实时同步至业务页</span>
              <div className="hidden sm:flex items-center gap-2 tabular-nums text-[10px] text-[#78716C]">
                <span className="inline-flex items-center gap-1 bg-[#F5F3EE] border border-[#ECE7DE] px-1.5 py-0.5 rounded-md">
                  <kbd className="font-sans">1-3</kbd> 切换
                </span>
                <span className="inline-flex items-center gap-1 bg-[#F5F3EE] border border-[#ECE7DE] px-1.5 py-0.5 rounded-md">
                  <kbd className="font-sans">Esc</kbd> 收起
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
