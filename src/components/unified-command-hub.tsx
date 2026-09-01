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
  resolveApprovalRequestId,
} from "@/lib/exemption-approvals";
import {
  dispatchFulfillmentDataChanged,
  FULFILLMENT_DATA_CHANGED_EVENT,
  type FulfillmentDataChangedDetail,
} from "@/lib/fulfillment-sync";

interface ExemptionRequest {
  id: string;
  request_id?: string | null;
  applicant_user_id: string;
  applicant_name: string | null;
  team_id: string | null;
  team_name: string | null;
  exemption_type: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  request_status: "pending" | "approved" | "rejected";
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const EXEMPTION_LABELS: Record<string, string> = {
  single: "请假1天",
  yesterday: "补昨日请假",
  "3days": "请假3天",
  "4days": "请假4天",
  "5days": "请假5天",
  range: "自定义范围",
  permanent: "永久豁免",
};

interface UnifiedCommandHubProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: "todos" | "approvals";
  onTabChange: (tab: "todos" | "approvals") => void;
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
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<Set<string>>(
    new Set(),
  );
  const [actionProcessing, setActionProcessing] = useState<{
    id: string;
    action: "approved" | "rejected";
  } | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);

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

  useEffect(() => {
    if (!isAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 权限变化时清空审批队列与勾选
      setPendingApprovals([]);
      setSelectedApprovalIds(new Set());
      return;
    }
    if (open && activeTab === "approvals") {
      void fetchApprovals();
    }
  }, [activeTab, fetchApprovals, isAdmin, open]);

  useEffect(() => {
    const handleFulfillmentDataChanged = (event: Event) => {
      const detail = (event as CustomEvent<FulfillmentDataChangedDetail>).detail;
      if (detail?.source === "fulfillment-calendar") void fetchApprovals();
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
  }, [fetchApprovals]);

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

  const handleReviewApproval = async (
    item: ExemptionRequest,
    action: "approved" | "rejected",
  ) => {
    const requestId = resolveApprovalRequestId(item);
    if (!requestId) {
      toast.error("申请编号无效，刷新后再试");
      return;
    }
    await submitExemptionReview(requestId, action);
  };

  const handleReviewActionItem = async (
    item: ActionItem,
    action: "approved" | "rejected",
  ) => {
    if (!isReviewExemptionAction(item.action)) return;
    await submitExemptionReview(item.action.requestId, action);
  };

  const handleBatchApproveApprovals = async () => {
    if (selectedApprovalIds.size === 0) return;
    setBatchProcessing(true);
    const idsArray = Array.from(selectedApprovalIds);
    try {
      const results = await Promise.all(
        idsArray.map(async (id) => {
          try {
            const res = await fetch("/api/exemptions/review", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ request_id: id, action: "approved" }),
            });
            return { id, ok: res.ok };
          } catch (error) {
            console.error(error);
            return { id, ok: false };
          }
        }),
      );
      const successIds = results.filter((result) => result.ok).map((result) => result.id);
      const failedIds = results.filter((result) => !result.ok).map((result) => result.id);
      const failCount = failedIds.length;

      if (successIds.length > 0) {
        setPendingApprovals((current) => {
          const successful = new Set(successIds);
          const next = current.filter((item) => {
            const requestId = resolveApprovalRequestId(item);
            return !requestId || !successful.has(requestId);
          });
          return next;
        });
        setDismissedSummaryApprovalIds((current) => {
          const next = new Set(current);
          for (const id of successIds) next.add(id);
          return next;
        });
        setSelectedApprovalIds(new Set(failedIds));
        dispatchFulfillmentDataChanged({
          source: "command-hub",
          requestIds: successIds,
        });
        onActionCenterChanged?.();
      }
      if (failCount > 0) {
        toast.warning(`有 ${failCount} 条审批未能保存，已保留待重试`);
      }
    } catch {
      toast.error("未能完成批量审批，请重试");
    } finally {
      setBatchProcessing(false);
    }
  };

  const toggleApprovalSelection = (id: string, checked: boolean) => {
    setSelectedApprovalIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
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
  const [dismissedSummaryApprovalIds, setDismissedSummaryApprovalIds] = useState<
    Set<string>
  >(new Set());

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
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [open, isAdmin, onTabChange]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Invisible Backdrop to handle click outside seamlessly */}
          <div
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-40 bg-transparent"
          />

          {/* Raycast / macOS style Topbar Command Popover */}
          <motion.div
            ref={drawerRef}
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "fixed right-4 top-[calc(var(--app-top-offset,64px)+0.5rem)] z-[60] flex w-[min(440px,calc(100vw-2rem))] max-h-[min(580px,calc(100dvh-var(--app-top-offset,64px)-1rem))] flex-col overflow-hidden rounded-2xl border bg-[#FAF8F4] shadow-claude-float sm:right-6 lg:right-8 xl:right-[calc((100vw-80rem)/2+2rem)]",
              "max-md:inset-x-2 max-md:top-[calc(var(--app-top-offset,64px)+0.25rem)] max-md:w-auto",
              "border-[#E5E0D6]",
            )}
          >
            {/* Header & Spring Segmented Controller */}
            <div className="shrink-0 border-b border-[#ECE7DE] bg-[#FBF9F5]/80 px-3.5 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold tracking-tight text-[#1C1917]">
                      行动中枢
                    </span>
                    {summaryLoading && (
                      <span className="text-[10px] text-[#78716C]">同步中</span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[#78716C]">
                    只显示需要你处理的事
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void onRefreshSummary?.()}
                    disabled={summaryLoading || !onRefreshSummary}
                    aria-label="刷新行动中枢"
                    title="刷新行动中枢"
                    className="flex size-7 items-center justify-center rounded-lg text-[#78716C] transition-colors hover:bg-[#E5E0D6]/60 hover:text-[#292524] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className={cn("size-3.5", summaryLoading && "animate-spin")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="关闭行动中枢"
                    className="flex size-7 items-center justify-center rounded-lg text-[#78716C] transition-colors duration-100 hover:bg-[#E5E0D6]/60 hover:text-[#292524]"
                  >
                    <X className="size-3.5 stroke-[2]" />
                  </button>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#78716C] tabular-nums">
                <span className="rounded-md bg-[#F5F3EE] px-1.5 py-0.5">
                  待处理 {todoTabCount}
                </span>
                <span className="rounded-md bg-[#F5F3EE] px-1.5 py-0.5">
                  审批 {approvalTabCount}
                </span>
                {summary?.urgentCount ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#C0685C]/10 px-1.5 py-0.5 text-[#C0685C]">
                    <TriangleAlert className="size-3" />
                    风险 {summary.urgentCount}
                  </span>
                ) : null}
              </div>

              {/* Spring Segmented Tab Bar */}
              <div className="mt-2 flex w-fit items-center gap-0.5 rounded-lg border border-[#E5E0D6]/60 bg-[#F5F3EE] p-0.5">
                <button
                  type="button"
                  onClick={() => onTabChange("todos")}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition-colors duration-150 z-10",
                    activeTab === "todos"
                      ? "text-[#1C1917] font-medium"
                      : "text-[#78716C] hover:text-[#292524] font-medium",
                  )}
                >
                  {activeTab === "todos" && (
                    <motion.div
                      layoutId="popoverSegmentedTab"
                      className="absolute inset-0 rounded-md bg-white border border-[#E5E0D6]/80 shadow-2xs -z-10"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 35,
                      }}
                    />
                  )}
                  <span>待办</span>
                  {todoTabCount > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D97757] px-1 text-[10px] font-medium text-white tabular-nums">
                      {todoTabCount > 99 ? "99+" : todoTabCount}
                    </span>
                  )}
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onTabChange("approvals")}
                    className={cn(
                    "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition-colors duration-150 z-10",
                    activeTab === "approvals"
                      ? "text-[#1C1917] font-medium"
                      : "text-[#78716C] hover:text-[#292524] font-medium",
                    )}
                  >
                    {activeTab === "approvals" && (
                      <motion.div
                        layoutId="popoverSegmentedTab"
                        className="absolute inset-0 rounded-md bg-white border border-[#E5E0D6]/80 shadow-2xs -z-10"
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 35,
                        }}
                      />
                    )}
                    <span>审批</span>
                    {approvalTabCount > 0 && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D97757] px-1 text-[10px] font-medium text-white tabular-nums">
                        {approvalTabCount > 99 ? "99+" : approvalTabCount}
                      </span>
                    )}
                  </button>
                )}
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

              {/* APPROVALS TAB */}
              {activeTab === "approvals" && isAdmin && (
                <div className="space-y-3">
                  {/* Header Flat Toolbar */}
                  <div className="flex items-center justify-between pb-1 px-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[#1C1917]">
                        需要处理的审批
                      </span>
                      <span className="inline-flex items-center rounded-full bg-[#F5F3EE] px-2 py-0.5 text-[11px] font-medium text-[#292524] tabular-nums">
                        {approvalTabCount} 条
                      </span>
                    </div>

                    {pendingApprovals.length > 0 && (
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer rounded-lg px-2 py-1 hover:bg-[#F5F3EE] transition-colors text-[12px] text-[#292524] select-none">
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
                            className="size-3.5 border-[#E5E0D6] rounded"
                          />
                          <span>全选</span>
                          {selectedApprovalIds.size > 0 && (
                            <span className="text-[11px] font-medium text-[#1C1917] tabular-nums">
                              ({selectedApprovalIds.size})
                            </span>
                          )}
                        </label>

                        <button
                          type="button"
                          disabled={
                            selectedApprovalIds.size === 0 || batchProcessing
                          }
                          onClick={() => void handleBatchApproveApprovals()}
                          className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium transition-all",
                            selectedApprovalIds.size === 0 || batchProcessing
                              ? "cursor-not-allowed bg-[#F5F3EE] text-[#78716C]"
                              : "bg-[#D97757] text-white hover:bg-[#C96442] shadow-xs active:scale-[0.99] active:duration-120",
                          )}
                        >
                          {batchProcessing ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Check className="size-3 stroke-[2.2]" />
                          )}
                          <span>批量通过</span>
                        </button>
                      </div>
                    )}
                  </div>

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
                        <div className="rounded-xl border border-[#E5E0D6]/70 bg-[#FBF9F5]/50 p-3">
                          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#78716C]">
                            <Loader2 className="size-3.5 animate-spin text-[#D97757]" />
                            <span>先展示缓存，正在同步审批详情...</span>
                          </div>
                          <div className="space-y-2">
                            {summaryApprovalItems.map((item) => {
                              const reviewAction = item.action;
                              if (!isReviewExemptionAction(reviewAction)) return null;
                              const isProcessing = actionProcessing?.id === reviewAction.requestId;
                              return (
                                <div key={item.dedupeKey} className="rounded-lg border border-[#E5E0D6]/60 bg-white/70 p-2.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-[12px] font-semibold text-[#1C1917]">{item.title}</p>
                                      <p className="mt-0.5 text-[11px] leading-relaxed text-[#78716C]">{item.description}</p>
                                    </div>
                                    <span className="shrink-0 rounded-md bg-[#D99E55]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#8A6A2F]">P1</span>
                                  </div>
                                  <div className="mt-2 flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      disabled={isProcessing || batchProcessing}
                                      onClick={() => void handleReviewActionItem(item, "approved")}
                                      className="inline-flex h-6.5 items-center gap-1 rounded-lg bg-[#6FAA7D]/10 px-2.5 text-[11px] font-medium text-[#1C1917] hover:bg-[#6FAA7D]/20 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {isProcessing && actionProcessing?.action === "approved" ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                                      通过
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isProcessing || batchProcessing}
                                      onClick={() => void handleReviewActionItem(item, "rejected")}
                                      className="inline-flex h-6.5 items-center gap-1 rounded-lg bg-[#F5F3EE] px-2 text-[11px] font-medium text-[#292524] hover:bg-[#C0685C]/10 hover:text-[#C0685C] disabled:cursor-not-allowed disabled:opacity-40"
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
                      <div className="mb-2.5 flex size-10 items-center justify-center rounded-xl bg-[#C0685C]/10 text-[#C0685C]">
                        <TriangleAlert className="size-5 stroke-[1.8]" />
                      </div>
                      <h3 className="text-[13px] font-medium text-[#1C1917]">
                        暂时无法确认审批状态
                      </h3>
                      <p className="mt-1 max-w-[240px] text-[12px] leading-relaxed text-[#78716C]">
                        请点击上方重试，确认当前范围内是否有待处理申请。
                      </p>
                    </div>
                  ) : pendingApprovals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl py-12 text-center">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-[#6FAA7D]/10 text-[#6FAA7D] mb-2.5">
                        <CheckCircle2 className="size-5 stroke-[2]" />
                      </div>
                      <h3 className="text-[13px] font-medium text-[#1C1917]">
                        还没有待审的豁免
                      </h3>
                      <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-[#78716C]">
                        当前范围内没有待审批。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pendingApprovals.map((item) => {
                        const requestId = resolveApprovalRequestId(item);
                        const rowKey =
                          requestId ??
                          item.request_id ??
                          item.id ??
                          `${item.applicant_user_id}-${item.created_at}`;
                        const isSelected = requestId
                          ? selectedApprovalIds.has(requestId)
                          : false;
                        const isApproving =
                          requestId != null &&
                          actionProcessing?.id === requestId &&
                          actionProcessing.action === "approved";
                        const isRejecting =
                          requestId != null &&
                          actionProcessing?.id === requestId &&
                          actionProcessing.action === "rejected";
                        return (
                          <div
                            key={rowKey}
                            className={cn(
                              "group relative rounded-xl border p-3 transition-colors duration-100 space-y-1.5",
                              isSelected
                                ? "border-[#D97757]/40 bg-[#D97757]/[0.03] shadow-xs"
                                : "border-[#E5E0D6]/70 bg-[#FBF9F5]/50 hover:bg-white hover:border-[#E5E0D6] hover:shadow-xs",
                            )}
                          >
                            {/* Row 1: Checkbox + User Info + Type Tag + Time */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Checkbox
                                  checked={isSelected}
                                  aria-label={`选择 ${item.applicant_name || "未命名成员"}`}
                                  disabled={!requestId}
                                  onCheckedChange={(checked) => {
                                    if (!requestId) return;
                                    toggleApprovalSelection(
                                      requestId,
                                      Boolean(checked),
                                    );
                                  }}
                                  className="size-3.5 border-[#E5E0D6] rounded shrink-0"
                                />
                                <span className="truncate text-[13px] font-semibold text-[#1C1917]">
                                  {item.applicant_name || "未命名成员"}
                                </span>
                                <span className="inline-flex items-center rounded-md bg-[#E5E0D6]/70 px-1.5 py-0.5 text-[11px] font-medium text-[#292524] shrink-0">
                                  {EXEMPTION_LABELS[item.exemption_type] || item.exemption_type}
                                </span>
                              </div>

                              <span className="shrink-0 text-[11px] text-[#78716C] tabular-nums">
                                {relativeTime(item.created_at)}
                              </span>
                            </div>

                            {/* Row 2: Department & Date */}
                            <div className="pl-5.5 text-[11px] text-[#78716C] tabular-nums">
                              {item.team_name || "未分组"} · {item.start_date}
                              {item.end_date ? ` 至 ${item.end_date}` : ""}
                            </div>

                            {/* Row 3: Reason Text */}
                            <div className="pl-5.5 text-[12px] text-[#292524] leading-relaxed">
                              <span className="text-[#78716C]">原因：</span>
                              {item.reason?.trim() || "未填写原因"}
                            </div>

                            {!requestId && (
                              <div className="pl-5.5 text-[11px] font-medium text-[#DC2626]">
                                申请编号异常，请刷新后再试
                              </div>
                            )}

                            {/* Row 4: Action Buttons in card bottom-right */}
                            <div className="flex items-center justify-end gap-1.5 pt-0.5">
                              <button
                                type="button"
                                disabled={
                                  !requestId ||
                                  batchProcessing ||
                                  actionProcessing?.id === requestId
                                }
                                onClick={() =>
                                  void handleReviewApproval(item, "approved")
                                }
                                className="inline-flex h-6.5 items-center gap-1 rounded-lg bg-[#6FAA7D]/10 px-2.5 text-[11px] font-medium text-[#1C1917] transition-all hover:bg-[#6FAA7D]/20 active:scale-[0.99] active:duration-120 disabled:cursor-not-allowed disabled:opacity-40"
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
                                  !requestId ||
                                  batchProcessing ||
                                  actionProcessing?.id === requestId
                                }
                                onClick={() =>
                                  void handleReviewApproval(item, "rejected")
                                }
                                className="inline-flex h-6.5 items-center gap-1 rounded-lg bg-[#F5F3EE] px-2 text-[11px] font-medium text-[#292524] transition-all hover:bg-[#C0685C]/10 hover:text-[#C0685C] active:scale-[0.99] active:duration-120 disabled:cursor-not-allowed disabled:opacity-40"
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

              {/* TODOS TAB */}
              {activeTab === "todos" && (
                <div className="space-y-3">
                  {/* Header Flat Toolbar */}
                  <div className="flex items-center justify-between pb-1 px-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[#1C1917]">
                        待办与风险
                      </span>
                      <span className="inline-flex items-center rounded-full bg-[#F5F3EE] px-2 py-0.5 text-[11px] font-medium text-[#292524] tabular-nums">
                        {todoTabCount} 条
                      </span>
                    </div>

                    {summary && (
                      <span className="text-[10px] text-[#78716C]">已按优先级排序</span>
                    )}
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
                          <CheckCircle2 className="size-5 stroke-[2]" />
                        )}
                      </div>
                      <h3 className="text-[13px] font-medium text-[#1C1917]">
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
                                x: -30,
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
                                "group flex items-start gap-2.5 rounded-xl border p-3 transition-all",
                                isCritical
                                  ? "border-l-[3px] border-l-[#DC2626] border-[#E5E0D6]/80 bg-rose-50/[0.15] hover:bg-white hover:border-[#E5E0D6] hover:shadow-xs"
                                  : isWarning
                                    ? "border-l-[3px] border-l-[#D99E55] border-[#E5E0D6]/80 bg-amber-50/[0.1] hover:bg-white hover:border-[#E5E0D6] hover:shadow-xs"
                                    : "border-[#E5E0D6]/70 bg-[#FBF9F5]/50 hover:bg-white hover:border-[#E5E0D6] hover:shadow-xs",
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
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <Circle className="size-4 stroke-[1.8]" />
                                  )}
                                </button>
                              ) : (
                                <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-[#D99E55]">
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
                                      ? "P0 风险"
                                      : isWarning
                                        ? "P1 待处理"
                                        : "P2 常规"}
                                  </span>
                                  <span className="text-[11px] text-[#78716C] tabular-nums">
                                    {getSourceLabel(todo.source)} · {relativeTime(todo.createdAt)}
                                  </span>
                                </div>
                                <h4 className="text-[12px] font-semibold text-[#1C1917] leading-snug mt-1">
                                  {todo.title}
                                </h4>
                                {todo.description && (
                                  <p className="text-[11px] text-[#78716C] leading-relaxed mt-0.5">
                                    {todo.description}
                                  </p>
                                )}

                                {todo.actionUrl && (
                                  <div className="mt-2 flex items-center justify-end">
                                    <Link
                                      href={todo.actionUrl}
                                      onClick={() => {
                                        if (todo.source !== "exemption") void markRead(todo.id);
                                        onOpenChange(false);
                                      }}
                                      className="inline-flex h-6 items-center gap-1 rounded-md bg-[#D97757]/10 px-2 text-[11px] font-medium text-[#D97757] hover:bg-[#D97757]/20 transition-colors"
                                    >
                                      <span>{todo.actionLabel}</span>
                                      <ArrowRight className="size-2.5" />
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
                    <div className="pt-2 border-t border-[#ECE7DE]">
                      <div className="text-[11px] font-semibold text-[#78716C] mb-1 px-0.5">
                        已完成 ({completedSessionIds.length})
                      </div>
                      <div className="space-y-1.5 opacity-70">
                        {completedSessionIds.map((id) => (
                          <div
                            key={id}
                            className="flex items-center gap-2 rounded-lg p-2 bg-[#FBF9F5] border border-[#E5E0D6]/50"
                          >
                            <span className="text-[#6FAA7D] shrink-0">
                              <CheckCircle2 className="size-3.5 fill-[#6FAA7D] text-white" />
                            </span>
                            <span className="text-[11px] font-medium text-[#78716C] line-through truncate flex-1">
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

            {/* Footer summary & shortcut bar */}
            <div className="shrink-0 flex items-center justify-between border-t border-[#ECE7DE] bg-[#FBF9F5]/80 px-4 py-2 text-[11px] text-[#78716C]">
              <span className="font-normal">行动项处理结果会同步到业务页</span>
              <div className="hidden sm:flex items-center gap-2 tabular-nums text-[10px] text-[#78716C]">
                <span className="inline-flex items-center gap-1 bg-[#E5E0D6]/60 px-1.5 py-0.5 rounded-md">
                  <kbd className="font-sans">1-2</kbd> 切换页签
                </span>
                <span className="inline-flex items-center gap-1 bg-[#E5E0D6]/60 px-1.5 py-0.5 rounded-md">
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
