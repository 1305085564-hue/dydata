import type { Dispatch, SetStateAction } from "react";
import type { ActionCenterSummary, ActionItem } from "@/lib/action-center/types";
import type {
  DailyApprovalDetail,
  ExemptionRequest,
  GroupedApprovalItem,
} from "@/lib/exemption-approvals";

export type CommandHubTab = "todos" | "approvals" | "history";
export type ReviewAction = "approved" | "rejected";
export type ApprovalFilterNature = "all" | "leave" | "waive" | "appeal";
export type ApprovalCard =
  | { type: "exemption"; group: GroupedApprovalItem; id: string }
  | { type: "appeal"; appeal: ExemptionRequest; id: string };

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  const hr = Math.floor(diff / 3_600_000);
  if (hr < 24) return `${Math.max(0, hr)} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export interface UnifiedCommandHubProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: CommandHubTab;
  onTabChange: (tab: CommandHubTab) => void;
  isAdmin: boolean;
  summary: ActionCenterSummary | null;
  summaryLoading?: boolean;
  summaryError?: string | null;
  onRefreshSummary?: () => Promise<ActionCenterSummary | null>;
  onActionCenterChanged?: () => void;
}

export interface ActiveFeedbackConfig {
  initialAction: ReviewAction;
  title: string;
  scopeHint: string;
  handler: (action: ReviewAction, feedback: string) => void;
  required?: boolean;
  confirmLabel?: string;
}

export interface ActiveUndoItem {
  id: string;
  title: string;
  action: ReviewAction;
  remainingSeconds: number;
}

export interface ApprovalTabProps {
  activeTab: CommandHubTab;
  isAdmin: boolean;
  filterNature: ApprovalFilterNature;
  setFilterNature: Dispatch<SetStateAction<ApprovalFilterNature>>;
  focusedCardIndex: number;
  setFocusedCardIndex: Dispatch<SetStateAction<number>>;
  groupedApprovals: GroupedApprovalItem[];
  appealItems: ExemptionRequest[];
  visibleCards: ApprovalCard[];
  pendingApprovals: ExemptionRequest[];
  handleApproveAll: () => void;
  approvalError: string | null;
  fetchApprovals: () => Promise<void>;
  approvalsLoading: boolean;
  todoTabCount: number;
  onTabChange: (tab: CommandHubTab) => void;
  activeFeedbackKey: string | null;
  activeFeedbackConfig: ActiveFeedbackConfig | null;
  actionProcessing: { id: string; action: "pending" } | null;
  scheduleAppealReviewWithUndo: (
    appeal: ExemptionRequest,
    action: ReviewAction,
    reason?: string,
  ) => void;
  toggleAppealReject: (appealId: string) => void;
  setActiveFeedbackKey: Dispatch<SetStateAction<string | null>>;
  handleGroupAction: (
    group: GroupedApprovalItem,
    action: ReviewAction,
    withFeedback?: boolean,
  ) => void;
  handleDailyAction: (
    group: GroupedApprovalItem,
    daily: DailyApprovalDetail,
    action: ReviewAction,
    withFeedback?: boolean,
  ) => void;
}

export interface TodoTabProps {
  activeTab: CommandHubTab;
  todoTabCount: number;
  summaryError: string | null | undefined;
  onRefreshSummary?: () => Promise<ActionCenterSummary | null>;
  actionsLoading: boolean;
  todoItems: ActionItem[];
  todoProcessingId: string | null;
  handleToggleTodo: (todo: ActionItem) => Promise<void>;
  relativeTime: (iso: string) => string;
  completedSessionIds: string[];
  completedSessionTitles: Record<string, string>;
  markTodoRead: (todoId: string) => void;
  onOpenChange: (open: boolean) => void;
}

export interface HistoryTabProps {
  activeTab: CommandHubTab;
  isAdmin: boolean;
  historyApprovals: ExemptionRequest[];
  historyError: string | null;
  fetchHistoryApprovals: () => Promise<void>;
  historyLoading: boolean;
  actionProcessing: { id: string; action: "pending" } | null;
  handleReopenAppeal: (appealId: string) => Promise<void>;
  handleReopenReviewDecision: (item: ExemptionRequest) => Promise<void>;
}
