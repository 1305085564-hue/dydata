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
  MessageSquare,
  Calendar,
  ShieldAlert,
  ClipboardCheck,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useNotifications } from "./notifications/notification-store";
import {
  buildNotificationActionItem,
  isReviewExemptionAction,
  sortActionItems,
  type ActionCenterSummary,
  type ActionItem,
} from "@/lib/action-center/types";
import { toast } from "sonner";
import {
  collectApprovalRequestIds,
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

// ==========================================
// 1. 类型定义
// ==========================================

export interface ExemptionRequest {
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
  feedback?: string | null;
  daily_items?: Array<{
    id: string;
    request_id: string;
    request_date: string;
    reason: string | null;
    status: "pending" | "approved" | "rejected";
    feedback: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
  }>;
}

export interface DailyApprovalDetail {
  id: string;
  dateStr: string;
  dateDisplay: string;
  dayOfWeek: string;
  nature: "leave" | "waive";
  categoryLabel: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewerFeedback: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  originalRequestId: string;
}

export interface GroupedApprovalItem {
  groupKey: string;
  applicant_user_id: string;
  applicant_name: string;
  team_name: string | null;
  nature: "leave" | "waive"; // 请假 vs 特殊豁免
  isPermanent: boolean;
  categoryBadge: string;
  dateRangeText: string;
  dayCount: number;
  reasons: string[];
  created_at: string;
  requestIds: string[];
  items: ExemptionRequest[];
  dailyItems: DailyApprovalDetail[];
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  isPartiallyProcessed: boolean;
}

// ==========================================
// 2. 日期与合并计算工具函数
// ==========================================

function formatShortDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(dateStr.trim());
  if (match) {
    const [, , m, d] = match;
    return `${Number(m)}月${Number(d)}日`;
  }
  return dateStr;
}

function parseUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function getWeekdayText(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return WEEKDAYS[d.getDay()] || "";
  } catch {
    return "";
  }
}

function parseDateDaysDifference(startStr: string, endStr: string): number {
  const d1 = parseUtcDate(startStr).getTime();
  const d2 = parseUtcDate(endStr).getTime();
  return Math.abs(d2 - d1) / 86_400_000 + 1;
}

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

    // 展开逐日列表
    const allDatesMap = new Map<string, ExemptionRequest>();
    for (const gi of groupItems) {
      const dates = expandDateRange(gi.start_date, gi.end_date);
      for (const d of dates) {
        if (!allDatesMap.has(d)) {
          allDatesMap.set(d, gi);
        }
      }
    }

    const sortedDates = Array.from(allDatesMap.keys()).sort();
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
      const spanDays = parseDateDaysDifference(minDate, maxDate);
      if (spanDays === sortedDates.length) {
        dateRangeText = `${formatShortDate(minDate)} 至 ${formatShortDate(maxDate)}`;
      } else if (sortedDates.length <= 2) {
        dateRangeText = sortedDates.map(formatShortDate).join(" · ");
      } else {
        dateRangeText = `${formatShortDate(minDate)} 至 ${formatShortDate(maxDate)} (共 ${sortedDates.length} 天)`;
      }
    }

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

    const reasons = Array.from(
      new Set(
        groupItems
          .map((gi) => gi.reason?.trim())
          .filter((r): r is string => Boolean(r)),
      ),
    );

    const created_at = groupItems.reduce(
      (latest, gi) => (gi.created_at > latest ? gi.created_at : latest),
      first.created_at,
    );

    const requestIds = collectApprovalRequestIds(groupItems);

    const storedDaily = groupItems.flatMap((item) => item.daily_items ?? []);
    const dailyItems: DailyApprovalDetail[] = sortedDates.map((dateStr, idx) => {
      const matchItem = allDatesMap.get(dateStr) || first;
      const stored = storedDaily.find((item) => item.request_date === dateStr);
      const reqId = resolveApprovalRequestId(matchItem) || `daily-${first.applicant_user_id}-${dateStr}`;
      const exemptionCat = toExemptionCategory(matchItem.exemption_category);
      const catLabel = getExemptionCategoryLabel(exemptionCat);

      return {
        id: `${reqId}-${dateStr}-${idx}`,
        dateStr,
        dateDisplay: formatShortDate(dateStr),
        dayOfWeek: getWeekdayText(dateStr),
        nature,
        categoryLabel: nature === "leave" ? "请假" : catLabel,
        reason: stored?.reason || matchItem.reason || (reasons[0] || "未填写事由"),
        status: stored?.status || matchItem.request_status || "pending",
        reviewerFeedback: stored?.feedback || matchItem.feedback || null,
        reviewedBy: stored?.reviewed_by || matchItem.reviewed_by_name || null,
        reviewedAt: stored?.reviewed_at ? formatShortDate(stored.reviewed_at) : matchItem.reviewed_at ? formatShortDate(matchItem.reviewed_at) : null,
        originalRequestId: reqId,
      };
    });

    const pendingCount = dailyItems.filter((d) => d.status === "pending").length;
    const approvedCount = dailyItems.filter((d) => d.status === "approved").length;
    const rejectedCount = dailyItems.filter((d) => d.status === "rejected").length;
    const isPartiallyProcessed = approvedCount > 0 || rejectedCount > 0;

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
      dailyItems,
      pendingCount,
      approvedCount,
      rejectedCount,
      isPartiallyProcessed,
    });
  }

  return result;
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
    return "历史审批记录，记录了过往的通过与拒绝决定，支持随时打回待处理重新审批。";
  }
  return "需要你处理或跟进的事项，来自权限申请、归属异常、AI 任务失败、系统风险等。有明确动作，处理完成后自动消失。";
}

