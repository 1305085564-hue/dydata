import { isReviewExemptionAction, sortActionItems, type ActionCenterSummary, type ActionItem } from "@/lib/action-center/types";
import type { ExemptionRequest, GroupedApprovalItem } from "@/lib/exemption-approvals";
import type { ApprovalCard, ApprovalFilterNature } from "@/lib/command-hub/types";

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

export function getCommandHubRelativeTime(iso: string, now: number) {
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
}

export function getTodoItems(
  summary: ActionCenterSummary | null,
  completedSessionIds: string[],
): ActionItem[] {
  const summaryItems = (summary?.topItems ?? []).filter(
    (item) => !isReviewExemptionAction(item.action),
  );
  return sortActionItems(summaryItems).filter(
    (item) => !completedSessionIds.includes(item.id),
  );
}

export function splitApprovalItems(pendingApprovals: ExemptionRequest[]) {
  return {
    exemptionItems: pendingApprovals.filter((item) => item.source !== "fulfillment_appeal"),
    appealItems: pendingApprovals.filter((item) => item.source === "fulfillment_appeal"),
  };
}

export function buildVisibleApprovalCards(
  filterNature: ApprovalFilterNature,
  groupedApprovals: GroupedApprovalItem[],
  appealItems: ExemptionRequest[],
): ApprovalCard[] {
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
}
