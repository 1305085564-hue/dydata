import type { ViolationCase, ViolationStatus, ViolationSubmitter, ViolationTeam } from "./types";

export const VIOLATION_CATEGORIES = ["下粉", "直播", "短视频", "其他"] as const;

export function formatDateTime(value?: string | null) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getPassRate(input: { pass_count?: number | null; fail_count?: number | null }) {
  const passCount = input.pass_count ?? 0;
  const failCount = input.fail_count ?? 0;
  const total = passCount + failCount;
  if (total <= 0) return null;

  return Math.round((passCount / total) * 100);
}

export function getConfidenceLabel(total: number) {
  if (total >= 6) return "可靠";
  if (total >= 3) return "初步可信";
  if (total > 0) return "样本不足";
  return "暂无测试";
}

export function getStatusLabel(caseItem: Pick<ViolationCase, "status" | "is_violation">) {
  if (caseItem.status === "verified") {
    return caseItem.is_violation ? "已确认违规" : "已确认可用";
  }

  const map: Record<ViolationStatus, string> = {
    submitted: "待验证",
    verified: "已确认",
    rejected: "已驳回",
    archived: "已归档",
  };

  return map[caseItem.status as ViolationStatus] ?? "未知状态";
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function getSubmitterName(caseItem: ViolationCase) {
  const submitter = first<ViolationSubmitter>(caseItem.submitter) ?? first<ViolationSubmitter>(caseItem.profiles);
  return submitter?.name?.trim() || submitter?.email?.trim() || "未知提交人";
}

export function getTeamName(caseItem: ViolationCase) {
  const team = first<ViolationTeam>(caseItem.team) ?? first<ViolationTeam>(caseItem.teams);
  return team?.name?.trim() || "未分组";
}

export function getAccountName(caseItem: Pick<ViolationCase, "account_name_snapshot" | "account_id">) {
  return caseItem.account_name_snapshot?.trim() || (caseItem.account_id ? "关联账号" : "未关联账号");
}

