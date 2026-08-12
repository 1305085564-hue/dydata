"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Check,
  CheckCircle2,
  Circle,
  ArrowRight,
  Trash2,
  CalendarDays,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  useNotifications,
  AnyNotificationRow,
} from "./notifications/notification-store";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  collectApprovalRequestIds,
  resolveApprovalRequestId,
} from "@/lib/exemption-approvals";

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
  pendingApprovalsCount?: number;
  onPendingCountChange?: (count: number) => void;
}

export function UnifiedCommandHub({
  open,
  onOpenChange,
  activeTab,
  onTabChange,
  isAdmin,
  pendingApprovalsCount = 0,
  onPendingCountChange,
}: UnifiedCommandHubProps) {
  const { notifications, loading, markRead, markAllRead, markDone } =
    useNotifications();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Approvals State
  const [approvalsLoading, setApprovalsLoading] = useState(false);
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
    try {
      const res = await fetch("/api/exemptions/pending", { cache: "no-store" });
      if (!res.ok) throw new Error("pending approvals fetch failed");
      const json = await res.json();
      const data = json.data ?? [];
      const count = typeof json.count === "number" ? json.count : data.length;
      const validRequestIds = new Set(collectApprovalRequestIds(data));
      setPendingApprovals(data);
      setSelectedApprovalIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(
          Array.from(prev).filter((id) => validRequestIds.has(id)),
        );
        return next;
      });
      onPendingCountChange?.(count);
    } catch (err) {
      console.error("Failed to fetch approvals:", err);
    } finally {
      setApprovalsLoading(false);
    }
  }, [isAdmin, onPendingCountChange]);

  useEffect(() => {
    if (!isAdmin) {
      setPendingApprovals([]);
      setSelectedApprovalIds(new Set());
      onPendingCountChange?.(0);
      return;
    }
    if (open && activeTab === "approvals") {
      void fetchApprovals();
    }
  }, [activeTab, fetchApprovals, isAdmin, onPendingCountChange, open]);

  const handleReviewApproval = async (
    item: ExemptionRequest,
    action: "approved" | "rejected",
  ) => {
    const requestId = resolveApprovalRequestId(item);
    if (!requestId) {
      toast.error("操作失败", { description: "申请编号异常，请刷新后重试" });
      return;
    }

    setActionProcessing({ id: requestId, action });
    try {
      const res = await fetch("/api/exemptions/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, action }),
      });
      if (res.ok) {
        toast.success(action === "approved" ? "审批已通过" : "审批已拒绝");
        await fetchApprovals();
      } else {
        const json = await res.json();
        toast.error("操作失败", { description: json.error || "未知原因" });
      }
    } catch {
      toast.error("网络异常，请重试");
    } finally {
      setActionProcessing(null);
    }
  };

  const handleBatchApproveApprovals = async () => {
    if (selectedApprovalIds.size === 0) return;
    setBatchProcessing(true);
    const idsArray = Array.from(selectedApprovalIds);
    let successCount = 0;
    let failCount = 0;
    try {
      await Promise.all(
        idsArray.map(async (id) => {
          try {
            const res = await fetch("/api/exemptions/review", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ request_id: id, action: "approved" }),
            });
            if (res.ok) {
              successCount++;
            } else {
              failCount++;
            }
          } catch (e) {
            console.error(e);
            failCount++;
          }
        }),
      );
      toast.success("批量通过完成", {
        description:
          failCount > 0
            ? `成功 ${successCount} 条，失败 ${failCount} 条`
            : `成功通过 ${successCount} 条申请`,
      });
      await fetchApprovals();
    } catch {
      toast.error("批量操作失败，请重试");
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

  // Click outside to close
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
      onOpenChange(false);
    }
  };

  // Filter dynamic lists
  const activeTodos = notifications.filter(
    (n) => n.category === "todo" && n.status === "unread",
  );

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-[#DC2626]/10 text-[#DC2626] border-transparent ";
      case "warning":
        return "bg-[#F59E0B]/10 text-[#B45309] border-transparent/50 ";
      case "success":
        return "bg-[#16A34A]/10 text-[#16A34A] border-transparent ";
      default:
        return "bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-500 border-zinc-200 dark:border-zinc-800";
    }
  };

  const handleToggleTodo = (todo: AnyNotificationRow) => {
    // Record title for session completed visual feedback
    setCompletedSessionTitles((prev) => ({
      ...prev,
      [todo.id]: todo.title,
    }));
    setCompletedSessionIds((prev) => [...prev, todo.id]);

    // Call real DB API to mark as completed
    void markDone(todo.id, "done");
  };

  const relativeTime = (iso: string) => {
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return "";
    const diff = Date.now() - ts;
    const hr = Math.floor(diff / 3_600_000);
    if (hr < 24) return `${hr} 小时前`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day} 天前`;
    return new Date(iso).toLocaleDateString("zh-CN", {
      month: "numeric",
      day: "numeric",
    });
  };

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
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "absolute right-0 top-full mt-2 z-50 flex w-[420px] max-h-[580px] flex-col overflow-hidden rounded-2xl border bg-white/95 shadow-2xl shadow-zinc-900/12 backdrop-blur-2xl ring-1 ring-black/5",
              "border-zinc-200",
            )}
          >
            {/* Header & Spring Segmented Controller */}
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 bg-zinc-50/70 px-3 py-2">
              {/* Spring Segmented Tab Bar */}
              <div className="flex items-center gap-0.5 rounded-xl bg-zinc-200/60 p-0.5">
                <button
                  type="button"
                  onClick={() => onTabChange("todos")}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition-colors duration-150 z-10",
                    activeTab === "todos"
                      ? "text-zinc-950 font-semibold"
                      : "text-zinc-500 hover:text-zinc-800 font-medium",
                  )}
                >
                  {activeTab === "todos" && (
                    <motion.div
                      layoutId="popoverSegmentedTab"
                      className="absolute inset-0 rounded-lg bg-white shadow-sm ring-1 ring-black/5 -z-10"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 35,
                      }}
                    />
                  )}
                  <span>待办</span>
                  {activeTodos.length > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D97757] px-1 text-[10px] font-medium text-white tabular-nums">
                      {activeTodos.length}
                    </span>
                  )}
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onTabChange("approvals")}
                    className={cn(
                      "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition-colors duration-150 z-10",
                      activeTab === "approvals"
                        ? "text-zinc-950 font-semibold"
                        : "text-zinc-500 hover:text-zinc-800 font-medium",
                    )}
                  >
                    {activeTab === "approvals" && (
                      <motion.div
                        layoutId="popoverSegmentedTab"
                        className="absolute inset-0 rounded-lg bg-white shadow-sm ring-1 ring-black/5 -z-10"
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 35,
                        }}
                      />
                    )}
                    <span>审批</span>
                    {pendingApprovalsCount > 0 && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D97757] px-1 text-[10px] font-medium text-white tabular-nums">
                        {pendingApprovalsCount}
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="关闭"
                  className="flex size-6.5 items-center justify-center rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-950 transition-all duration-150"
                >
                  <X className="size-3.5 stroke-[1.8]" />
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* APPROVALS TAB */}
              {activeTab === "approvals" && isAdmin && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[12px] font-medium uppercase tracking-[0.22em] text-zinc-500">
                          待审申请
                        </div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-[24px] font-semibold tabular-nums text-zinc-900">
                            {pendingApprovals.length}
                          </span>
                          <span className="text-[12px] font-medium text-zinc-500">
                            条待处理
                          </span>
                        </div>
                      </div>

                      {pendingApprovals.length > 0 && (
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5">
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
                              className="border-zinc-300"
                            />
                            <span className="text-[12px] font-medium text-zinc-700">
                              全选
                            </span>
                            <span className="text-[12px] font-medium text-zinc-900">
                              {selectedApprovalIds.size}
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={
                              selectedApprovalIds.size === 0 || batchProcessing
                            }
                            onClick={() => void handleBatchApproveApprovals()}
                            className={cn(
                              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors",
                              selectedApprovalIds.size === 0 || batchProcessing
                                ? "cursor-not-allowed bg-zinc-100 text-zinc-500"
                                : "bg-[#D97757] text-white hover:bg-[#C96442]",
                            )}
                          >
                            {batchProcessing ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Check className="size-3.5 stroke-[2]" />
                            )}
                            批量通过
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {approvalsLoading && pendingApprovals.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/70 py-12 text-[12px] text-zinc-500">
                      <Loader2 className="size-4 animate-spin text-[#D97757]" />
                      正在加载待审批申请...
                    </div>
                  ) : pendingApprovals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/70 py-12 text-center">
                      <CheckCircle2 className="mb-2 size-8 text-[#6FAA7D]" />
                      <h3 className="text-[12px] font-medium text-zinc-900">
                        暂无待审豁免
                      </h3>
                      <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-zinc-500">
                        当前没有新的豁免申请，审批队列已经清空。
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
                              "group rounded-2xl border border-zinc-200 bg-white p-4 transition-colors",
                              isSelected &&
                                "border-[#D97757]/50 bg-[#D97757]/[0.03]",
                            )}
                          >
                            <div className="flex items-start gap-3">
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
                                className="mt-0.5 border-zinc-300"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="truncate text-[12px] font-medium text-zinc-900">
                                        {item.applicant_name || "未命名成员"}
                                      </span>
                                      <span className="inline-flex shrink-0 rounded-full bg-[#D99E55]/10 px-2 py-0.5 text-[12px] font-medium text-[#D99E55]">
                                        {EXEMPTION_LABELS[
                                          item.exemption_type
                                        ] || item.exemption_type}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-[12px] text-zinc-500">
                                      {item.team_name || "未分组"} ·{" "}
                                      <span className="tabular-nums text-zinc-500">
                                        {item.start_date}
                                        {item.end_date
                                          ? ` 至 ${item.end_date}`
                                          : ""}
                                      </span>
                                    </div>
                                  </div>

                                  <span className="shrink-0 text-[12px] text-zinc-500">
                                    {relativeTime(item.created_at)}
                                  </span>
                                </div>

                                <p className="mt-2 line-clamp-1 rounded-lg bg-zinc-50 px-2.5 py-2 text-[12px] text-zinc-700">
                                  原因：{item.reason?.trim() || "未填写原因"}
                                </p>
                                {!requestId ? (
                                  <p className="mt-2 text-[12px] font-medium text-[#C9604D]">
                                    申请编号异常，请刷新后再试
                                  </p>
                                ) : null}
                              </div>

                              <div className="ml-3 flex shrink-0 flex-col items-end justify-center gap-1">
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
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[#6FAA7D] transition-colors hover:bg-[#6FAA7D]/10 disabled:cursor-not-allowed disabled:text-zinc-500"
                                >
                                  {isApproving ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Check className="size-3.5 stroke-[2]" />
                                  )}
                                  通过
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
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[#C9604D] transition-colors hover:bg-[#C9604D]/10 disabled:cursor-not-allowed disabled:text-zinc-500"
                                >
                                  {isRejecting ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : null}
                                  拒绝
                                </button>
                              </div>
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
                <div className="space-y-4">
                  {/* 日常发布管理入口 (管理员专有，高频日常运营，弱化顶部导航后的入口分流) */}
                  {isAdmin && (
                    <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm transition-all hover:shadow-md hover:border-zinc-300">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 items-center justify-center rounded-lg bg-[#F59E0B]/10 text-[#D97757] ">
                            <CalendarDays className="size-4 text-[#D97757]" />
                          </div>
                          <div>
                            <h4 className="text-[12px] font-medium text-zinc-900 dark:text-zinc-100 leading-tight">
                              日常发布管理
                            </h4>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                              查看团队成员作品交档与申诉处理
                            </p>
                          </div>
                        </div>
                        <Link
                          href="/admin/fulfillment"
                          onClick={() => onOpenChange(false)}
                          className="inline-flex h-7 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 text-[12px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-white transition-all active:scale-95 shrink-0"
                        >
                          <span>进入</span>
                          <ArrowRight className="size-3 ml-1" />
                        </Link>
                      </div>
                    </div>
                  )}

                  {loading && activeTodos.length === 0 && (
                    <div className="py-12 text-center text-[12px] text-zinc-500 animate-pulse">
                      正在加载待办事项...
                    </div>
                  )}

                  {/* Active Todos List */}
                  {!loading && activeTodos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-[#E7E5E4] mb-3 shadow-inner">
                        <CheckCircle2 className="size-6 text-[#16A34A]" />
                      </div>
                      <h3 className="text-[12px] font-medium text-zinc-900 dark:text-[#FAFAF9]">
                        今日待办已全部完成
                      </h3>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-500 mt-1 max-w-[200px] leading-relaxed">
                        团队目前没有未处理的违规审核或履约卡点，状态良好。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[12px] font-medium text-zinc-500 dark:text-zinc-500 mb-1">
                        进行中 ({activeTodos.length})
                      </div>
                      <AnimatePresence initial={false}>
                        {activeTodos.map((todo) => (
                          <motion.div
                            key={todo.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{
                              opacity: 0,
                              x: -50,
                              height: 0,
                              marginBottom: 0,
                            }}
                            transition={{
                              type: "spring",
                              stiffness: 500,
                              damping: 30,
                            }}
                            className={cn(
                              "group flex items-start gap-3 rounded-xl border p-3.5 bg-white dark:bg-zinc-900 transition-colors",
                              "border-zinc-200 dark:border-zinc-800",
                            )}
                          >
                            <button
                              onClick={() => handleToggleTodo(todo)}
                              aria-label={`标记完成：${todo.title}`}
                              className="mt-0.5 text-zinc-500 hover:text-[#D97757] transition-colors shrink-0 outline-none"
                            >
                              <Circle className="size-4" />
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={cn(
                                    "inline-flex border px-1.5 py-0.5 rounded text-[12px] font-medium uppercase tracking-wider",
                                    getSeverityBadge(todo.severity),
                                  )}
                                >
                                  {todo.severity === "critical"
                                    ? "P0 急需"
                                    : todo.severity === "warning"
                                      ? "P1 高优"
                                      : "P2 常规"}
                                </span>
                                <span className="text-[12px] text-zinc-500 dark:text-zinc-500 flex items-center gap-1">
                                  <CalendarDays className="size-2.5" />
                                  截止于 {relativeTime(todo.created_at)}
                                </span>
                              </div>
                              <h4 className="text-[12px] font-medium text-zinc-900 dark:text-zinc-50 leading-tight mt-1.5">
                                {todo.title}
                              </h4>
                              {todo.body && (
                                <p className="text-[12px] text-zinc-500 dark:text-zinc-500 leading-normal mt-1">
                                  {todo.body}
                                </p>
                              )}

                              {todo.action_url && (
                                <div className="mt-2.5 flex items-center justify-end">
                                  <Link
                                    href={todo.action_url}
                                    onClick={() => {
                                      if (todo.status === "unread")
                                        void markRead(todo.id);
                                      onOpenChange(false);
                                    }}
                                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[#D97757] hover:opacity-85 transition-opacity"
                                  >
                                    {todo.action_label || "立即处理"}
                                    <ArrowRight className="size-3" />
                                  </Link>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Completed List (in this session) */}
                  {completedSessionIds.length > 0 && (
                    <div className="pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
                      <div className="text-[12px] font-medium text-zinc-500 dark:text-zinc-500 mb-2">
                        已完成 ({completedSessionIds.length})
                      </div>
                      <div className="space-y-1.5 opacity-60">
                        {completedSessionIds.map((id) => (
                          <div
                            key={id}
                            className="flex items-center gap-3 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 p-2.5 bg-zinc-100/50 dark:bg-zinc-900/30"
                          >
                            <span className="text-[#16A34A] shrink-0">
                              <CheckCircle2 className="size-4 fill-[#16A34A] text-white" />
                            </span>
                            <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-500 line-through truncate flex-1">
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
            <div className="shrink-0 flex items-center justify-between border-t border-zinc-100 bg-zinc-50/70 px-4 py-2.5 text-[11px] text-zinc-400">
              <span className="font-normal">待处理提醒已同步至团队控制台</span>
              <div className="hidden sm:flex items-center gap-2 tabular-nums text-[10px] text-zinc-400">
                <span className="inline-flex items-center gap-1 bg-zinc-200/60 px-1.5 py-0.5 rounded-md">
                  <kbd className="font-sans">1-2</kbd> 切换页签
                </span>
                <span className="inline-flex items-center gap-1 bg-zinc-200/60 px-1.5 py-0.5 rounded-md">
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