// ==========================================
// 3. 就地批注反馈槽组件（轻量随手便签）
// ==========================================

interface InlineFeedbackTrayProps {
  initialAction?: "approved" | "rejected";
  title: string;
  scopeHint: string;
  onConfirm: (action: "approved" | "rejected", feedback: string) => void;
  onCancel: () => void;
}

function InlineFeedbackTray({
  initialAction = "approved",
  title,
  scopeHint,
  onConfirm,
  onCancel,
}: InlineFeedbackTrayProps) {
  const [feedback, setFeedback] = useState("");
  const isApprove = initialAction === "approved";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, marginTop: 0 }}
      animate={{ opacity: 1, height: "auto", marginTop: 10 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden pt-1 space-y-2"
    >
      <div className="flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-1.5 font-medium text-[#2C2623]">
          <PenLine className="size-3.5 text-[#8C827A]" />
          <span>附带批注：{title}</span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11.5px] text-[#8C827A] hover:text-[#1C1917] transition-colors cursor-pointer"
        >
          收起
        </button>
      </div>

      <textarea
        value={feedback}
        autoFocus
        onChange={(e) => setFeedback(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onConfirm(initialAction, feedback.trim());
          }
        }}
        placeholder={isApprove ? "输入同行批注或提醒（选填，按 ⌘Enter 发送）..." : "输入拒绝原因或建议（选填，按 ⌘Enter 发送）..."}
        rows={2}
        className="w-full rounded-xl border border-[#E5E0D6] bg-[#FAF8F4]/50 focus:bg-white p-2.5 sm:p-3 text-[12.5px] text-[#1C1917] placeholder-[#8C827A]/60 focus:border-[#78716C] focus:outline-none focus:ring-1 focus:ring-[#D97757]/20 transition-all resize-none shadow-2xs"
      />

      <div className="flex items-center justify-between text-[11px] pt-0.5">
        <span className="text-[#8C827A] truncate">{scopeHint}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-2 py-0.5 text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(initialAction, feedback.trim())}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-3 py-1 text-[12px] font-medium text-white transition-all active:scale-[0.98] cursor-pointer shadow-2xs",
              isApprove
                ? "bg-[#D97757] hover:bg-[#C46A4D]"
                : "bg-[#C0685C] hover:bg-[#AA5C51]",
            )}
          >
            {isApprove ? <Check className="size-3 stroke-[2.2]" /> : <X className="size-3 stroke-[2.2]" />}
            <span>{isApprove ? "确认同意并附批注" : "确认拒绝并附批注"}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ==========================================
