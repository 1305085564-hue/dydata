import type { ToolExecutionResult } from "./types";
import { toSafeString } from "./utils";

export async function diagnoseIssue(params: Record<string, unknown>): Promise<ToolExecutionResult> {
  const symptom = toSafeString(params.symptom);
  if (!symptom) return { success: false, error: "缺少 symptom" };

  const lower = symptom.toLowerCase();
  let issueType: "code_bug" | "data_corruption" | "task_stuck" | "user_error" | "unknown" = "unknown";
  let suggestedAction: "retry" | "fix_data" | "report_to_dev" | "guide_user" = "guide_user";

  if (lower.includes("报错") || lower.includes("500") || lower.includes("崩溃") || lower.includes("代码")) {
    issueType = "code_bug";
    suggestedAction = "report_to_dev";
  } else if (lower.includes("数据不对") || lower.includes("脏数据") || lower.includes("重复") || lower.includes("缺失")) {
    issueType = "data_corruption";
    suggestedAction = "fix_data";
  } else if (lower.includes("卡住") || lower.includes("超时") || lower.includes("队列") || lower.includes("任务")) {
    issueType = "task_stuck";
    suggestedAction = "retry";
  } else if (lower.includes("不会") || lower.includes("不知道") || lower.includes("怎么")) {
    issueType = "user_error";
    suggestedAction = "guide_user";
  }

  return {
    success: true,
    data: {
      issueType,
      diagnosis: `诊断结果：${issueType}`,
      suggestedAction,
      fixSql: issueType === "data_corruption" ? "-- 建议管理员确认后执行数据修复脚本" : undefined,
    },
  };
}
