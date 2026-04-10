import type { AdminAiToolName } from "./core";
import type { ToolExecutionResult } from "@/lib/admin-tools";

export type AssistantFieldItem = {
  label: string;
  value: string;
};

export type AssistantListItem = {
  title: string;
  description?: string;
};

export type AssistantDetailSection =
  | {
      kind: "fields";
      title: string;
      items: AssistantFieldItem[];
    }
  | {
      kind: "list";
      title: string;
      items: AssistantListItem[];
    }
  | {
      kind: "table";
      title: string;
      columns: string[];
      rows: string[][];
    };

export type AssistantDetails = {
  sections: AssistantDetailSection[];
  nextSteps?: string[];
};

export type AssistantDebug = {
  toolName: string;
  toolParams?: Record<string, unknown>;
  rawData?: Record<string, unknown> | null;
  backupSql?: string | null;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
};

export type AssistantPresentation = {
  answer: string;
  details?: AssistantDetails;
  historyTitle: string;
};

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN");
}

function formatDateTime(value: unknown) {
  if (typeof value !== "string" || !value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

function formatNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("zh-CN").format(value);
}

function toDisplayText(value: unknown) {
  if (value == null || value === "") return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function cleanItems(items: AssistantFieldItem[]) {
  return items.filter((item) => item.value && item.value !== "-");
}

function fields(title: string, items: AssistantFieldItem[]): AssistantDetailSection | null {
  const cleaned = cleanItems(items);
  if (!cleaned.length) return null;
  return { kind: "fields", title, items: cleaned };
}

function list(title: string, items: AssistantListItem[]): AssistantDetailSection | null {
  const cleaned = items.filter((item) => item.title.trim());
  if (!cleaned.length) return null;
  return { kind: "list", title, items: cleaned };
}

function table(title: string, columns: string[], rows: string[][]): AssistantDetailSection | null {
  const cleaned = rows.filter((row) => row.some((cell) => cell && cell !== "-"));
  if (!cleaned.length) return null;
  return { kind: "table", title, columns, rows: cleaned };
}

function compactSections(sections: Array<AssistantDetailSection | null>) {
  return sections.filter((section): section is AssistantDetailSection => Boolean(section));
}

function roleLabel(role: unknown) {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "管理员";
    case "member":
      return "成员";
    default:
      return toDisplayText(role);
  }
}

function statusLabel(status: unknown) {
  switch (status) {
    case "active":
      return "正常";
    case "banned":
      return "已禁用";
    default:
      return toDisplayText(status);
  }
}

function permissionSummary(value: unknown) {
  if (!value || typeof value !== "object") return "未设置";
  const enabled = Object.entries(value as Record<string, unknown>)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => key);
  return enabled.length ? `已开通 ${enabled.length} 项` : "未开通";
}

function getAnomalyTypeLabel(type: unknown) {
  switch (type) {
    case "no_submission":
      return "未填报";
    case "consecutive_exemption":
      return "连续豁免";
    case "abnormal_spike":
      return "播放异常波动";
    default:
      return "异常数据";
  }
}

function getTaskTypeLabel(type: unknown) {
  switch (type) {
    case "daily_review":
      return "次日复盘";
    case "content_breakdown":
      return "内容拆解";
    default:
      return "任务";
  }
}

function getIssueLabel(issueType: unknown) {
  switch (issueType) {
    case "code_bug":
      return "代码问题";
    case "data_corruption":
      return "数据问题";
    case "task_stuck":
      return "任务卡住";
    case "user_error":
      return "使用方式问题";
    default:
      return "暂时无法确定";
  }
}

function getActionLabel(action: unknown) {
  switch (action) {
    case "retry":
      return "先重跑相关任务";
    case "fix_data":
      return "先按数据修复方向处理";
    case "report_to_dev":
      return "记录后转开发排查";
    case "guide_user":
      return "先按使用方式引导";
    default:
      return "继续补充现象后再判断";
  }
}

