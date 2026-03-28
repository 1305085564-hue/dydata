import { TOOL_PERMISSION_MAP, type AdminAiToolName } from "@/lib/admin-ai/core";
import type { ToolContext, ToolExecutionInput, ToolExecutionResult } from "./types";
import { toBoolean } from "./utils";
import { getUserInfo, getAnomalousData, getTaskStatus } from "./data-query";
import { kickUser, changeUserRole, updateUserPermissions } from "./user-management";
import { deleteMetrics, fillMissingData, grantExemption } from "./data-correction";
import { retryContentBreakdown, retryDailyReview, clearCache } from "./task-management";
import { diagnoseIssue } from "./diagnosis";

function hasToolPermission(input: ToolContext, toolName: AdminAiToolName) {
  if (input.actorRole === "owner") return true;
  if (input.actorRole !== "admin") return false;
  const required = TOOL_PERMISSION_MAP[toolName];
  return input.actorPermissions?.[required] === true;
}

export async function executeAdminTool(input: ToolExecutionInput): Promise<ToolExecutionResult> {
  if (!hasToolPermission(input.context, input.toolName as AdminAiToolName)) {
    return { success: false, error: "无权限执行该工具" };
  }

  const dryRun = toBoolean(input.dryRun);

  switch (input.toolName) {
    case "getUserInfo":
      return getUserInfo(input.params);
    case "getAnomalousData":
      return getAnomalousData(input.params);
    case "getTaskStatus":
      return getTaskStatus(input.params);
    case "kickUser":
      return kickUser(input.params, dryRun);
    case "changeUserRole":
      return changeUserRole(input.params, dryRun, input.context);
    case "updateUserPermissions":
      return updateUserPermissions(input.params, dryRun);
    case "deleteMetrics":
      return deleteMetrics(input.params, dryRun);
    case "fillMissingData":
      return fillMissingData(input.params);
    case "grantExemption":
      return grantExemption(input.params, dryRun);
    case "retryContentBreakdown":
      return retryContentBreakdown(input.params, dryRun);
    case "retryDailyReview":
      return retryDailyReview(input.params, dryRun);
    case "clearCache":
      return clearCache(input.params, dryRun);
    case "diagnoseIssue":
      return diagnoseIssue(input.params);
    default:
      return { success: false, error: "未注册工具，禁止执行" };
  }
}

export type { ToolContext, ToolExecutionInput, ToolExecutionResult } from "./types";

