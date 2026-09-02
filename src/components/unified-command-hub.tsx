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
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Calendar,
  ShieldAlert,
  ClipboardCheck,
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
      } else {
        dateRangeText = sortedDates.map(formatShortDate).join(" · ");
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
    return "历史审批记录，记录了过往的通过与拒绝决定，支持随时改判修正。";
  }
  return "需要你处理或跟进的事项，来自权限申请、归属异常、AI 任务失败、系统风险等。有明确动作，处理完成后自动消失。";
}

// ==========================================
// 3. 审批反馈对话框组件
// ==========================================

interface FeedbackModalState {
  isOpen: boolean;
  action: "approved" | "rejected";
  title: string;
  subtitle: string;
  scope: "group" | "single_day";
  targetDate?: string;
  requestIds: string[];
  originalItems: ExemptionRequest[];
  onConfirm: (feedback: string) => void;
}

const QUICK_APPROVAL_REASONS = [
  "符合考勤与豁免规范",
  "材料完备，予以通过",
  "知晓排期调整",
];

const QUICK_REJECTION_REASONS = [
  "业务高峰期，建议另行调休",
  "请先补齐相关请假证明",
  "申请日期与已有排期冲突",
];

function ApprovalFeedbackModal({
  modalState,
  onClose,
}: {
  modalState: FeedbackModalState;
  onClose: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const isApprove = modalState.action === "approved";

  if (!modalState.isOpen) return null;

  const quickPresets = isApprove ? QUICK_APPROVAL_REASONS : QUICK_REJECTION_REASONS;

  const handleConfirm = () => {
    modalState.onConfirm(feedback.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-[#1C1917]/25 backdrop-blur-[2px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg rounded-2xl border border-[#ECE7DE] bg-[#FAF8F4] shadow-claude-dialog overflow-hidden"
      >
        {/* Header */}
        <div className="border-b border-[#ECE7DE]/80 px-5 py-3.5 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-lg text-xs font-semibold",
                isApprove ? "bg-[#6FAA7D]/15 text-[#2E5E3B]" : "bg-[#C0685C]/15 text-[#C0685C]",
              )}
            >
              {isApprove ? <Check className="size-3.5 stroke-[2.5]" /> : <X className="size-3.5 stroke-[2.5]" />}
            </span>
            <div>
              <h4 className="text-[14px] font-semibold text-[#1C1917] tracking-tight">
                {isApprove ? "确认同意申请" : "确认拒绝申请"}
              </h4>
              <p className="text-[11.5px] text-[#78716C] mt-0.5">
                {modalState.title} · {modalState.subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Quick presets */}
          <div>
            <label className="text-[12px] font-medium text-[#292524] mb-1.5 block">
              快捷审批批注（可选）
            </label>
            <div className="flex flex-wrap gap-1.5">
              {quickPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFeedback((prev) => (prev ? `${prev}；${preset}` : preset))}
                  className="rounded-lg border border-[#ECE7DE] bg-white px-2.5 py-1 text-[11.5px] text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="approval-feedback-input" className="text-[12px] font-medium text-[#292524]">
                填写给申请人的审批反馈
              </label>
              <span className="text-[11px] text-[#78716C]">选填，留空则无批注</span>
            </div>
            <textarea
              id="approval-feedback-input"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="输入审批意见或说明（选填，申请人将在其单日记录中查看到此反馈）..."
              rows={3}
              className="w-full rounded-xl border border-[#ECE7DE] bg-[#FAF8F4]/70 p-3 text-[13px] text-[#1C1917] placeholder-[#78716C]/60 focus:bg-white focus:border-[#78716C] focus:outline-none focus:ring-1 focus:ring-[#D97757]/30 transition-all resize-none"
            />
          </div>

          <div className="rounded-xl bg-[#F5F3EE]/60 border border-[#ECE7DE]/50 p-2.5 text-[11.5px] text-[#78716C] flex items-start gap-2">
            <span className="text-[#D97757] mt-0.5">✦</span>
            <span>
              {modalState.scope === "group"
                ? "本次反馈将同步应用至该申请涵盖的每个待处理日期。"
                : "本次反馈将仅记录在该单日明细中。"}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[#ECE7DE]/80 bg-white px-5 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12.5px] font-medium text-white shadow-sm transition-all active:scale-[0.99]",
              isApprove
                ? "bg-[#2E5E3B] hover:bg-[#254E31]"
                : "bg-[#C0685C] hover:bg-[#AA5C51]",
            )}
          >
            {isApprove ? <Check className="size-3.5 stroke-[2.2]" /> : <X className="size-3.5 stroke-[2.2]" />}
            <span>{isApprove ? "确认同意" : "确认拒绝"}</span>
          </button>
        </div>
      </motion.div>
    </div>
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

  // 展开的多日申请组 Key 集合
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());

  // 类型筛选：全部 / 请假 / 特殊豁免
  const [filterNature, setFilterNature] = useState<"all" | "leave" | "waive">("all");

  // 反馈弹窗状态
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModalState>({
    isOpen: false,
    action: "approved",
    title: "",
    subtitle: "",
    scope: "group",
    requestIds: [],
    originalItems: [],
    onConfirm: () => {},
  });

  // 处理中标识
  const [actionProcessing, setActionProcessing] = useState<{
    id: string;
    action: "approved" | "rejected";
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
      setApprovalError("审批列表暂时没同步到最新");
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
        setHistoryError("历史记录暂时没同步到最新");
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
              body: JSON.stringify({ request_id: requestId, action: entry.action, feedback: entry.feedback ?? null, dates: entry.dates }),
            });
            return { entry, requestId, ok: res.ok };
          } catch {
            return { entry, requestId, ok: false };
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
    const url = "/api/exemptions/review";
    for (const entry of pending) {
      clearTimeout(entry.timerId);
      for (const requestId of entry.requestIds) {
        const body = JSON.stringify({ request_id: requestId, action: entry.action });
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

      // 乐观从前端待审列表中移除或标记
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
          title: feedback ? `${title}（已附反馈）` : title,
          action,
          remainingSeconds: 5,
        },
      ]);
    },
    [commitReview],
  );

  // 唤起整组审批反馈
  const promptGroupReview = (
    group: GroupedApprovalItem,
    action: "approved" | "rejected",
  ) => {
    if (group.requestIds.length === 0) {
      toast.error("申请编号无效，刷新后再试");
      return;
    }
    const natureName = group.nature === "leave" ? "请假" : "特殊豁免";
    setFeedbackModal({
      isOpen: true,
      action,
      title: `${group.applicant_name} 的${natureName}申请`,
      subtitle: `${group.dateRangeText}（共 ${group.dayCount || 1} 天）`,
      scope: "group",
      requestIds: group.requestIds,
      originalItems: group.items,
      onConfirm: (feedback) => {
        scheduleReviewWithUndo(
          `${group.applicant_name} 的${natureName}`,
          group.requestIds,
          action,
          group.items,
          feedback,
          undefined,
        );
      },
    });
  };

  // 唤起单日审批反馈
  const promptDailyReview = (
    group: GroupedApprovalItem,
    daily: DailyApprovalDetail,
    action: "approved" | "rejected",
  ) => {
    const targetItem = group.items.find(
      (item) => resolveApprovalRequestId(item) === daily.originalRequestId,
    ) || group.items[0];

    const natureName = daily.nature === "leave" ? "请假" : "特殊豁免";

    setFeedbackModal({
      isOpen: true,
      action,
      title: `${group.applicant_name} 的单日${natureName}`,
      subtitle: `${daily.dateDisplay} (${daily.dayOfWeek})`,
      scope: "single_day",
      targetDate: daily.dateStr,
      requestIds: [daily.originalRequestId],
      originalItems: targetItem ? [targetItem] : group.items,
      onConfirm: (feedback) => {
        setPendingApprovals((prev) => {
          return prev.map((item) => {
            if (resolveApprovalRequestId(item) === daily.originalRequestId) {
              return {
                ...item,
                request_status: action,
                feedback,
                reviewed_by_name: "当前管理员",
                reviewed_at: new Date().toISOString(),
              };
            }
            return item;
          });
        });

        scheduleReviewWithUndo(
          `${group.applicant_name} · ${daily.dateDisplay}`,
          [daily.originalRequestId],
          action,
          targetItem ? [targetItem] : [],
          feedback,
          [daily.dateStr],
        );
      },
    });
  };

  // 历史记录改判
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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (e.key === "Escape") {
        if (feedbackModal.isOpen) {
          setFeedbackModal((prev) => ({ ...prev, isOpen: false }));
          return;
        }
        onOpenChange(false);
      } else if (e.key === "1") {
        onTabChange("approvals");
      } else if (e.key === "2") {
        onTabChange("todos");
      } else if (e.key === "3" && isAdmin) {
        onTabChange("history");
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
  }, [open, isAdmin, onOpenChange, onTabChange, feedbackModal.isOpen]);

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

  // 分组后的待审批申请
  const groupedApprovals = useMemo(
    () => groupPendingApprovals(pendingApprovals),
    [pendingApprovals],
  );

  const filteredApprovals = useMemo(() => {
    if (filterNature === "all") return groupedApprovals;
    return groupedApprovals.filter((g) => g.nature === filterNature);
  }, [filterNature, groupedApprovals]);

  const todoTabCount = summary
    ? Math.max(0, summary.todoCount - summary.approvalCount)
    : todoItems.length;
  const approvalTabCount = summary?.approvalCount ?? pendingApprovals.length;
  const actionsLoading = loading || (summaryLoading && summary === null);

  const toggleGroupExpand = (groupKey: string) => {
    setExpandedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => onOpenChange(false)}
              className="fixed inset-0 bg-[#1C1917]/25 backdrop-blur-[3px]"
            />

            {/* Main Modal Workbench Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 flex w-[min(440px,calc(100vw-2rem))] sm:w-[min(880px,calc(100vw-2rem))] max-h-[min(580px,calc(100dvh-var(--app-top-offset,64px)-1rem))] sm:max-h-[min(780px,calc(100dvh-var(--app-top-offset,64px)-1rem))] flex-col overflow-hidden rounded-2xl border border-[#ECE7DE] bg-[#FAF8F4] shadow-claude-dialog"
            >
              {/* Top Navigation & Workspace Header */}
              <div className="shrink-0 border-b border-[#ECE7DE]/80 bg-[#FAF8F4] px-5 pt-4 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-xl bg-[#1C1917] text-white shadow-2xs">
                      <ClipboardCheck className="size-4 stroke-[2]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[16px] font-semibold text-[#1C1917] tracking-tight">
                          审批工作台
                        </h3>
                        <span className="text-[11px] text-[#78716C] font-normal hidden sm:inline">
                          独立审批与待办中枢
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Header Actions: Refresh & Close */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void onRefreshSummary?.()}
                      disabled={summaryLoading || !onRefreshSummary}
                      aria-label="刷新数据"
                      title="刷新数据"
                      className="flex size-8 items-center justify-center rounded-lg text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <RefreshCw className={cn("size-3.5", (summaryLoading || approvalsLoading) && "animate-spin")} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      aria-label="关闭工作台"
                      className="flex size-8 items-center justify-center rounded-lg text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>

                {/* Primary Independent Navigation Tabs (待审批 vs 待办 vs 已处理) */}
                <div className="mt-3.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 rounded-xl bg-[#F5F3EE] p-1 border border-[#ECE7DE]/60">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => onTabChange("approvals")}
                        className={cn(
                          "relative flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[12.5px] transition-colors duration-150 z-10 select-none cursor-pointer",
                          activeTab === "approvals"
                            ? "text-[#1C1917] font-semibold"
                            : "text-[#78716C] hover:text-[#292524]",
                        )}
                      >
                        {activeTab === "approvals" && (
                          <motion.div
                            layoutId="workbenchTabIndicator"
                            className="absolute inset-0 rounded-lg bg-white shadow-2xs border border-[#ECE7DE]/70 -z-10"
                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                          />
                        )}
                        <span>待审批申请</span>
                        {approvalTabCount > 0 && (
                          <span
                            className={cn(
                              "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums",
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

                    <button
                      type="button"
                      onClick={() => onTabChange("todos")}
                      className={cn(
                        "relative flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[12.5px] transition-colors duration-150 z-10 select-none cursor-pointer",
                        activeTab === "todos"
                          ? "text-[#1C1917] font-semibold"
                          : "text-[#78716C] hover:text-[#292524]",
                      )}
                    >
                      {activeTab === "todos" && (
                        <motion.div
                          layoutId="workbenchTabIndicator"
                          className="absolute inset-0 rounded-lg bg-white shadow-2xs border border-[#ECE7DE]/70 -z-10"
                          transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                      )}
                      <span>团队待办</span>
                      {todoTabCount > 0 && (
                        <span
                          className={cn(
                            "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums",
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
                        onClick={() => onTabChange("history")}
                        className={cn(
                          "relative flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[12.5px] transition-colors duration-150 z-10 select-none cursor-pointer",
                          activeTab === "history"
                            ? "text-[#1C1917] font-semibold"
                            : "text-[#78716C] hover:text-[#292524]",
                        )}
                      >
                        {activeTab === "history" && (
                          <motion.div
                            layoutId="workbenchTabIndicator"
                            className="absolute inset-0 rounded-lg bg-white shadow-2xs border border-[#ECE7DE]/70 -z-10"
                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                          />
                        )}
                        <span>已处理记录</span>
                        {historyApprovals.length > 0 && (
                          <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#E5E0D6] px-1.5 text-[10.5px] font-semibold text-[#292524] tabular-nums">
                            {historyApprovals.length}
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Top Right Status Hint */}
                  <div className="hidden sm:flex items-center gap-2 text-[11.5px] text-[#78716C]">
                    <span className="inline-block size-1.5 rounded-full bg-[#6FAA7D]" />
                    <span>独立区域隔离，避免误操作</span>
                  </div>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* 1. APPROVALS WORKBENCH TAB (待审批工作台) */}
                {activeTab === "approvals" && isAdmin && (
                  <div className="space-y-3.5">
                    {/* Filter & Metric Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 pb-1 border-b border-[#ECE7DE]/60">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFilterNature("all")}
                          className={cn(
                            "rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors",
                            filterNature === "all"
                              ? "bg-white text-[#1C1917] shadow-2xs border border-[#ECE7DE]"
                              : "text-[#78716C] hover:text-[#1C1917]",
                          )}
                        >
                          全部申请 ({groupedApprovals.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterNature("leave")}
                          className={cn(
                            "rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors flex items-center gap-1",
                            filterNature === "leave"
                              ? "bg-white text-[#1C1917] shadow-2xs border border-[#ECE7DE]"
                              : "text-[#78716C] hover:text-[#1C1917]",
                          )}
                        >
                          <span>仅请假</span>
                          <span className="text-[10.5px] text-[#78716C]">
                            ({groupedApprovals.filter((g) => g.nature === "leave").length})
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterNature("waive")}
                          className={cn(
                            "rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors flex items-center gap-1",
                            filterNature === "waive"
                              ? "bg-white text-[#1C1917] shadow-2xs border border-[#ECE7DE]"
                              : "text-[#78716C] hover:text-[#1C1917]",
                          )}
                        >
                          <span className="text-[#2E5E3B]">特殊豁免</span>
                          <span className="text-[10.5px] text-[#78716C]">
                            ({groupedApprovals.filter((g) => g.nature === "waive").length})
                          </span>
                        </button>
                      </div>

                      <div className="text-[12px] text-[#78716C] tabular-nums">
                        共 {pendingApprovals.length} 份明细申请
                      </div>
                    </div>

                    {approvalError && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/[0.05] p-3 text-[12px] text-[#C0685C]">
                        <span className="inline-flex items-center gap-2">
                          <TriangleAlert className="size-4 shrink-0" />
                          <span>{approvalError}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void fetchApprovals()}
                          className="rounded-lg px-2 py-1 font-medium hover:bg-[#C0685C]/10 transition-colors"
                        >
                          重试
                        </button>
                      </div>
                    )}

                    {/* Loading State */}
                    {approvalsLoading && pendingApprovals.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Loader2 className="size-6 animate-spin text-[#D97757] mb-2" />
                        <p className="text-[13px] text-[#78716C]">正在同步待审批申请与单日明细...</p>
                      </div>
                    ) : filteredApprovals.length === 0 ? (
                      /* Empty State */
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#ECE7DE] bg-white/50 py-16 text-center">
                        <div className="flex size-12 items-center justify-center rounded-2xl bg-[#6FAA7D]/10 text-[#6FAA7D] mb-3">
                          <CheckCircle2 className="size-6 stroke-[1.8]" />
                        </div>
                        <h4 className="text-[14px] font-semibold text-[#1C1917]">
                          {filterNature !== "all" ? "当前筛选条件下无匹配申请" : "暂无待审批申请"}
                        </h4>
                        <p className="mt-1 max-w-sm text-[12.5px] text-[#78716C] leading-relaxed">
                          {filterNature !== "all"
                            ? "请尝试切换筛选条件查看全部申请。"
                            : "当前团队成员的请假与特殊豁免已全部处理完毕。"}
                        </p>
                      </div>
                    ) : (
                      /* Grouped Approvals List */
                      <div className="space-y-3">
                        {filteredApprovals.map((group) => {
                          const isExpanded = expandedGroupKeys.has(group.groupKey);
                          const isLeave = group.nature === "leave";
                          const hasMultiDays = group.dailyItems.length > 1;

                          return (
                            <div
                              key={group.groupKey}
                              className={cn(
                                "group rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs",
                                isLeave
                                  ? "border-[#ECE7DE] bg-white hover:border-[#D6D0C4]"
                                  : "border-[#BCD1CA]/80 bg-[#FAFBF9] hover:border-[#BCD1CA]",
                              )}
                            >
                              {/* Card Header */}
                              <div className="p-4 sm:p-4.5 space-y-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  {/* Left: Applicant, Team, Nature Badge */}
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={cn(
                                        "flex size-10 items-center justify-center rounded-xl text-sm font-semibold shadow-2xs",
                                        isLeave
                                          ? "bg-[#F5F3EE] text-[#1C1917] border border-[#ECE7DE]"
                                          : "bg-[#BCD1CA]/40 text-[#2E5E3B] border border-[#BCD1CA]",
                                      )}
                                    >
                                      {group.applicant_name.slice(0, 1)}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h4 className="text-[14.5px] font-semibold text-[#1C1917]">
                                          {group.applicant_name}
                                        </h4>
                                        {/* Distinction Badge */}
                                        <span
                                          className={cn(
                                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                                            isLeave
                                              ? "bg-[#F5F3EE] text-[#292524] border border-[#ECE7DE]"
                                              : "bg-[#BCD1CA]/30 text-[#2E5E3B] border border-[#BCD1CA]/50",
                                          )}
                                        >
                                          {isLeave ? (
                                            <Calendar className="size-3" />
                                          ) : (
                                            <ShieldAlert className="size-3 text-[#2E5E3B]" />
                                          )}
                                          <span>{group.categoryBadge}</span>
                                        </span>

                                        {group.isPartiallyProcessed && (
                                          <span className="rounded-md bg-[#B98A54]/10 text-[#8A6A2F] border border-[#B98A54]/20 px-1.5 py-0.5 text-[10.5px] font-medium">
                                            部分已处理 ({group.approvedCount + group.rejectedCount}/{group.dailyItems.length})
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 text-[12px] text-[#78716C] mt-0.5">
                                        <span>{group.team_name || "未分配部门"}</span>
                                        <span>·</span>
                                        <span className="font-medium text-[#292524] tabular-nums">
                                          {group.dateRangeText}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right: Created Time & Group Action Buttons */}
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11.5px] text-[#78716C] mr-1 hidden sm:inline tabular-nums">
                                      {relativeTime(group.created_at)}
                                    </span>

                                    {/* Group Actions */}
                                    <button
                                      type="button"
                                      onClick={() => promptGroupReview(group, "approved")}
                                      className="inline-flex h-7.5 items-center gap-1.5 rounded-lg bg-[#6FAA7D]/15 px-3 text-[12px] font-medium text-[#2E5E3B] hover:bg-[#6FAA7D]/25 transition-all active:scale-[0.99] cursor-pointer"
                                    >
                                      <Check className="size-3.5 stroke-[2.2]" />
                                      <span>
                                        {group.isPartiallyProcessed
                                          ? `同意剩余 (${group.pendingCount}天)`
                                          : "整组同意"}
                                      </span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => promptGroupReview(group, "rejected")}
                                      className="inline-flex h-7.5 items-center gap-1.5 rounded-lg bg-[#F5F3EE] px-2.5 text-[12px] font-medium text-[#78716C] hover:bg-[#C0685C]/10 hover:text-[#C0685C] transition-all active:scale-[0.99] cursor-pointer"
                                    >
                                      <X className="size-3.5 stroke-[2.2]" />
                                      <span>
                                        {group.isPartiallyProcessed
                                          ? `拒绝剩余 (${group.pendingCount}天)`
                                          : "整组拒绝"}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                {/* Common Reason Box */}
                                <div className="rounded-xl bg-[#FAF8F4] border border-[#ECE7DE]/60 p-3 text-[12px] text-[#292524]">
                                  <div className="flex items-start gap-1.5">
                                    <span className="text-[#78716C] shrink-0 font-medium">申请原因：</span>
                                    <div className="min-w-0 flex-1 space-y-1">
                                      {group.reasons.length > 0 ? (
                                        group.reasons.map((r, i) => (
                                          <p key={i} className="leading-relaxed">
                                            {group.reasons.length > 1 ? `${i + 1}. ${r}` : r}
                                          </p>
                                        ))
                                      ) : (
                                        <span className="text-[#78716C]">未填写详细申请原因</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Multi-day Expand Toggle */}
                                {hasMultiDays && (
                                  <div className="pt-1 flex items-center justify-between">
                                    <button
                                      type="button"
                                      onClick={() => toggleGroupExpand(group.groupKey)}
                                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#43718E] hover:text-[#1C1917] transition-colors"
                                    >
                                      <span>
                                        {isExpanded
                                          ? "收起逐日明细"
                                          : `展开查看每日明细与独立审批 (${group.dailyItems.length} 天)`}
                                      </span>
                                      {isExpanded ? (
                                        <ChevronUp className="size-3.5" />
                                      ) : (
                                        <ChevronDown className="size-3.5" />
                                      )}
                                    </button>

                                    <span className="text-[11px] text-[#78716C]">
                                      支持对单独某一天进行同意或拒绝并附带反馈
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Daily Breakdown Section (Collapsible) */}
                              <AnimatePresence>
                                {(isExpanded || !hasMultiDays) && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="border-t border-[#ECE7DE]/70 bg-[#FAF8F4]/50 px-4 py-3 space-y-2"
                                  >
                                    <div className="text-[11.5px] font-medium text-[#78716C] px-1 mb-1">
                                      逐日审批明细与反馈：
                                    </div>
                                    <div className="space-y-2">
                                      {group.dailyItems.map((daily) => {
                                        const isDailyPending = daily.status === "pending";
                                        const isDailyApproved = daily.status === "approved";
                                        const isDailyRejected = daily.status === "rejected";

                                        return (
                                          <div
                                            key={daily.id}
                                            className={cn(
                                              "rounded-xl border p-3 transition-colors bg-white",
                                              isDailyApproved
                                                ? "border-[#6FAA7D]/40 bg-[#6FAA7D]/[0.02]"
                                                : isDailyRejected
                                                  ? "border-[#C0685C]/30 bg-[#C0685C]/[0.02]"
                                                  : "border-[#ECE7DE]",
                                            )}
                                          >
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                              {/* Left: Date, Type, Daily Reason */}
                                              <div className="space-y-1.5 min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-[13px] font-semibold text-[#1C1917] tabular-nums">
                                                    {daily.dateDisplay}
                                                  </span>
                                                  <span className="text-[11.5px] text-[#78716C]">
                                                    {daily.dayOfWeek}
                                                  </span>
                                                  <span className="rounded bg-[#F5F3EE] px-1.5 py-0.5 text-[10.5px] text-[#292524] border border-[#ECE7DE]">
                                                    {daily.categoryLabel}
                                                  </span>

                                                  {/* Daily Status Badge */}
                                                  {isDailyApproved ? (
                                                    <span className="inline-flex items-center gap-1 rounded-md bg-[#6FAA7D]/15 px-1.5 py-0.5 text-[10.5px] font-medium text-[#2E5E3B]">
                                                      <Check className="size-3" />
                                                      已同意
                                                    </span>
                                                  ) : isDailyRejected ? (
                                                    <span className="inline-flex items-center gap-1 rounded-md bg-[#C0685C]/15 px-1.5 py-0.5 text-[10.5px] font-medium text-[#C0685C]">
                                                      <X className="size-3" />
                                                      已拒绝
                                                    </span>
                                                  ) : (
                                                    <span className="inline-flex items-center rounded-md bg-[#D99E55]/15 px-1.5 py-0.5 text-[10.5px] font-medium text-[#8A6A2F]">
                                                      待审批
                                                    </span>
                                                  )}
                                                </div>

                                                <p className="text-[12px] text-[#292524] leading-relaxed">
                                                  <span className="text-[#78716C]">该日事由：</span>
                                                  {daily.reason}
                                                </p>

                                                {/* Pre-allocated Feedback & Audit Area */}
                                                <div className="mt-1 rounded-lg bg-[#FAF8F4] border border-[#ECE7DE]/50 p-2 text-[11.5px]">
                                                  {daily.reviewerFeedback ? (
                                                    <div className="space-y-0.5">
                                                      <div className="flex items-center gap-1 text-[#43718E] font-medium">
                                                        <MessageSquare className="size-3" />
                                                        <span>管理员反馈：{daily.reviewerFeedback}</span>
                                                      </div>
                                                      {daily.reviewedBy && (
                                                        <p className="text-[10.5px] text-[#78716C]">
                                                          由 {daily.reviewedBy} 于 {daily.reviewedAt} 处理
                                                        </p>
                                                      )}
                                                    </div>
                                                  ) : daily.status !== "pending" ? (
                                                    <div className="text-[#78716C] flex items-center gap-1.5">
                                                      <span>已由管理员处理（未附带文字反馈）</span>
                                                      {daily.reviewedAt && <span>· {daily.reviewedAt}</span>}
                                                    </div>
                                                  ) : (
                                                    <div className="text-[#78716C]/70 italic">
                                                      预留反馈区：审批时填写的意见将展示于此并同步给申请人
                                                    </div>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Right: Single-day Approve/Reject Buttons */}
                                              {isDailyPending && (
                                                <div className="flex items-center gap-1.5 shrink-0 self-center">
                                                  <button
                                                    type="button"
                                                    onClick={() => promptDailyReview(group, daily, "approved")}
                                                    className="inline-flex h-6.5 items-center gap-1 rounded-md bg-[#6FAA7D]/15 px-2 text-[11.5px] font-medium text-[#2E5E3B] hover:bg-[#6FAA7D]/25 transition-all active:scale-[0.99] cursor-pointer"
                                                  >
                                                    <Check className="size-3 stroke-[2.2]" />
                                                    <span>单日同意</span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => promptDailyReview(group, daily, "rejected")}
                                                    className="inline-flex h-6.5 items-center gap-1 rounded-md bg-[#F5F3EE] px-2 text-[11.5px] font-medium text-[#78716C] hover:bg-[#C0685C]/10 hover:text-[#C0685C] transition-all active:scale-[0.99] cursor-pointer"
                                                  >
                                                    <X className="size-3 stroke-[2.2]" />
                                                    <span>单日拒绝</span>
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. TODOS TAB (完全独立的待办区域) */}
                {activeTab === "todos" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-[#ECE7DE]/60">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[13px] font-semibold text-[#1C1917]">
                          团队待办与跟进
                        </h4>
                        <span className="rounded-full bg-[#F5F3EE] px-2 py-0.5 text-[11px] font-medium text-[#78716C] tabular-nums">
                          {todoTabCount} 项待处理
                        </span>
                      </div>
                      <span className="text-[11.5px] text-[#78716C]">
                        待办项与审批独立隔离，处理后自动移出
                      </span>
                    </div>

                    {summaryError && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-[#D99E55]/25 bg-[#D99E55]/[0.07] p-3 text-[12px] text-[#8A6A2F]">
                        <span className="inline-flex items-center gap-2">
                          <TriangleAlert className="size-4 shrink-0" />
                          <span>{summaryError}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void onRefreshSummary?.()}
                          className="rounded-lg px-2 py-1 font-medium hover:bg-[#D99E55]/10 transition-colors"
                        >
                          重试
                        </button>
                      </div>
                    )}

                    {actionsLoading && todoItems.length === 0 ? (
                      <div className="py-16 text-center text-[12.5px] text-[#78716C] animate-pulse">
                        正在加载行动项与系统风险...
                      </div>
                    ) : todoItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#ECE7DE] bg-white/50 py-16 text-center">
                        <div className="flex size-12 items-center justify-center rounded-2xl bg-[#6FAA7D]/10 text-[#6FAA7D] mb-3">
                          <CheckCircle2 className="size-6 stroke-[1.8]" />
                        </div>
                        <h4 className="text-[14px] font-semibold text-[#1C1917]">
                          今日待办已全部完成
                        </h4>
                        <p className="mt-1 max-w-sm text-[12.5px] text-[#78716C]">
                          当前范围内没有需要跟进的权限申请或系统风险事项。
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <AnimatePresence initial={false}>
                          {todoItems.map((todo) => {
                            const isCritical = todo.priority === "P0";
                            const isWarning = todo.priority === "P1";
                            const canMarkDone = todo.source !== "exemption";
                            const isProcessing = todoProcessingId === todo.id;

                            return (
                              <motion.div
                                key={todo.id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -16, height: 0, marginBottom: 0, padding: 0 }}
                                className={cn(
                                  "flex items-start gap-3 rounded-xl border p-3.5 transition-all bg-white shadow-2xs",
                                  isCritical
                                    ? "border-[#C0685C]/40 hover:border-[#C0685C]/70"
                                    : isWarning
                                      ? "border-[#D99E55]/40 hover:border-[#D99E55]/70"
                                      : "border-[#ECE7DE] hover:border-[#D6D0C4]",
                                )}
                              >
                                {canMarkDone ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleTodo(todo)}
                                    disabled={Boolean(todoProcessingId)}
                                    aria-label={`完成待办：${todo.title}`}
                                    className="mt-0.5 shrink-0 text-[#78716C] hover:text-[#D97757] transition-colors"
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
                                        "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
                                        isCritical
                                          ? "bg-[#C0685C]/15 text-[#C0685C]"
                                          : isWarning
                                            ? "bg-[#D99E55]/15 text-[#8A6A2F]"
                                            : "bg-[#F5F3EE] text-[#78716C]",
                                      )}
                                    >
                                      {isCritical ? "P0 紧急" : isWarning ? "P1 待跟进" : "P2 常规"}
                                    </span>
                                    <span className="text-[11px] text-[#78716C] tabular-nums">
                                      {relativeTime(todo.createdAt)}
                                    </span>
                                  </div>

                                  <h4 className="text-[13px] font-medium text-[#1C1917] mt-1">
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
                                        className="inline-flex h-6.5 items-center gap-1 rounded-md bg-[#D97757]/10 px-2.5 text-[11.5px] font-medium text-[#D97757] hover:bg-[#D97757]/15 transition-colors"
                                      >
                                        <span>{todo.actionLabel}</span>
                                        <ArrowRight className="size-3" />
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

                    {/* Completed List (in this session) */}
                    {completedSessionIds.length > 0 && (
                      <div className="pt-2 border-t border-[#ECE7DE]/80">
                        <div className="text-[11.5px] font-medium text-[#78716C] mb-1.5 px-0.5">
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

                {/* 3. HISTORY TAB (历史审批记录) */}
                {activeTab === "history" && isAdmin && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-[#ECE7DE]/60">
                      <h4 className="text-[13px] font-semibold text-[#1C1917]">
                        已处理审批历史
                      </h4>
                      <span className="text-[11.5px] text-[#78716C]">
                        支持在历史中随时查阅及改判决策
                      </span>
                    </div>

                    {historyError && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/[0.05] p-3 text-[12px] text-[#C0685C]">
                        <span className="inline-flex items-center gap-2">
                          <TriangleAlert className="size-4 shrink-0" />
                          <span>{historyError}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void fetchHistoryApprovals()}
                          className="rounded-lg px-2 py-1 font-medium hover:bg-[#C0685C]/10 transition-colors"
                        >
                          重试
                        </button>
                      </div>
                    )}

                    {historyLoading && historyApprovals.length === 0 ? (
                      <div className="py-16 text-center text-[12.5px] text-[#78716C]">
                        正在加载历史审批记录...
                      </div>
                    ) : historyApprovals.length === 0 ? (
                      <div className="py-16 text-center text-[12.5px] text-[#78716C]">
                        暂无已处理历史记录
                      </div>
                    ) : (
                      <div className="space-y-2.5">
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
                              className="rounded-xl border border-[#ECE7DE] bg-white p-3.5 space-y-2 shadow-2xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[13.5px] font-semibold text-[#1C1917]">
                                    {item.applicant_name || "成员"}
                                  </span>
                                  <span
                                    className={cn(
                                      "rounded px-1.5 py-0.5 text-[11px] font-medium",
                                      isApproved
                                        ? "bg-[#6FAA7D]/15 text-[#2E5E3B]"
                                        : "bg-[#C0685C]/15 text-[#C0685C]",
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
                                <div className="rounded-lg bg-[#FAF8F4] border border-[#ECE7DE]/60 p-2 text-[12px] text-[#292524]">
                                  <span className="text-[#78716C]">申请事由：</span>
                                  <span>{item.reason}</span>
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-1 text-[11.5px]">
                                <span className="text-[#78716C]">
                                  {item.reviewed_by_name ? `由 ${item.reviewed_by_name} 审批` : ""}
                                </span>
                                <div className="flex gap-2">
                                  {isApproved ? (
                                    <button
                                      type="button"
                                      disabled={isProcessing || !reqId}
                                      onClick={() => void handleModifyReviewDecision(item, "rejected")}
                                      className="rounded-md px-2 py-1 font-medium text-[#78716C] hover:bg-[#C0685C]/10 hover:text-[#C0685C] transition-colors"
                                    >
                                      改为拒绝
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={isProcessing || !reqId}
                                      onClick={() => void handleModifyReviewDecision(item, "approved")}
                                      className="rounded-md px-2 py-1 font-medium text-[#2E5E3B] hover:bg-[#6FAA7D]/15 transition-colors"
                                    >
                                      改为同意
                                    </button>
                                  )}
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

              {/* In-Workbench Floating Undo Banner */}
              <AnimatePresence>
                {activeUndoList.length > 0 && (
                  <motion.div
                    key="undo-banner"
                    initial={{ opacity: 0, y: 14, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 450, damping: 30 }}
                    className="absolute bottom-12 inset-x-5 z-30 overflow-hidden rounded-xl border border-[#38332F] bg-[#1C1917]/95 backdrop-blur-md p-3 text-[#FAF8F4] shadow-xl"
                  >
                    <motion.div
                      initial={{ width: "100%" }}
                      animate={{ width: "0%" }}
                      transition={{ duration: 5, ease: "linear" }}
                      className="absolute top-0 left-0 h-0.5 bg-[#D97757]"
                    />

                    <div className="space-y-1.5 px-0.5 pt-0.5">
                      {activeUndoList.map((activeUndo) => (
                        <div key={activeUndo.id} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="size-2 rounded-full bg-[#6FAA7D] shrink-0 animate-pulse" />
                            <span className="truncate text-[12.5px] font-medium text-white/95">
                              {activeUndo.action === "approved" ? "已同意" : "已拒绝"} {activeUndo.title}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUndo(activeUndo.id)}
                            className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-[#D97757] px-3 py-1 text-[12px] font-semibold text-white shadow-2xs hover:bg-[#C0685C] active:scale-95 transition-all cursor-pointer"
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

              {/* Workbench Footer Bar */}
              <div className="shrink-0 flex items-center justify-between border-t border-[#ECE7DE]/80 bg-[#FAF8F4] px-5 py-2.5 text-[11.5px] text-[#78716C]">
                <span>审批决策将实时同步至发布管理与个人工作台</span>
                <div className="hidden sm:flex items-center gap-2 text-[11px]">
                  <span className="rounded bg-[#F5F3EE] border border-[#ECE7DE] px-1.5 py-0.5">
                    <kbd className="font-sans">1-3</kbd> 切换视图
                  </span>
                  <span className="rounded bg-[#F5F3EE] border border-[#ECE7DE] px-1.5 py-0.5">
                    <kbd className="font-sans">Esc</kbd> 关闭
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Independent Approval Feedback Modal */}
      <ApprovalFeedbackModal
        modalState={feedbackModal}
        onClose={() => setFeedbackModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
}