function buildUserInfoPresentation(result: ToolExecutionResult): AssistantPresentation {
  const data = (result.data ?? {}) as Record<string, unknown>;
  const user = ((data.user ?? {}) as Record<string, unknown>) ?? {};
  const recentMetrics = Array.isArray(data.recentMetrics) ? data.recentMetrics : [];
  const exemptions = Array.isArray(data.exemptions) ? data.exemptions : [];
  const userName = toDisplayText(user.name);

  return {
    answer: `${userName} 当前是${roleLabel(user.role)}，账号状态${statusLabel(user.status)}。`,
    historyTitle: `${userName}的用户信息`,
    details: {
      sections: compactSections([
        fields("用户概况", [
          { label: "姓名", value: userName },
          { label: "角色", value: roleLabel(user.role) },
          { label: "状态", value: statusLabel(user.status) },
          { label: "权限", value: permissionSummary(user.permissions) },
        ]),
        table(
          "最近日报",
          ["日期", "播放", "点赞", "评论", "分享", "收藏", "涨粉"],
          recentMetrics.slice(0, 5).map((item) => {
            const row = item as Record<string, unknown>;
            return [
              formatDate(row.report_date),
              formatNumber(row.play_count),
              formatNumber(row.likes),
              formatNumber(row.comments),
              formatNumber(row.shares),
              formatNumber(row.favorites),
              formatNumber(row.follower_gain),
            ];
          }),
        ),
        table(
          "豁免记录",
          ["状态", "类型", "开始", "结束", "原因"],
          exemptions.slice(0, 5).map((item) => {
            const row = item as Record<string, unknown>;
            return [
              toDisplayText(row.status),
              toDisplayText(row.exemption_type),
              formatDate(row.start_date),
              formatDate(row.end_date),
              toDisplayText(row.reason),
            ];
          }),
        ),
      ]),
      nextSteps: ["如果你要，我可以继续查这个人的日报异常、权限问题或最近任务状态。"],
    },
  };
}

function buildAnomalyPresentation(
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  const data = (result.data ?? {}) as Record<string, unknown>;
  const anomalies = Array.isArray(data.anomalies) ? data.anomalies : [];
  const typeLabel = getAnomalyTypeLabel(params.type);
  const count = anomalies.length;
  const names = anomalies
    .map((item) => toDisplayText((item as Record<string, unknown>).userName))
    .filter((name) => name !== "-")
    .slice(0, 5);
  const answer =
    count > 0
      ? `这次共查到 ${count} 条${typeLabel}记录${names.length ? `，重点是 ${names.join("、")}` : ""}。`
      : `这次没有查到${typeLabel}记录。`;

  return {
    answer,
    historyTitle: `${typeLabel}查询结果`,
    details: {
      sections: compactSections([
        fields("关键数字", [{ label: "异常数量", value: String(count) }]),
        list(
          "重点名单",
          anomalies.slice(0, 5).map((item) => {
            const row = item as Record<string, unknown>;
            return {
              title: toDisplayText(row.userName),
              description: [formatDate(row.date), toDisplayText(row.issue)].filter((part) => part !== "-").join(" · "),
            };
          }),
        ),
        table(
          "明细",
          ["日期", "姓名", "问题"],
          anomalies.map((item) => {
            const row = item as Record<string, unknown>;
            return [formatDate(row.date), toDisplayText(row.userName), toDisplayText(row.issue)];
          }),
        ),
      ]),
      nextSteps: ["如果你要，我可以继续按日期、任务类型或人员范围再筛一遍。"],
    },
  };
}

function buildTaskPresentation(
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  const data = (result.data ?? {}) as Record<string, unknown>;
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const taskTypeLabel = getTaskTypeLabel(params.taskType);
  const completedCount = tasks.filter((item) => (item as Record<string, unknown>).status === "completed").length;
  const failedCount = tasks.filter((item) => (item as Record<string, unknown>).status === "failed").length;
  const processingCount = tasks.length - completedCount - failedCount;
  const answer =
    tasks.length > 0
      ? `${taskTypeLabel}共查到 ${tasks.length} 条记录，完成 ${completedCount} 条，失败 ${failedCount} 条。`
      : `当前没有查到${taskTypeLabel}记录。`;

  return {
    answer,
    historyTitle: `${taskTypeLabel}状态查询`,
    details: {
      sections: compactSections([
        fields("关键数字", [
          { label: "总数", value: String(tasks.length) },
          { label: "已完成", value: String(completedCount) },
          { label: "失败", value: String(failedCount) },
          { label: "处理中", value: String(processingCount) },
        ]),
        table(
          "任务明细",
          ["状态", "时间", "补充说明"],
          tasks.slice(0, 10).map((item) => {
            const row = item as Record<string, unknown>;
            return [toDisplayText(row.status), formatDateTime(row.createdAt), toDisplayText(row.error)];
          }),
        ),
      ]),
      nextSteps: ["如果你要，我可以继续帮你重跑失败任务或缩小到某个日期范围。"],
    },
  };
}

