import { isWhitelistedToolName, TOOL_PERMISSION_MAP, type AdminAiToolName } from "@/lib/admin-ai/core";
import type { ToolContext, ToolExecutionInput, ToolExecutionResult } from "./types";
import { toBoolean } from "./utils";
import { getUserInfo, getAnomalousData, getTaskStatus } from "./data-query";
import { kickUser, changeUserRole } from "./user-management";
import { deleteMetrics, fillMissingData, grantExemption } from "./data-correction";
import { retryContentBreakdown, retryDailyReview, clearCache } from "./task-management";
import { diagnoseIssue } from "./diagnosis";

function hasToolPermission(input: ToolContext, toolName: AdminAiToolName) {
  const required = TOOL_PERMISSION_MAP[toolName];
  return input.actorCompanyRole === "company_owner"
    && input.actorPermissions?.use_ai_assist === true
    && input.actorPermissions?.[required] === true;
}

export async function executeAdminTool(input: ToolExecutionInput): Promise<ToolExecutionResult> {
  if (!isWhitelistedToolName(input.toolName)) {
    return { success: false, error: "未注册工具，禁止执行" };
  }

  if (!hasToolPermission(input.context, input.toolName as AdminAiToolName)) {
    return { success: false, error: "无权限执行该工具" };
  }

  const dryRun = toBoolean(input.dryRun);

  switch (input.toolName) {
    case "getUserInfo":
      return getUserInfo(input.params, undefined, input.context);
    case "getAnomalousData":
      return getAnomalousData(input.params, undefined, input.context);
    case "getTaskStatus":
      return getTaskStatus(input.params, undefined, input.context);
    case "kickUser":
      return kickUser(input.params, dryRun, input.context);
    case "changeUserRole":
      return changeUserRole(input.params, dryRun, input.context);
    case "deleteMetrics":
      return deleteMetrics(input.params, dryRun, input.context);
    case "fillMissingData":
      return fillMissingData(input.params, input.context);
    case "grantExemption":
      return grantExemption(input.params, dryRun, input.context);
    case "retryContentBreakdown":
      return retryContentBreakdown(input.params, dryRun, input.context);
    case "retryDailyReview":
      return retryDailyReview(input.params, dryRun, input.context);
    case "clearCache":
      return clearCache(input.params, dryRun, input.context);
    case "diagnoseIssue":
      return diagnoseIssue(input.params);
    default:
      return { success: false, error: "未注册工具，禁止执行" };
  }
}

export type { ToolContext, ToolExecutionInput, ToolExecutionResult } from "./types";
