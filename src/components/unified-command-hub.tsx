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
  Inbox,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useNotifications, isLocalNotification, AnyNotificationRow } from "./notifications/notification-store";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { collectApprovalRequestIds, resolveApprovalRequestId } from "@/lib/exemption-approvals";

interface ExemptionRequest {
  id: string;
  request_id?: string | null;
  applicant_user_id: string;
  applicant_name: string | null;
  team_id: string | null;
  team_name: string | null;
  group_id: string | null;
  group_name: string | null;
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
  activeTab: "todos" | "approvals" | "notifications";
  onTabChange: (tab: "todos" | "approvals" | "notifications") => void;
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
  const { notifications, loading, markRead, markAllRead, markDone } = useNotifications();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Approvals State
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<ExemptionRequest[]>([]);
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<Set<string>>(new Set());
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
        const next = new Set(Array.from(prev).filter((id) => validRequestIds.has(id)));
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

  const handleReviewApproval = async (item: ExemptionRequest, action: "approved" | "rejected") => {
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
        })
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
  const allSelected = allApprovalIds.length > 0 && allApprovalIds.every((id) => selectedApprovalIds.has(id));
  
  // Track recently completed todo IDs in the current session for smooth animations
  const [completedSessionIds, setCompletedSessionIds] = useState<string[]>([]);
  const [completedSessionTitles, setCompletedSessionTitles] = useState<Record<string, string>>({});

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
  const activeTodos = notifications.filter((n) => n.category === "todo" && n.status === "unread");
  const alerts = notifications.filter((n) => n.category !== "todo");

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200/50 dark:border-rose-900/30";
      case "warning":
        return "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/30";
      case "success":
        return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-250 dark:border-emerald-900/30";
      default:
        return "bg-stone-50 text-stone-700 dark:bg-stone-900 dark:text-stone-500 border-stone-200 dark:border-stone-800";
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
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "刚刚";
    if (min < 60) return `${min} 分钟前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} 小时前`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day} 天前`;
    return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleOverlayClick}
            className="absolute inset-0 bg-stone-950/40 dark:bg-stone-950/60 backdrop-blur-sm"
          />

          {/* Drawer Sidebar */}
          <motion.div
            ref={drawerRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className={cn(
              "relative flex h-full w-full max-w-[460px] flex-col border-l bg-stone-50 dark:bg-stone-950 shadow-xl",
              "border-stone-200 dark:border-stone-800"
            )}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b bg-white dark:bg-stone-900 px-5 py-4 border-stone-200 dark:border-stone-800">
              <div>
                <div className="text-[12px] font-medium tracking-widest text-[#B4532F] uppercase">
                  Command Hub
                </div>
                <h2 className="text-[13px] font-medium text-stone-900 dark:text-white tracking-tight mt-0.5">
                  智能工作中心
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {activeTab === "notifications" && alerts.some((n) => n.status === "unread") && (
                  <button
                    onClick={() => void markAllRead()}
                    className="text-[12px] font-medium text-stone-500 hover:text-stone-900 dark:text-stone-500 dark:hover:text-white px-2 py-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                  >
                    全部已读
                  </button>
                )}
                <button
                  onClick={() => onOpenChange(false)}
                  aria-label="关闭"
                  className="flex size-7 items-center justify-center rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white transition-all duration-200"
                >
                  <X className="size-4 stroke-[1.8]" />
                </button>
              </div>
            </div>

            {/* Tab switch navigation */}
            <div className="flex shrink-0 border-b border-stone-200 dark:border-stone-800 px-5 bg-white dark:bg-stone-900">
              <button
                onClick={() => onTabChange("todos")}
                className={cn(
                  "relative py-3 text-[12px] font-medium transition-colors duration-200 mr-6",
                  activeTab === "todos" ? "text-stone-900 dark:text-white" : "text-stone-500 hover:text-stone-700"
                )}
              >
                今日待办
                {activeTodos.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-[#D97757]/10 dark:bg-[#D97757]/20 text-[#B4532F] px-1.5 py-0.5 text-[12px] font-medium">
                    {activeTodos.length}
                  </span>
                )}
                {activeTab === "todos" && (
                  <motion.div
                    layoutId="commandHubActiveTabIndicator"
                    className="absolute bottom-0 inset-x-0 h-0.5 bg-[#D97757]"
                  />
                )}
              </button>

              {isAdmin && (
                <button
                  onClick={() => onTabChange("approvals")}
                  className={cn(
                    "relative py-3 text-[12px] font-medium transition-colors duration-200 mr-6",
                    activeTab === "approvals" ? "text-stone-900 dark:text-white" : "text-stone-500 hover:text-stone-700"
                  )}
                >
                  豁免审批
                  {pendingApprovalsCount > 0 && (
                    <span className="ml-1.5 rounded-full bg-[#D97757]/10 dark:bg-[#D97757]/20 text-[#B4532F] px-1.5 py-0.5 text-[12px] font-medium">
                      {pendingApprovalsCount}
                    </span>
                  )}
                  {activeTab === "approvals" && (
                    <motion.div
                      layoutId="commandHubActiveTabIndicator"
                      className="absolute bottom-0 inset-x-0 h-0.5 bg-[#D97757]"
                    />
                  )}
                </button>
              )}

              <button
                onClick={() => onTabChange("notifications")}
                className={cn(
                  "relative py-3 text-[12px] font-medium transition-colors duration-200",
                  activeTab === "notifications" ? "text-stone-900 dark:text-white" : "text-stone-500 hover:text-stone-700"
                )}
              >
                系统动态
                {alerts.filter((n) => n.status === "unread").length > 0 && (
                  <span className="ml-1.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 text-[12px] font-medium">
                    {alerts.filter((n) => n.status === "unread").length}
                  </span>
                )}
                {activeTab === "notifications" && (
                  <motion.div
                    layoutId="commandHubActiveTabIndicator"
                    className="absolute bottom-0 inset-x-0 h-0.5 bg-[#D97757]"
                  />
                )}
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* APPROVALS TAB */}
              {activeTab === "approvals" && isAdmin && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[12px] font-medium uppercase tracking-[0.22em] text-stone-500">
                          待审申请
                        </div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-[24px] font-medium tabular-nums text-stone-900">
                            {pendingApprovals.length}
                          </span>
                          <span className="text-[12px] font-medium text-stone-500">
                            条待处理
                          </span>
                        </div>
                      </div>

                      {pendingApprovals.length > 0 && (
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5">
                            <Checkbox
                              checked={allSelected}
                              aria-label="全选"
                              onCheckedChange={(checked) => {
                                const nextChecked = Boolean(checked);
                                setSelectedApprovalIds(nextChecked ? new Set(allApprovalIds) : new Set());
                              }}
                              className="border-stone-300"
                            />
                            <span className="text-[12px] font-medium text-stone-700">
                              全选
                            </span>
                            <span className="text-[12px] font-medium text-stone-900">
                              {selectedApprovalIds.size}
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={selectedApprovalIds.size === 0 || batchProcessing}
                            onClick={() => void handleBatchApproveApprovals()}
                            className={cn(
                              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors",
                              selectedApprovalIds.size === 0 || batchProcessing
                                ? "cursor-not-allowed bg-stone-100 text-stone-500"
                                : "bg-[#B4532F] text-white hover:bg-[#A84D2B]"
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
                    <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-200 bg-stone-50/70 py-12 text-[12px] text-stone-500">
                      <Loader2 className="size-4 animate-spin text-[#B4532F]" />
                      正在加载待审批申请...
                    </div>
                  ) : pendingApprovals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/70 py-12 text-center">
                      <CheckCircle2 className="mb-2 size-8 text-[#3F7A4E]" />
                      <h3 className="text-[12px] font-medium text-stone-900">
                        暂无待审豁免
                      </h3>
                      <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-stone-500">
                        当前没有新的豁免申请，审批队列已经清空。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pendingApprovals.map((item) => {
                        const requestId = resolveApprovalRequestId(item);
                        const rowKey = requestId ?? item.request_id ?? item.id ?? `${item.applicant_user_id}-${item.created_at}`;
                        const isSelected = requestId ? selectedApprovalIds.has(requestId) : false;
                        const isApproving =
                          requestId != null && actionProcessing?.id === requestId && actionProcessing.action === "approved";
                        const isRejecting =
                          requestId != null && actionProcessing?.id === requestId && actionProcessing.action === "rejected";
                        return (
                          <div
                            key={rowKey}
                            className={cn(
                              "group rounded-2xl border border-stone-200 bg-white p-4 transition-colors",
                              isSelected && "border-[#D97757]/50 bg-[#D97757]/[0.03]"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={isSelected}
                                aria-label={`选择 ${item.applicant_name || "未命名成员"}`}
                                disabled={!requestId}
                                onCheckedChange={(checked) => {
                                  if (!requestId) return;
                                  toggleApprovalSelection(requestId, Boolean(checked));
                                }}
                                className="mt-0.5 border-stone-300"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="truncate text-[12px] font-medium text-stone-900">
                                        {item.applicant_name || "未命名成员"}
                                      </span>
                                      <span className="inline-flex shrink-0 rounded-full bg-[#D99E55]/10 px-2 py-0.5 text-[12px] font-medium text-[#8F641B]">
                                        {EXEMPTION_LABELS[item.exemption_type] || item.exemption_type}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-[12px] text-stone-500">
                                      {item.group_name || item.team_name || "未分组"} ·{" "}
                                      <span className="tabular-nums text-stone-500">
                                        {item.start_date}
                                        {item.end_date ? ` 至 ${item.end_date}` : ""}
                                      </span>
                                    </div>
                                  </div>

                                  <span className="shrink-0 text-[12px] text-stone-500">
                                    {relativeTime(item.created_at)}
                                  </span>
                                </div>

                                <p className="mt-2 line-clamp-1 rounded-lg bg-stone-50 px-2.5 py-2 text-[12px] text-stone-700">
                                  原因：{item.reason?.trim() || "未填写原因"}
                                </p>
                                {!requestId ? (
                                  <p className="mt-2 text-[12px] font-medium text-[#B24E3E]">
                                    申请编号异常，请刷新后再试
                                  </p>
                                ) : null}
                              </div>

                              <div className="ml-3 flex shrink-0 flex-col items-end justify-center gap-1">
                                <button
                                  type="button"
                                  disabled={!requestId || batchProcessing || actionProcessing?.id === requestId}
                                  onClick={() => void handleReviewApproval(item, "approved")}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[#3F7A4E] transition-colors hover:bg-[#6FAA7D]/10 disabled:cursor-not-allowed disabled:text-stone-500"
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
                                  disabled={!requestId || batchProcessing || actionProcessing?.id === requestId}
                                  onClick={() => void handleReviewApproval(item, "rejected")}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[#B24E3E] transition-colors hover:bg-[#C9604D]/10 disabled:cursor-not-allowed disabled:text-stone-500"
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
                    <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm transition-all hover:shadow-md hover:border-stone-300">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-[#B4532F] dark:bg-amber-950/20">
                            <CalendarDays className="size-4 text-[#B4532F]" />
                          </div>
                          <div>
                            <h4 className="text-[12px] font-medium text-stone-900 dark:text-stone-100 leading-tight">日常发布管理</h4>
                            <p className="text-[11px] text-stone-500 mt-0.5">查看团队成员作品交档与申诉处理</p>
                          </div>
                        </div>
                        <Link
                          href="/admin/fulfillment"
                          onClick={() => onOpenChange(false)}
                          className="inline-flex h-7 items-center justify-center rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 px-3 text-[12px] font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-950 dark:hover:text-white transition-all active:scale-95 shrink-0"
                        >
                          <span>进入</span>
                          <ArrowRight className="size-3 ml-1" />
                        </Link>
                      </div>
                    </div>
                  )}

                  {loading && activeTodos.length === 0 && (
                    <div className="py-12 text-center text-[12px] text-stone-500 animate-pulse">
                      正在加载待办事项...
                    </div>
                  )}

                  {/* Active Todos List */}
                  {!loading && activeTodos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-900 text-stone-500 dark:text-[#E7E5E4] mb-3 shadow-inner">
                        <CheckCircle2 className="size-6 text-emerald-500" />
                      </div>
                      <h3 className="text-[12px] font-medium text-stone-900 dark:text-[#FAFAF9]">
                        今日待办已全部完成
                      </h3>
                      <p className="text-[12px] text-stone-500 dark:text-stone-500 mt-1 max-w-[200px] leading-relaxed">
                        团队目前没有未处理的违规审核或履约卡点，状态良好。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[12px] font-medium text-stone-500 dark:text-stone-500 mb-1">
                        进行中 ({activeTodos.length})
                      </div>
                      <AnimatePresence initial={false}>
                        {activeTodos.map((todo) => (
                          <motion.div
                            key={todo.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -50, height: 0, marginBottom: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            className={cn(
                              "group flex items-start gap-3 rounded-xl border p-3.5 bg-white dark:bg-stone-900 transition-colors",
                              "border-stone-200/80 dark:border-stone-800"
                            )}
                          >
                            <button
                              onClick={() => handleToggleTodo(todo)}
                              aria-label={`标记完成：${todo.title}`}
                              className="mt-0.5 text-stone-500 hover:text-[#B4532F] transition-colors shrink-0 outline-none"
                            >
                              <Circle className="size-4" />
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={cn(
                                  "inline-flex border px-1.5 py-0.5 rounded text-[12px] font-medium uppercase tracking-wider",
                                  getSeverityBadge(todo.severity)
                                )}>
                                  {todo.severity === "critical" ? "P0 急需" : todo.severity === "warning" ? "P1 高优" : "P2 常规"}
                                </span>
                                <span className="text-[12px] text-stone-500 dark:text-stone-500 flex items-center gap-1">
                                  <CalendarDays className="size-2.5" />
                                  截止于 {relativeTime(todo.created_at)}
                                </span>
                              </div>
                              <h4 className="text-[12px] font-medium text-stone-900 dark:text-stone-50 leading-tight mt-1.5">
                                {todo.title}
                              </h4>
                              {todo.body && (
                                <p className="text-[12px] text-stone-500 dark:text-stone-500 leading-normal mt-1">
                                  {todo.body}
                                </p>
                              )}
                              
                              {todo.action_url && (
                                <div className="mt-2.5 flex items-center justify-end">
                                  <Link
                                    href={todo.action_url}
                                    onClick={() => {
                                      if (todo.status === "unread") void markRead(todo.id);
                                      onOpenChange(false);
                                    }}
                                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[#B4532F] hover:opacity-85 transition-opacity"
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
                    <div className="pt-2 border-t border-stone-200/50 dark:border-stone-800/50">
                      <div className="text-[12px] font-medium text-stone-500 dark:text-stone-500 mb-2">
                        已完成 ({completedSessionIds.length})
                      </div>
                      <div className="space-y-1.5 opacity-60">
                        {completedSessionIds.map((id) => (
                          <div
                            key={id}
                            className="flex items-center gap-3 rounded-lg border border-dashed border-stone-200 dark:border-stone-800 p-2.5 bg-stone-100/50 dark:bg-stone-900/30"
                          >
                            <span className="text-emerald-500 shrink-0">
                              <CheckCircle2 className="size-4 fill-emerald-500 text-white" />
                            </span>
                            <span className="text-[12px] font-medium text-stone-500 dark:text-stone-500 line-through truncate flex-1">
                              {completedSessionTitles[id] || "完成的待办事项"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* NOTIFICATIONS TAB */}
              {activeTab === "notifications" && (
                <div className="space-y-4">
                  {loading && alerts.length === 0 && (
                    <div className="py-12 text-center text-[12px] text-stone-500 animate-pulse">
                      正在读取系统动态...
                    </div>
                  )}

                  {!loading && alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-900 text-stone-500 dark:text-[#E7E5E4] mb-3 shadow-inner">
                        <Inbox className="size-6 text-stone-500" />
                      </div>
                      <h3 className="text-[12px] font-medium text-stone-900 dark:text-[#FAFAF9]">
                        目前没有任何动态
                      </h3>
                      <p className="text-[12px] text-stone-500 dark:text-stone-500 mt-1 max-w-[200px] leading-relaxed">
                        当系统有新的合规提示、账号限流预警或发布情况时，将在此汇总。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <AnimatePresence initial={false}>
                        {alerts.map((notif) => {
                          const isLocal = isLocalNotification(notif);
                          const isUnread = notif.status === "unread";
                          return (
                            <motion.div
                              key={notif.id}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, x: 50, height: 0, marginBottom: 0 }}
                              transition={{ type: "spring", stiffness: 450, damping: 28 }}
                              className={cn(
                                "relative rounded-xl border p-3.5 bg-white dark:bg-stone-900 transition-colors",
                                !isUnread ? "border-stone-200/50 dark:border-stone-800/50 opacity-70" : "border-stone-200 dark:border-stone-700/80"
                              )}
                            >
                              <div className="flex items-start gap-2.5">
                                {/* Read Status Dot */}
                                {isUnread && (
                                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#D97757]" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className={cn(
                                      "text-[12px] font-medium uppercase px-1 rounded-sm",
                                      notif.severity === "critical" ? "text-rose-600 bg-rose-50 dark:bg-rose-950/20" :
                                      notif.severity === "warning" ? "text-amber-600 bg-amber-50 dark:bg-amber-950/20" :
                                      notif.severity === "success" ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20" :
                                      "text-stone-500 bg-stone-100"
                                    )}>
                                      {notif.severity === "critical" ? "重大预警" : notif.severity === "warning" ? "建议反馈" : "动态通知"}
                                    </span>
                                    <span className="text-[12px] text-stone-500 dark:text-stone-500">{relativeTime(notif.created_at)}</span>
                                  </div>
                                  <h4 className={cn(
                                    "text-[12px] leading-snug mt-1.5",
                                    !isUnread ? "font-medium text-stone-700 dark:text-stone-500" : "font-medium text-stone-900 dark:text-stone-50"
                                  )}>
                                    {notif.title}
                                  </h4>
                                  {notif.body && (
                                    <p className="text-[12px] text-stone-500 dark:text-stone-500 leading-normal mt-1">
                                      {notif.body}
                                    </p>
                                  )}

                                  {/* Interactive Actions */}
                                  <div className="mt-2.5 flex items-center justify-between border-t border-stone-100 dark:border-stone-800/60 pt-2">
                                    <div className="flex gap-2">
                                      {isUnread && (
                                        <button
                                          type="button"
                                          onClick={() => void markRead(notif.id)}
                                          className="text-[12px] font-medium text-[#B4532F] hover:opacity-85"
                                        >
                                          标为已读
                                        </button>
                                      )}
                                      {!isLocal && notif.action_url && (
                                        <Link
                                          href={notif.action_url}
                                          onClick={() => {
                                            if (isUnread) void markRead(notif.id);
                                            onOpenChange(false);
                                          }}
                                          className="text-[12px] font-medium text-[#B4532F] hover:opacity-85 inline-flex items-center gap-0.5"
                                        >
                                          {notif.action_label || "查看"}
                                          <ArrowRight className="size-2.5" />
                                        </Link>
                                      )}
                                      {isLocal && notif.primaryActionLabel && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            notif.primaryAction?.();
                                            onOpenChange(false);
                                          }}
                                          className="text-[12px] font-medium text-[#B4532F] hover:opacity-85"
                                        >
                                          {notif.primaryActionLabel}
                                        </button>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => void markDone(notif.id, "ignored")}
                                      className="text-stone-500 hover:text-rose-500 transition-colors"
                                      title="忽略此条"
                                      aria-label="忽略此条"
                                    >
                                      <Trash2 className="size-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer summary */}
            <div className="shrink-0 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 text-center text-[12px] text-stone-500 dark:text-stone-500">
              <span className="font-medium">DYData Premium Console</span> • 所有待处理项目将同步同步至移动钉群
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
