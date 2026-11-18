import type { ActionCenterSummary } from "@/lib/action-center/types";
import type { ExemptionRequest, GroupedApprovalItem } from "@/lib/exemption-approvals";

export type CommandHubTab = "todos" | "approvals" | "history";
export type ReviewAction = "approved" | "rejected";

/** 「等你批」队列里的一件事：一组请假/免交，或一条补交申请 */
export type ApprovalQueueItem =
  | { kind: "exemption"; id: string; group: GroupedApprovalItem }
  | { kind: "appeal"; id: string; appeal: ExemptionRequest };

export interface ApprovalWorkbenchProps {
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

export interface ActiveUndoItem {
  id: string;
  title: string;
  action: ReviewAction;
  remainingSeconds: number;
}

export function formatShanghaiDateTime(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