// 4. 主组件：独立审批工作台弹窗
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
  const { notifications, loading, markRead, markDone } = useNotifications();
  const [now] = useState(() => Date.now());

  // 审批与历史状态
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ExemptionRequest[]>([]);
  const [historyApprovals, setHistoryApprovals] = useState<ExemptionRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);



  // 类别筛选：全部 / 请假 / 特殊豁免
  const [filterNature, setFilterNature] = useState<"all" | "leave" | "waive">("all");

  // 键盘焦点索引
  const [focusedCardIndex, setFocusedCardIndex] = useState<number>(0);

  // 就地反馈槽状态（针对组或单日，消灭二级弹窗遮罩）
  const [activeFeedbackKey, setActiveFeedbackKey] = useState<string | null>(null);
  const [activeFeedbackConfig, setActiveFeedbackConfig] = useState<{
    initialAction: "approved" | "rejected";
    title: string;
    scopeHint: string;
    handler: (action: "approved" | "rejected", feedback: string) => void;
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 权限变化时清空审批队列
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

  const flushPendingUndoReviews = useCallback(() => {
    if (undoQueueRef.current.size === 0) return;
    const pending = Array.from(undoQueueRef.current.values());
    undoQueueRef.current.clear();
    setActiveUndoList([]);
    const url = "/api/exemptions/review";
    for (const entry of pending) {
      clearTimeout(entry.timerId);
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

    setPendingApprovals((current) => [
      ...restoreApprovalItems(current, pending.originalItems),
      ...current,
    ]);

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

  // 批量审批全部待办项
  const handleApproveAll = () => {
    if (filteredApprovals.length === 0) return;
    const allRequestIds = filteredApprovals.flatMap((g) => g.requestIds);
    const allItems = filteredApprovals.flatMap((g) => g.items);
    scheduleReviewWithUndo(
      `全部 ${filteredApprovals.length} 位成员的申请`,
      allRequestIds,
      "approved",
      allItems,
      undefined,
      undefined,
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

  // 待办标记完成
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

  // 待办列表
  const notificationActionItems = useMemo(() => {
    return notifications
      .filter(
        (notification) =>
          notification.category === "todo" &&
          (notification.status === "unread" || notification.status === "read"),
      )
      .map(buildNotificationActionItem);
  }, [notifications]);

  const todoItems = useMemo(() => {
    const liveKeys = new Set(notificationActionItems.map((item) => item.dedupeKey));
    const summaryItems = (summary?.topItems ?? []).filter(
      (item) => !isReviewExemptionAction(item.action) && !liveKeys.has(item.dedupeKey),
    );
    return sortActionItems([...notificationActionItems, ...summaryItems]).filter(
      (item) => !completedSessionIds.includes(item.id),
    );
  }, [completedSessionIds, notificationActionItems, summary]);

  // 分组后的待审批申请与筛选结果
  const groupedApprovals = groupPendingApprovals(pendingApprovals);
  const filteredApprovals =
    filterNature === "all"
      ? groupedApprovals
      : groupedApprovals.filter((g) => g.nature === filterNature);

  const todoTabCount = summary
    ? Math.max(0, summary.todoCount - summary.approvalCount)
    : todoItems.length;
  const approvalTabCount = summary?.approvalCount ?? pendingApprovals.length;
  const actionsLoading = loading || (summaryLoading && summary === null);

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
      if (activeTab === "approvals" && filteredApprovals.length > 0) {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedCardIndex((prev) => {
            const next = Math.min(filteredApprovals.length - 1, prev + 1);
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

        const focusedItem = filteredApprovals[focusedCardIndex] || filteredApprovals[0];
        if (focusedItem) {
          if (e.key.toLowerCase() === "a") {
            e.preventDefault();
            handleGroupAction(focusedItem, "approved", false);
          } else if (e.key.toLowerCase() === "r") {
            e.preventDefault();
            handleGroupAction(focusedItem, "rejected", false);
          } else if (e.key.toLowerCase() === "c") {
            e.preventDefault();
            handleGroupAction(focusedItem, "approved", true);
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
    filteredApprovals,
    focusedCardIndex,
    handleGroupAction,
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
            className="fixed inset-0 bg-[#1C1917]/12 backdrop-blur-[2px]"
          />

          {/* Main Modal Workbench Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.985, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, y: 6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex w-[min(440px,calc(100vw-2rem))] sm:w-[min(880px,calc(100vw-2rem))] max-h-[min(580px,calc(100dvh-var(--app-top-offset,64px)-1rem))] sm:max-h-[min(720px,calc(100dvh-var(--app-top-offset,64px)-1rem))] h-[min(580px,calc(100dvh-var(--app-top-offset,64px)-1rem))] sm:h-[min(720px,calc(100dvh-var(--app-top-offset,64px)-1rem))] flex-col overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white shadow-claude-dialog"
          >
            {/* Top Navigation & Workspace Header */}
            <div className="shrink-0 border-b border-[#ECE7DE]/60 bg-white px-5 sm:px-6 pt-4 pb-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-[#FAF8F4] text-[#1C1917] shadow-2xs border border-[#ECE7DE]/80">
                    <ClipboardCheck className="size-3.5 stroke-[1.8]" />
                  </div>
                  <div>
                    <h3 className="font-serif tracking-tighter text-[17px] font-[580] text-[#1C1917]">
                      审批工作台
                    </h3>
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
                    className="flex size-7 items-center justify-center rounded-lg text-[#8C827A] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <RefreshCw className={cn("size-3.5", (summaryLoading || approvalsLoading) && "animate-spin")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="关闭工作台"
                    className="flex size-7 items-center justify-center rounded-lg text-[#8C827A] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors cursor-pointer"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              {/* Navigation Tabs (待审批 vs 待办 vs 已处理) */}
              <div className="mt-3.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-xl bg-[#F5F3EE] p-1 border border-[#E5E0D6]/60">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onTabChange("approvals")}
                      className={cn(
                        "relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12.5px] transition-colors duration-150 z-10 select-none cursor-pointer",
                        activeTab === "approvals"
                          ? "text-[#1C1917] font-medium"
                          : "text-[#78716C] hover:text-[#292524]",
                      )}
                    >
                      {activeTab === "approvals" && (
                        <motion.div
                          layoutId="workbenchTabIndicator"
                          className="absolute inset-0 rounded-lg bg-white shadow-2xs border border-[#ECE7DE]/80 -z-10"
                          transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                      )}
                      <span>待审批申请</span>
                      {approvalTabCount > 0 && (
                        <span
                          className={cn(
                            "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[10.5px] font-medium tabular-nums",
                            activeTab === "approvals"
                              ? "bg-[#EBE7DF] text-[#1C1917] font-semibold"
                              : "bg-[#EBE7DF] text-[#78716C]",
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
                      "relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12.5px] transition-colors duration-150 z-10 select-none cursor-pointer",
                      activeTab === "todos"
                        ? "text-[#1C1917] font-medium"
                        : "text-[#78716C] hover:text-[#292524]",
                    )}
                  >
                    {activeTab === "todos" && (
                      <motion.div
                        layoutId="workbenchTabIndicator"
                        className="absolute inset-0 rounded-lg bg-white shadow-2xs border border-[#ECE7DE]/80 -z-10"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                    <span>团队待办</span>
                    {todoTabCount > 0 && (
                      <span
                        className={cn(
                          "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[10.5px] font-medium tabular-nums",
                          activeTab === "todos"
                            ? "bg-[#EBE7DF] text-[#1C1917] font-semibold"
                            : "bg-[#EBE7DF] text-[#78716C]",
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
                        "relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12.5px] transition-colors duration-150 z-10 select-none cursor-pointer",
                        activeTab === "history"
                          ? "text-[#1C1917] font-medium"
                          : "text-[#78716C] hover:text-[#292524]",
                      )}
                    >
                      {activeTab === "history" && (
                        <motion.div
                          layoutId="workbenchTabIndicator"
                          className="absolute inset-0 rounded-lg bg-white shadow-2xs border border-[#ECE7DE]/80 -z-10"
                          transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                      )}
                      <span>已处理记录</span>
                      {historyApprovals.length > 0 && (
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EBE7DF] px-1.5 text-[10.5px] font-medium text-[#78716C] tabular-nums">
                          {historyApprovals.length}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                <div className="hidden sm:flex items-center gap-1.5 text-[12px] text-[#8C827A]">
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
                  className="shrink-0 overflow-hidden border-b border-[#ECE7DE] bg-[#FAF8F4] px-5 sm:px-6"
                >
                  <div className="py-2 space-y-1.5">
                    {activeUndoList.map((activeUndo) => (
                      <div key={activeUndo.id} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[#8C827A] text-[12px]">✦</span>
                          <span className="truncate text-[12px] font-medium text-[#1C1917]">
                            {activeUndo.action === "approved" ? "已同意" : "已拒绝"} {activeUndo.title}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUndo(activeUndo.id)}
                          className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-white border border-[#E5DFD3] hover:bg-[#F5F0E6] px-2.5 py-0.5 text-[11.5px] font-medium text-[#292524] shadow-2xs transition-colors cursor-pointer"
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
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-3.5 bg-[#FAF9F6]">
              {/* 1. APPROVALS WORKBENCH TAB (待审批工作台) */}
              {activeTab === "approvals" && isAdmin && (
                <div className="space-y-3">
                  {/* Filter & Metric Bar: 纯净目录排版 (消灭双层胶囊打架) */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#ECE7DE]/70">
                    <div className="flex items-center gap-4 text-[12.5px]">
                      <button
                        type="button"
                        onClick={() => {
                          setFilterNature("all");
                          setFocusedCardIndex(0);
                        }}
                        className={cn(
                          "relative pb-1 font-medium transition-colors cursor-pointer",
                          filterNature === "all"
                            ? "text-[#1C1917]"
                            : "text-[#8C827A] hover:text-[#1C1917]",
                        )}
                      >
                        <span>全部</span>
                        <span className="ml-1 text-[11px] text-[#8C827A]">({groupedApprovals.length})</span>
                        {filterNature === "all" && (
                          <motion.div
                            layoutId="approvalFilterUnderline"
                            className="absolute bottom-0 inset-x-0 h-[2px] bg-[#1C1917] rounded-full"
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
                          "relative pb-1 font-medium transition-colors cursor-pointer",
                          filterNature === "leave"
                            ? "text-[#1C1917]"
                            : "text-[#8C827A] hover:text-[#1C1917]",
                        )}
                      >
                        <span>请假</span>
                        <span className="ml-1 text-[11px] text-[#8C827A]">
                          ({groupedApprovals.filter((g) => g.nature === "leave").length})
                        </span>
                        {filterNature === "leave" && (
                          <motion.div
                            layoutId="approvalFilterUnderline"
                            className="absolute bottom-0 inset-x-0 h-[2px] bg-[#1C1917] rounded-full"
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
                          "relative pb-1 font-medium transition-colors cursor-pointer",
                          filterNature === "waive"
                            ? "text-[#1C1917]"
                            : "text-[#8C827A] hover:text-[#1C1917]",
                        )}
                      >
                        <span>特殊豁免</span>
                        <span className="ml-1 text-[11px] text-[#8C827A]">
                          ({groupedApprovals.filter((g) => g.nature === "waive").length})
                        </span>
                        {filterNature === "waive" && (
                          <motion.div
                            layoutId="approvalFilterUnderline"
                            className="absolute bottom-0 inset-x-0 h-[2px] bg-[#1C1917] rounded-full"
                          />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      {filteredApprovals.length > 1 && (
                        <button
                          type="button"
                          onClick={handleApproveAll}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#D97757]/12 hover:bg-[#D97757]/20 text-[#C46A4D] hover:text-[#B55D40] px-2.5 py-1 text-[11.5px] font-medium transition-all active:scale-[0.98] cursor-pointer"
                        >
                          <Check className="size-3 stroke-[2.2]" />
                          <span>一键全部同意 ({filteredApprovals.length}) →</span>
                        </button>
                      )}
                      <div className="text-[12px] text-[#8C827A] tabular-nums">
                        共 {pendingApprovals.length} 份明细
                      </div>
                    </div>
                  </div>

                  {approvalError && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/[0.04] p-3 text-[12px] text-[#C0685C]">
                      <span className="inline-flex items-center gap-2">
                        <TriangleAlert className="size-4 shrink-0" />
                        <span>{approvalError}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void fetchApprovals()}
                        className="rounded-lg px-2 py-1 font-medium hover:bg-[#C0685C]/10 transition-colors cursor-pointer"
                      >
                        重试
                      </button>
                    </div>
                  )}

                  {/* Loading State */}
                  {approvalsLoading && pendingApprovals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Loader2 className="size-5 animate-spin text-[#D97757] mb-2" />
                      <p className="text-[12.5px] text-[#78716C]">正在同步待审批记录...</p>
                    </div>
                  ) : filteredApprovals.length === 0 ? (
                    /* Editorial Empty State with Seamless Next-Step Flow */
                    <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-12 text-center shadow-[0_1px_3px_rgba(40,30,20,0.04),0_0_0_1px_rgba(40,30,20,0.04)]">
                      <div className="text-[20px] text-[#78716C] mb-2">✦</div>
                      <h4 className="font-serif tracking-tight text-[15px] font-[580] text-[#1C1917]">
                        {filterNature !== "all" ? "当前筛选下无匹配记录" : "全部申请已阅毕"}
                      </h4>
                      <p className="mt-1 max-w-sm text-[12px] text-[#78716C] leading-relaxed">
                        {filterNature !== "all"
                          ? "可切换筛选条件查看其他申请。"
                          : "团队成员请假与豁免均已处理，考勤口径保持最新。"}
                      </p>
                      {filterNature === "all" && todoTabCount > 0 && (
                        <button
                          type="button"
                          onClick={() => onTabChange("todos")}
                          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#D97757] hover:bg-[#C46A4D] text-white px-4 py-1.5 text-[12px] font-medium transition-all shadow-2xs cursor-pointer active:scale-[0.98]"
                        >
                          <span>前往团队待办 ({todoTabCount})</span>
                          <span>→</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Grouped Approvals List: 平滑布局动效 + 键盘导航 */
                    <motion.div layout className="space-y-3">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {filteredApprovals.map((group, index) => {
                          const isLeave = group.nature === "leave";
                          const hasMultiDays = group.dailyItems.length > 1;
                          const feedbackGroupKey = `group-${group.groupKey}`;
                          const isGroupFeedbackOpen = activeFeedbackKey === feedbackGroupKey;
                          const isFocused = focusedCardIndex === index;

                          return (
                            <motion.div
                              key={group.groupKey}
                              id={`approval-card-${index}`}
                              layout
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.96, height: 0, marginBottom: 0 }}
                              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                              onClick={() => setFocusedCardIndex(index)}
                              className={cn(
                                "group rounded-2xl bg-white p-4.5 sm:p-5 transition-all duration-150",
                                isFocused
                                  ? "shadow-[0_4px_16px_rgba(28,25,23,0.08),0_0_0_1px_rgba(28,25,23,0.06)]"
                                  : "shadow-[0_1px_3px_rgba(40,30,20,0.04),0_0_0_1px_rgba(40,30,20,0.04)] hover:shadow-[0_3px_10px_rgba(40,30,20,0.06)]",
                              )}
                            >
                              {/* Card Header */}
                              <div className="flex items-start justify-between gap-3 sm:gap-4">
                                {/* Left: Applicant Name & Metadata */}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[14.5px] font-[550] text-[#1C1917] truncate">
                                      {group.applicant_name}
                                    </span>
                                    <span className="text-[#8C827A] text-[12px]">·</span>
                                    <span className="text-[12px] text-[#8C827A] truncate">
                                      {group.team_name || "未分配分组"}
                                    </span>

                                    {/* Distinction Badge */}
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium shrink-0",
                                        isLeave
                                          ? "bg-[#F4F1EA] text-[#4A443E]"
                                          : "bg-[#EBF3ED] text-[#245233]",
                                      )}
                                    >
                                      {isLeave ? (
                                        <Calendar className="size-3 text-[#78716C]" />
                                      ) : (
                                        <ShieldAlert className="size-3 text-[#245233]" />
                                      )}
                                      <span>{group.categoryBadge}</span>
                                    </span>

                                    {group.isPartiallyProcessed && (
                                      <span className="rounded-md bg-[#FAF4E8] text-[#8A6A2F] px-1.5 py-0.5 text-[10.5px] font-medium shrink-0">
                                        部分已审 ({group.approvedCount + group.rejectedCount}/{group.dailyItems.length})
                                      </span>
                                    )}
                                  </div>

                                  {/* Clean 1-line Subtitle: 日期跨度 · 相对时间 · 事由 */}
                                  <div className="mt-1 text-[12.5px] text-[#5A524C] leading-relaxed truncate">
                                    <span className="text-[#8C827A] tabular-nums">
                                      {group.dateRangeText} · {relativeTime(group.created_at)}
                                    </span>
                                    <span className="mx-1.5 text-[#D0C9BE]">·</span>
                                    <span className="text-[#2C2623] font-normal">
                                      {group.reasons.length > 0 ? group.reasons.join("；") : "未填写详细事由"}
                                    </span>
                                  </div>
                                </div>

                                {/* Right: Actions (低饱和克制微气垫 + 幽灵拒拆 + 静谧批注) */}
                                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleGroupAction(group, "approved", false)}
                                    className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#2E5E3B]/8 hover:bg-[#2E5E3B]/14 px-3 text-[12px] font-medium text-[#245233] transition-all active:scale-[0.98] cursor-pointer"
                                  >
                                    <Check className="size-3.5 stroke-[2.2]" />
                                    <span>
                                      {group.isPartiallyProcessed
                                        ? `同意剩余 (${group.pendingCount}天)`
                                        : "同意全部"}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleGroupAction(group, "rejected", false)}
                                    className="inline-flex h-7 items-center gap-1 rounded-lg hover:bg-[#FAF4F3] px-2 text-[12px] font-medium text-[#8C827A] hover:text-[#C0685C] transition-all active:scale-[0.98] cursor-pointer"
                                  >
                                    <X className="size-3.5 stroke-[2]" />
                                    <span>
                                      {group.isPartiallyProcessed
                                        ? `拒绝剩余 (${group.pendingCount}天)`
                                        : "拒绝全部"}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    title={isGroupFeedbackOpen ? "收起批注面板" : "附带批注流转（再次点击可收起）"}
                                    aria-expanded={isGroupFeedbackOpen}
                                    onClick={() => handleGroupAction(group, "approved", true)}
                                    className={cn(
                                      "flex size-7 items-center justify-center rounded-lg transition-colors cursor-pointer",
                                      isGroupFeedbackOpen
                                        ? "bg-[#EBE7DF] text-[#1C1917]"
                                        : "text-[#8C827A] hover:text-[#1C1917] hover:bg-[#F5F3EE]",
                                    )}
                                  >
                                    <MessageSquare className="size-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Inline Feedback Tray for Group */}
                              <AnimatePresence>
                                {isGroupFeedbackOpen && activeFeedbackConfig && (
                                  <InlineFeedbackTray
                                    initialAction={activeFeedbackConfig.initialAction}
                                    title={activeFeedbackConfig.title}
                                    scopeHint={activeFeedbackConfig.scopeHint}
                                    onConfirm={activeFeedbackConfig.handler}
                                    onCancel={() => setActiveFeedbackKey(null)}
                                  />
                                )}
                              </AnimatePresence>

                              {/* Multi-day Timeline Strip: 横向时间线胶囊 (支持单日点选决策) */}
                              {hasMultiDays && (
                                <div className="mt-3 pt-2.5 border-t border-[#ECE7DE]/50 space-y-2">
                                  <div className="flex items-center justify-between text-[11.5px]">
                                    <span className="font-medium text-[#8C827A] flex items-center gap-1.5">
                                      <span>逐日明细 ({group.dailyItems.length} 天)</span>
                                      {group.isPartiallyProcessed && (
                                        <span className="text-[10.5px] text-[#8A6A2F]">
                                          · 待决策 {group.pendingCount} 天
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-[11px] text-[#8C827A]/75">
                                      可单日点选决策
                                    </span>
                                  </div>

                                  {/* Horizontal Timeline Strip */}
                                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                                    {group.dailyItems.map((daily) => {
                                      const isDailyApproved = daily.status === "approved";
                                      const isDailyRejected = daily.status === "rejected";

                                      return (
                                        <div
                                          key={daily.id}
                                          className={cn(
                                            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] transition-all",
                                            isDailyApproved
                                              ? "bg-[#EBF3ED] text-[#245233]"
                                              : isDailyRejected
                                                ? "bg-[#FAF0EE] text-[#843228]"
                                                : "bg-[#F7F5F0] text-[#2C2623] hover:bg-[#EFECE5]",
                                          )}
                                        >
                                          <span className="font-medium tabular-nums">{daily.dateDisplay}</span>
                                          <span className="text-[10.5px] opacity-75">{daily.dayOfWeek}</span>

                                          {isDailyApproved ? (
                                            <span className="inline-flex items-center gap-0.5 text-[11px] text-[#245233] font-medium">
                                              <Check className="size-3 stroke-[2.2]" />
                                              <span>已同意</span>
                                            </span>
                                          ) : isDailyRejected ? (
                                            <span className="inline-flex items-center gap-0.5 text-[11px] text-[#843228] font-medium">
                                              <X className="size-3 stroke-[2.2]" />
                                              <span>已拒绝</span>
                                            </span>
                                          ) : (
                                            <div className="flex items-center gap-1 ml-1 pl-1">
                                              <button
                                                type="button"
                                                title="同意此单日"
                                                onClick={() => handleDailyAction(group, daily, "approved", false)}
                                                className="rounded px-1.5 py-0.5 text-[10.5px] font-medium text-[#245233] hover:bg-[#245233]/10 transition-colors cursor-pointer"
                                              >
                                                同意
                                              </button>
                                              <button
                                                type="button"
                                                title="拒绝此单日"
                                                onClick={() => handleDailyAction(group, daily, "rejected", false)}
                                                className="rounded px-1.5 py-0.5 text-[10.5px] font-medium text-[#843228] hover:bg-[#843228]/10 transition-colors cursor-pointer"
                                              >
                                                拒绝
                                              </button>
                                              <button
                                                type="button"
                                                title={activeFeedbackKey === `daily-${daily.id}` ? "收起单日批注" : "批注此单日（再次点击可收起）"}
                                                aria-expanded={activeFeedbackKey === `daily-${daily.id}`}
                                                onClick={() => handleDailyAction(group, daily, "approved", true)}
                                                className={cn(
                                                  "rounded p-0.5 transition-colors cursor-pointer",
                                                  activeFeedbackKey === `daily-${daily.id}`
                                                    ? "text-[#1C1917] bg-[#EBE7DF]"
                                                    : "text-[#8C827A] hover:text-[#1C1917]",
                                                )}
                                              >
                                                <PenLine className="size-2.5" />
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Single Day Feedback Tray if active */}
                                  {group.dailyItems.some((d) => activeFeedbackKey === `daily-${d.id}`) && (
                                    <AnimatePresence>
                                      {activeFeedbackConfig && (
                                        <InlineFeedbackTray
                                          initialAction={activeFeedbackConfig.initialAction}
                                          title={activeFeedbackConfig.title}
                                          scopeHint={activeFeedbackConfig.scopeHint}
                                          onConfirm={activeFeedbackConfig.handler}
                                          onCancel={() => setActiveFeedbackKey(null)}
                                        />
                                      )}
                                    </AnimatePresence>
                                  )}
                                </div>
                              )}
                            </motion.div>
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
                  <div className="flex items-center justify-between gap-3 min-h-[36px] pb-2 border-b border-[#ECE7DE]/70">
                    <div className="flex items-center gap-2 text-[12.5px] font-medium text-[#1C1917]">
                      <span>团队待办事项</span>
                      <span className="text-[11px] text-[#8C827A] font-normal">（自动同步系统风险与权限申请）</span>
                    </div>
                    <div className="text-[12px] text-[#8C827A] tabular-nums">
                      共 {todoTabCount} 项待跟进
                    </div>
                  </div>

                  {summaryError && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-[#D99E55]/20 bg-[#D99E55]/[0.05] p-3 text-[12px] text-[#8A6A2F]">
                      <span className="inline-flex items-center gap-2">
                        <TriangleAlert className="size-4 shrink-0" />
                        <span>{summaryError}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void onRefreshSummary?.()}
                        className="rounded-lg px-2 py-1 font-medium hover:bg-[#D99E55]/10 transition-colors cursor-pointer"
                      >
                        重试
                      </button>
                    </div>
                  )}

                  {actionsLoading && todoItems.length === 0 ? (
                    <div className="py-16 text-center text-[12.5px] text-[#78716C] animate-pulse">
                      正在同步待办事项...
                    </div>
                  ) : todoItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-12 text-center shadow-[0_1px_3px_rgba(40,30,20,0.04),0_0_0_1px_rgba(40,30,20,0.04)]">
                      <div className="text-[20px] text-[#78716C] mb-2">✦</div>
                      <h4 className="font-serif tracking-tight text-[15px] font-[580] text-[#1C1917]">
                        待办已全部完成
                      </h4>
                      <p className="mt-1 max-w-sm text-[12px] text-[#78716C]">
                        当前没有需要跟进的权限申请或系统风险事项。
                      </p>
                    </div>
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
                              className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(40,30,20,0.04),0_0_0_1px_rgba(40,30,20,0.05)] hover:shadow-[0_3px_10px_rgba(40,30,20,0.06),0_0_0_1px_rgba(40,30,20,0.07)] p-4 sm:p-4.5 flex items-start gap-3 transition-all"
                            >
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
                                <div className="mt-0.5 size-4 text-[#B98A54] shrink-0">
                                  <TriangleAlert className="size-4" />
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className={cn(
                                      "rounded px-1.5 py-0.2 text-[10px] font-medium tracking-wide",
                                      isCritical
                                        ? "bg-[#C0685C]/10 text-[#C0685C]"
                                        : isWarning
                                          ? "bg-[#D99E55]/10 text-[#8A6A2F]"
                                          : "bg-[#F5F3EE] text-[#78716C]",
                                    )}
                                  >
                                    {isCritical ? "P0 紧急" : isWarning ? "P1 待跟进" : "P2 常规"}
                                  </span>
                                  <span className="text-[11px] text-[#78716C] tabular-nums">
                                    {relativeTime(todo.createdAt)}
                                  </span>
                                </div>

                                <h4 className="text-[13.5px] font-[550] text-[#1C1917] mt-1">
                                  {todo.title}
                                </h4>
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
                                        if (todo.source !== "exemption") void markRead(todo.id);
                                        onOpenChange(false);
                                      }}
                                      className="inline-flex h-6.5 items-center gap-1 rounded-md bg-[#F5F3EE] hover:bg-[#ECE7DE] px-2.5 text-[11.5px] font-medium text-[#292524] transition-colors"
                                    >
                                      <span>{todo.actionLabel}</span>
                                      <ArrowRight className="size-3 text-[#78716C]" />
                                    </Link>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Completed List */}
                  {completedSessionIds.length > 0 && (
                    <div className="pt-2 border-t border-[#ECE7DE]/60">
                      <div className="text-[11.5px] font-medium text-[#78716C] mb-1.5">
                        本次已处理 ({completedSessionIds.length})
                      </div>
                      <div className="space-y-1.5 opacity-70">
                        {completedSessionIds.map((id) => (
                          <div
                            key={id}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-[#FAF8F4] border border-[#ECE7DE]/50"
                          >
                            <span className="text-[#6FAA7D] shrink-0">
                              <CheckCircle2 className="size-3.5 stroke-[2]" />
                            </span>
                            <span className="text-[11.5px] text-[#78716C] line-through truncate flex-1">
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
                  <div className="flex items-center justify-between gap-3 min-h-[36px] pb-2 border-b border-[#ECE7DE]/70">
                    <div className="flex items-center gap-2 text-[12.5px] font-medium text-[#1C1917]">
                      <span>已处理审批记录</span>
                      <span className="text-[11px] text-[#8C827A] font-normal">（支持查阅与随时打回待处理）</span>
                    </div>
                    <div className="text-[12px] text-[#8C827A] tabular-nums">
                      共 {historyApprovals.length} 条记录
                    </div>
                  </div>

                  {historyError && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/[0.04] p-3 text-[12px] text-[#C0685C]">
                      <span className="inline-flex items-center gap-2">
                        <TriangleAlert className="size-4 shrink-0" />
                        <span>{historyError}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void fetchHistoryApprovals()}
                        className="rounded-lg px-2 py-1 font-medium hover:bg-[#C0685C]/10 transition-colors cursor-pointer"
                      >
                        重试
                      </button>
                    </div>
                  )}

                  {historyLoading && historyApprovals.length === 0 ? (
                    <div className="py-16 text-center text-[12.5px] text-[#78716C]">
                      正在加载历史记录...
                    </div>
                  ) : historyApprovals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-12 text-center shadow-[0_1px_3px_rgba(40,30,20,0.04),0_0_0_1px_rgba(40,30,20,0.04)]">
                      <div className="text-[20px] text-[#78716C] mb-2">✦</div>
                      <h4 className="font-serif tracking-tight text-[15px] font-[580] text-[#1C1917]">
                        暂无历史审批记录
                      </h4>
                      <p className="mt-1 max-w-sm text-[12px] text-[#78716C]">
                        所有审阅处理后的申请记录将在此处归档，可随时回溯。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
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
                            className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(40,30,20,0.04),0_0_0_1px_rgba(40,30,20,0.05)] hover:shadow-[0_3px_10px_rgba(40,30,20,0.06),0_0_0_1px_rgba(40,30,20,0.07)] p-4 sm:p-4.5 space-y-2.5 transition-all"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[14px] font-[550] text-[#1C1917]">
                                  {item.applicant_name || "成员"}
                                </span>
                                <span
                                  className={cn(
                                    "rounded px-1.5 py-0.2 text-[10.5px] font-medium",
                                    isApproved
                                      ? "bg-[#6FAA7D]/10 text-[#2E5E3B]"
                                      : "bg-[#C0685C]/10 text-[#C0685C]",
                                  )}
                                >
                                  {isApproved ? "已同意" : "已拒绝"}
                                </span>
                                <span className="text-[11.5px] text-[#78716C]">
                                  {nature === "leave" ? "请假" : categoryLabel}
                                </span>
                              </div>
                              <span className="text-[11px] text-[#78716C] tabular-nums">
                                {item.reviewed_at ? relativeTime(item.reviewed_at) : relativeTime(item.created_at)}
                              </span>
                            </div>

                            <div className="text-[12px] text-[#78716C] tabular-nums">
                              {item.team_name || "未分组"} · {dateText}
                            </div>

                            {item.reason && (
                              <div className="text-[12.5px] text-[#292524] leading-relaxed">
                                <span className="text-[#78716C]">事由：</span>
                                <span>{item.reason}</span>
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-2 border-t border-[#ECE7DE]/50 text-[11.5px]">
                              <span className="text-[#8C827A]">
                                {item.reviewed_by_name ? `由 ${item.reviewed_by_name} 审阅` : ""}
                              </span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={isProcessing || !reqId}
                                  onClick={() => void handleReopenReviewDecision(item)}
                                  className="rounded-md px-2 py-1 font-medium text-[#78716C] hover:bg-[#C0685C]/10 hover:text-[#C0685C] transition-colors cursor-pointer"
                                >
                                  {isProcessing ? "打回中…" : "打回待处理"}
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
            </div>

            {/* Footer: 无框轻量纯排版 */}
            <div className="shrink-0 flex items-center justify-between border-t border-[#ECE7DE]/70 bg-white px-5 sm:px-6 py-2.5 text-[11.5px] text-[#8C827A]">
              <span>✦ 决策实时同步至发布管理与个人工作台</span>
              <div className="hidden sm:flex items-center gap-2.5 text-[11px] text-[#78716C]">
                <span><strong className="font-mono text-[#2C2623] font-medium">J/K</strong> 选卡</span>
                <span>·</span>
                <span><strong className="font-mono text-[#2C2623] font-medium">A</strong> 同意</span>
                <span>·</span>
                <span><strong className="font-mono text-[#2C2623] font-medium">R</strong> 拒绝</span>
                <span>·</span>
                <span><strong className="font-mono text-[#2C2623] font-medium">Z</strong> 撤回</span>
                <span>·</span>
                <span><strong className="font-mono text-[#2C2623] font-medium">1-3</strong> 视图</span>
                <span>·</span>
                <span><strong className="font-mono text-[#2C2623] font-medium">Esc</strong> 关闭</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
