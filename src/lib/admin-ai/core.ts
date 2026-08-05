import type { PermissionKey, UserRole } from "@/types";

export const ADMIN_AI_ALLOWED_TOOLS = [
  "getUserInfo",
  "getAnomalousData",
  "getTaskStatus",
  "kickUser",
  "changeUserRole",
  "updateUserPermissions",
  "deleteMetrics",
  "fillMissingData",
  "grantExemption",
  "retryContentBreakdown",
  "retryDailyReview",
  "clearCache",
  "diagnoseIssue",
] as const;

export type AdminAiToolName = (typeof ADMIN_AI_ALLOWED_TOOLS)[number];

export type RiskContext = {
  batch: boolean;
  cacheType?: "all" | "user_metrics" | "leaderboard" | "analytics";
};

export type RiskLevel = "low" | "high";

export const TOOL_PERMISSION_MAP: Record<AdminAiToolName, PermissionKey> = {
  getUserInfo: "view_analytics",
  getAnomalousData: "view_analytics",
  getTaskStatus: "view_analytics",
  kickUser: "manage_members",
  changeUserRole: "manage_members",
  updateUserPermissions: "manage_members",
  deleteMetrics: "manage_system",
  fillMissingData: "manage_system",
  grantExemption: "manage_members",
  retryContentBreakdown: "manage_system",
  retryDailyReview: "manage_system",
  clearCache: "manage_system",
  diagnoseIssue: "manage_system",
};

const STRICT_HIGH_RISK_TOOLS = new Set<AdminAiToolName>([
  "kickUser",
  "changeUserRole",
  "updateUserPermissions",
  "deleteMetrics",
]);

export function isWhitelistedToolName(tool: string): tool is AdminAiToolName {
  return (ADMIN_AI_ALLOWED_TOOLS as readonly string[]).includes(tool);
}

export function assertToolIsWhitelisted(tool: string): asserts tool is AdminAiToolName {
  if (!isWhitelistedToolName(tool)) {
    throw new Error("未注册工具，禁止执行");
  }
}

export function determineRiskLevel(tool: AdminAiToolName, context: RiskContext): RiskLevel {
  if (STRICT_HIGH_RISK_TOOLS.has(tool)) return "high";

  if (tool === "grantExemption" && context.batch) return "high";
  if ((tool === "retryContentBreakdown" || tool === "retryDailyReview") && context.batch) return "high";
  if (tool === "clearCache" && ["all", "analytics", "leaderboard"].includes(context.cacheType ?? "")) return "high";

  return "low";
}

export function isHighRiskAction(tool: AdminAiToolName, context: RiskContext) {
  return determineRiskLevel(tool, context) === "high";
}

export function shouldRequireConfirmation(tool: AdminAiToolName, context: RiskContext) {
  return isHighRiskAction(tool, context);
}

export function filterActionsByRole<T extends { admin_id: string }>(rows: T[], actor: { role: UserRole; userId: string }) {
  if (actor.role === "owner") return rows;
  return rows.filter((row) => row.admin_id === actor.userId);
}