function buildDiagnosisPresentation(result: ToolExecutionResult): AssistantPresentation {
  const data = (result.data ?? {}) as Record<string, unknown>;
  const issueLabel = getIssueLabel(data.issueType);
  const suggestedAction = getActionLabel(data.suggestedAction);

  return {
    answer: `这更像${issueLabel}。`,
    historyTitle: `${issueLabel}诊断`,
    details: {
      sections: compactSections([
        fields("判断", [{ label: "结论", value: issueLabel }]),
        list("建议动作", [{ title: suggestedAction, description: toDisplayText(data.diagnosis) }]),
        fields("后续处理", [{ label: "建议", value: suggestedAction }]),
      ]),
      nextSteps: ["如果你要，我可以继续按数据、任务或权限方向往下查。"],
    },
  };
}

function buildChangeRoleConfirmation(
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  const newRole = roleLabel(params.newRole);
  const before = (result.beforeSnapshot ?? {}) as Record<string, unknown>;

  return {
    answer: `我将把 ${toDisplayText(before.id ? before.id : "该用户")} 的角色改成${newRole}。`,
    historyTitle: `角色变更确认`,
    details: {
      sections: compactSections([
        fields("影响范围", [
          { label: "当前角色", value: roleLabel(before.role) },
          { label: "变更后角色", value: newRole },
          { label: "说明", value: "角色变更后，后台访问范围会跟着变化。" },
        ]),
      ]),
      nextSteps: ["确认后才会执行；如果还要先核对权限，我可以先展示当前权限情况。"],
    },
  };
}

function buildUpdatePermissionsConfirmation(
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  const permissions = params.permissions as Record<string, unknown> | undefined;
  const enabledCount = permissions
    ? Object.values(permissions).filter((value) => value === true).length
    : 0;
  const before = (result.beforeSnapshot ?? {}) as Record<string, unknown>;

  return {
    answer: "我将更新这个账号的后台权限。",
    historyTitle: "权限修改确认",
    details: {
      sections: compactSections([
        fields("影响范围", [
          { label: "当前权限", value: permissionSummary(before.permissions) },
          { label: "变更后权限", value: `预计开通 ${enabledCount} 项` },
          { label: "说明", value: "权限变更会直接影响后台可见页面和操作范围。" },
        ]),
      ]),
      nextSteps: ["确认后才会执行；如果你要，我也可以先帮你复核权限是否配齐。"],
    },
  };
}

function buildKickUserConfirmation(result: ToolExecutionResult): AssistantPresentation {
  const affectedData = (result.affectedData ?? {}) as Record<string, unknown>;
  const user = ((affectedData.user ?? {}) as Record<string, unknown>) ?? {};
  const userName = toDisplayText(user.name);

  return {
    answer: `我将把 ${userName} 从当前后台使用范围里移出。`,
    historyTitle: `移出 ${userName}`,
    details: {
      sections: compactSections([
        fields("影响范围", [
          { label: "角色", value: roleLabel(user.role) },
          { label: "日报记录", value: `${toDisplayText(affectedData.metricsCount)} 条` },
          { label: "豁免记录", value: `${toDisplayText(affectedData.exemptionsCount)} 条` },
          { label: "说明", value: "执行后该账号会失去当前后台操作能力。" },
        ]),
      ]),
      nextSteps: ["这是高风险操作，确认后才会执行。"],
    },
  };
}

function buildDeleteMetricsConfirmation(
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  const before = (result.beforeSnapshot ?? {}) as Record<string, unknown>;

  return {
    answer: "我将删除这条错误数据。",
    historyTitle: "删除错误数据确认",
    details: {
      sections: compactSections([
        fields("影响范围", [
          { label: "日期", value: formatDate(before.report_date) },
          { label: "标题", value: toDisplayText(before.title) },
          { label: "播放", value: formatNumber(before.play_count) },
          { label: "说明", value: toDisplayText(params.reason) || "删除后这条日报数据会消失。" },
        ]),
      ]),
      nextSteps: ["这是高风险操作，确认后才会执行。"],
    },
  };
}

function buildRetryDailyReviewConfirmation(
  result: ToolExecutionResult,
): AssistantPresentation {
  const affectedData = (result.affectedData ?? {}) as Record<string, unknown>;
  return {
    answer: "我将把这些次日复盘任务重新加入执行队列。",
    historyTitle: "次日复盘重跑确认",
    details: {
      sections: compactSections([
        fields("影响范围", [
          { label: "任务数量", value: toDisplayText(affectedData.targetCount) },
          { label: "说明", value: "原有结果会被清空，系统会重新生成复盘内容。" },
        ]),
      ]),
      nextSteps: ["确认后才会执行。"],
    },
  };
}

