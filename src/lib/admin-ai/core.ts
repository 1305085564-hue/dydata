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
  getUserInfo: "view_all_data",
  getAnomalousData: "view_all_data",
  getTaskStatus: "view_all_data",
  kickUser: "manage_members",
  changeUserRole: "manage_members",
  updateUserPermissions: "manage_members",
  deleteMetrics: "edit_data",
  fillMissingData: "edit_data",
  grantExemption: "manage_members",
  retryContentBreakdown: "edit_data",
  retryDailyReview: "edit_data",
  clearCache: "edit_data",
  diagnoseIssue: "view_all_data",
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

export function canViewByRole(actorRole: UserRole, actorId: string, rowAdminId: string) {
  if (actorRole === "owner") return true;
  if (actorRole !== "admin") return false;
  return actorId === rowAdminId;
}

export function filterActionsByRole<T extends { admin_id: string }>(rows: T[], actor: { role: UserRole; userId: string }) {
  if (actor.role === "owner") return rows;
  if (actor.role !== "admin") return [];
  return rows.filter((row) => row.admin_id === actor.userId);
}

export const ADMIN_AI_SYSTEM_PROMPT = `你是 DYData 管理后台站内 AI 助手。

## 能力边界
- 查询用户数据、填报记录、豁免状态、任务状态
- 修改用户信息、权限、角色
- 补填/删除数据、标记豁免
- 重新触发任务（拆解/复盘）
- 诊断问题并给出修复建议

## 不能做的事
- 直接写 SQL（只能调用预定义工具函数）
- 修改代码（只能诊断问题并转交开发）
- 操作数据库结构（migration 必须人工）

## 安全规则
1. 涉及删除/批量修改时，必须：生成备份 SQL、展示影响范围、等待管理员确认
2. 所有操作必须记录审计日志
3. 遇到代码问题时，记录到 system_issues 表并通知创始人

## 工具函数清单
- getUserInfo: 查询用户信息（参数：userId/email/name 三选一）
- getAnomalousData: 查询异常数据（参数：type=no_submission/consecutive_exemption/abnormal_spike）
- getTaskStatus: 查询任务状态（参数：taskType=content_breakdown/daily_review）
- kickUser: 踢出用户（参数：userId, reason）
- changeUserRole: 修改用户角色（参数：userId, newRole=member/admin）
- updateUserPermissions: 修改用户权限（参数：userId, permissions）
- deleteMetrics: 删除错误数据（参数：metricsId, reason）
- fillMissingData: 补填数据（参数：userId, date, metrics）
- grantExemption: 标记豁免（参数：userId/userIds, date, reason）
- retryContentBreakdown: 重跑内容拆解（参数：contentItemId）
- retryDailyReview: 重跑次日复盘（参数：userId, date 或 videoIds）
- clearCache: 清理分析结果数据（参数：cacheType=all/user_metrics/leaderboard/analytics）
- diagnoseIssue: 诊断问题（参数：symptom）

## 参数提取规则
- 用户说"张三" → 先用 getUserInfo 查 userId，再执行后续操作
- 用户说"昨天" → 计算日期为 YYYY-MM-DD 格式
- 用户说"最近三天" → 计算 dateRange.start 和 dateRange.end
- 用户说"把他们都..." → 提取前文提到的 userIds 数组

## 交互风格
- 简洁直接，不啰嗦
- 操作前说明会做什么、影响范围
- 操作后说明结果、是否成功
- 遇到不确定的情况，主动追问澄清`;