function buildGrantExemptionConfirmation(
  result: ToolExecutionResult,
): AssistantPresentation {
  const affectedData = (result.affectedData ?? {}) as Record<string, unknown>;
  return {
    answer: `我将为 ${toDisplayText(affectedData.userCount)} 人标记豁免。`,
    historyTitle: "批量豁免确认",
    details: {
      sections: compactSections([
        fields("影响范围", [
          { label: "人数", value: toDisplayText(affectedData.userCount) },
          { label: "日期", value: formatDate(affectedData.date) },
          { label: "原因", value: toDisplayText(affectedData.reason) },
        ]),
      ]),
      nextSteps: ["这是批量操作，确认后才会执行。"],
    },
  };
}

function buildClearCacheConfirmation(
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  const affectedData = (result.affectedData ?? {}) as Record<string, unknown>;
  return {
    answer: "我将清理分析结果缓存数据。",
    historyTitle: "清理分析结果确认",
    details: {
      sections: compactSections([
        fields("影响范围", [
          { label: "范围", value: toDisplayText(params.cacheType) },
          { label: "说明", value: toDisplayText(affectedData.note) },
        ]),
      ]),
      nextSteps: ["确认后才会执行。"],
    },
  };
}

function buildGenericConfirmation(toolName: AdminAiToolName): AssistantPresentation {
  return {
    answer: "我将执行这项后台操作。",
    historyTitle: toolName,
    details: {
      sections: compactSections([
        fields("影响范围", [{ label: "说明", value: "这项操作需要你先确认后才能继续。" }]),
      ]),
      nextSteps: ["确认后才会执行。"],
    },
  };
}

function buildConfirmationPresentation(
  toolName: AdminAiToolName,
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  switch (toolName) {
    case "changeUserRole":
      return buildChangeRoleConfirmation(params, result);
    case "updateUserPermissions":
      return buildUpdatePermissionsConfirmation(params, result);
    case "kickUser":
      return buildKickUserConfirmation(result);
    case "deleteMetrics":
      return buildDeleteMetricsConfirmation(params, result);
    case "retryDailyReview":
      return buildRetryDailyReviewConfirmation(result);
    case "grantExemption":
      return buildGrantExemptionConfirmation(result);
    case "clearCache":
      return buildClearCacheConfirmation(params, result);
    default:
      return buildGenericConfirmation(toolName);
  }
}

function buildMutationSuccessPresentation(
  toolName: AdminAiToolName,
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  switch (toolName) {
    case "changeUserRole":
      return {
        answer: `角色已改成${roleLabel(params.newRole)}。`,
        historyTitle: "角色修改完成",
      };
    case "updateUserPermissions":
      return {
        answer: "权限已更新。",
        historyTitle: "权限修改完成",
      };
    case "kickUser":
      return {
        answer: "账号处理已完成。",
        historyTitle: "账号处理完成",
      };
    case "deleteMetrics":
      return {
        answer: "错误数据已删除。",
        historyTitle: "错误数据已删除",
      };
    case "fillMissingData":
      return {
        answer: `已补填 ${formatDate(params.date)} 的数据。`,
        historyTitle: "补填数据完成",
      };
    case "grantExemption":
      return {
        answer: "豁免已标记。",
        historyTitle: "豁免标记完成",
      };
    case "retryContentBreakdown":
      return {
        answer: "内容拆解任务已重新触发。",
        historyTitle: "内容拆解已重跑",
      };
    case "retryDailyReview":
      return {
        answer: "次日复盘任务已重新触发。",
        historyTitle: "次日复盘已重跑",
      };
    case "clearCache":
      return {
        answer: "分析结果数据已清理。",
        historyTitle: "分析结果已清理",
      };
    default:
      return {
        answer: result.success ? "操作执行成功。" : result.error ?? "操作执行失败。",
        historyTitle: toolName,
      };
  }
}

export function buildSuccessPresentation(input: {
  toolName: AdminAiToolName;
  params: Record<string, unknown>;
  result: ToolExecutionResult;
}): AssistantPresentation {
  const { toolName, params, result } = input;

  switch (toolName) {
    case "getUserInfo":
      return buildUserInfoPresentation(result);
    case "getAnomalousData":
      return buildAnomalyPresentation(params, result);
    case "getTaskStatus":
      return buildTaskPresentation(params, result);
    case "diagnoseIssue":
      return buildDiagnosisPresentation(result);
    default:
      return buildMutationSuccessPresentation(toolName, params, result);
  }
}

export function buildConfirmationRequiredPresentation(input: {
  toolName: AdminAiToolName;
  params: Record<string, unknown>;
  result: ToolExecutionResult;
}): AssistantPresentation {
  return buildConfirmationPresentation(input.toolName, input.params, input.result);
}

export function buildCancelledPresentation(toolName: AdminAiToolName): AssistantPresentation {
  return {
    answer: "操作已取消，当前没有改动数据。",
    historyTitle: `${toolName}已取消`,
  };
}
