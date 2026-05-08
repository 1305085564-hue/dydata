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

const CACHE_TYPE_LABEL: Record<string, string> = {
  all: "全部分析结果",
  user_metrics: "用户数据缓存",
  leaderboard: "排行榜结果",
  analytics: "AI 洞察结果",
};

function cacheTypeLabel(value: unknown) {
  const key = typeof value === "string" ? value : "";
  return CACHE_TYPE_LABEL[key] ?? (key || "未指定范围");
}

function truncateTitle(value: string, max = 24) {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (Array.from(text).length <= max) return text;
  const chars = Array.from(text).slice(0, max - 1);
  return `${chars.join("")}…`;
}

function firstString(...values: Array<unknown>) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

type ConfirmationCopy = {
  answer: string;
  riskTitle: string;
  riskDetail: string;
  impactTitle: string;
  impactHintLabel?: string;
  impactHint?: string;
  nextAction?: string;
};

const HIGH_RISK_CONFIRMATION_COPY: Record<string, ConfirmationCopy> = {
  kickUser: {
    answer: "我将踢出该用户",
    riskTitle: "为什么要确认",
    riskDetail: "踢出后该用户立即失去登录权限，填报数据保留但不再关联活跃账号。",
    impactTitle: "影响范围",
    nextAction: "确认后立即执行；取消则一切照旧。",
  },
  changeUserRole: {
    answer: "我将变更该用户角色",
    riskTitle: "为什么要确认",
    riskDetail:
      "角色变更后，默认权限会按新角色模板重置；如果当前该用户有自定义权限，会被覆盖。",
    impactTitle: "影响范围",
    nextAction: "确认后立即执行；取消则一切照旧。",
  },
  updateUserPermissions: {
    answer: "我将更新该账号权限",
    riskTitle: "为什么要确认",
    riskDetail:
      "只改权限不改角色；对应功能入口会立即生效或立即消失，用户下次刷新即可看到变化。",
    impactTitle: "影响范围",
    nextAction: "确认后立即执行；取消则一切照旧。",
  },
  deleteMetrics: {
    answer: "我将删除这条日报数据",
    riskTitle: "为什么要确认",
    riskDetail:
      "删除后无法直接恢复，执行前会自动生成备份 SQL；影响范围等于命中的记录条数。",
    impactTitle: "影响范围",
    impactHintLabel: "备份",
    impactHint: "自动生成 profiles_backup / daily_reports_backup 可供回滚。",
    nextAction: "确认后立即执行；取消则一切照旧。",
  },
  grantExemption: {
    answer: "我将批量标记豁免",
    riskTitle: "为什么要确认",
    riskDetail:
      "批量豁免后，对应日期不再计入未填报；只影响指定日期范围，不改账号角色与权限。",
    impactTitle: "影响范围",
    nextAction: "确认后立即执行；取消则一切照旧。",
  },
  retryContentBreakdown: {
    answer: "我将批量重跑内容拆解",
    riskTitle: "为什么要确认",
    riskDetail: "重跑会覆盖原有拆解结果；AI 调用会重新消耗额度。",
    impactTitle: "影响范围",
    nextAction: "确认后立即执行；取消则保留现有结果。",
  },
  retryDailyReview: {
    answer: "我将批量重跑次日复盘",
    riskTitle: "为什么要确认",
    riskDetail: "重跑会覆盖原有复盘结果；AI 调用会重新消耗额度。",
    impactTitle: "影响范围",
    nextAction: "确认后立即执行；取消则保留现有结果。",
  },
  clearCache: {
    answer: "我将清理分析结果缓存",
    riskTitle: "为什么要确认",
    riskDetail:
      "清缓存范围 = all 时影响全站用户；建议先清具体命中的 key，避免一次性擦掉全部分析结果。",
    impactTitle: "影响范围",
    nextAction: "确认后立即执行；取消则保留现有缓存。",
  },
};

function buildUserInfoPresentation(result: ToolExecutionResult): AssistantPresentation {
  const data = (result.data ?? {}) as Record<string, unknown>;
  const user = ((data.user ?? {}) as Record<string, unknown>) ?? {};
  const recentMetrics = Array.isArray(data.recentMetrics) ? data.recentMetrics : [];
  const exemptions = Array.isArray(data.exemptions) ? data.exemptions : [];
  const userName = toDisplayText(user.name);

  return {
    answer: `${userName} 当前是${roleLabel(user.role)}，账号状态${statusLabel(user.status)}。`,
    historyTitle: truncateTitle(userName !== "-" ? `${userName} 的用户信息` : "用户信息查询"),
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

  const dateRange = firstString(
    typeof params.dateRange === "object" && params.dateRange
      ? (params.dateRange as Record<string, unknown>).label
      : undefined,
    params.dateLabel,
    params.date,
  );
  const recentDays = typeof params.recentDays === "number" ? params.recentDays : undefined;

  let historyTitle = `${typeLabel}查询结果`;
  if (params.type === "no_submission") {
    if (recentDays) {
      historyTitle = `最近 ${recentDays} 天未填报（${count} 人）`;
    } else if (count > 0) {
      historyTitle = `未填报 ${count} 人`;
    }
  } else if (dateRange) {
    historyTitle = `${dateRange}${typeLabel}（${count} 条）`;
  } else if (count > 0) {
    historyTitle = `${typeLabel}（${count} 条）`;
  }

  return {
    answer,
    historyTitle: truncateTitle(historyTitle),
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
    historyTitle: truncateTitle(`${taskTypeLabel}执行状态`),
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

function buildDiagnosisPresentation(
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  const data = (result.data ?? {}) as Record<string, unknown>;
  const issueLabel = getIssueLabel(data.issueType);
  const suggestedAction = getActionLabel(data.suggestedAction);
  const userName = firstString(
    data.userName,
    data.user && (data.user as Record<string, unknown>).name,
    params.userName,
  );
  const title = userName ? `${userName} ${issueLabel}诊断` : `${issueLabel}诊断`;

  return {
    answer: `这更像${issueLabel}。`,
    historyTitle: truncateTitle(title),
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

function buildRiskSection(copy: ConfirmationCopy): AssistantDetailSection {
  return {
    kind: "fields",
    title: copy.riskTitle,
    items: [{ label: "风险说明", value: copy.riskDetail }],
  };
}

function buildChangeRoleConfirmation(
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  const copy = HIGH_RISK_CONFIRMATION_COPY.changeUserRole;
  const newRole = roleLabel(params.newRole);
  const before = (result.beforeSnapshot ?? {}) as Record<string, unknown>;
  const currentRole = roleLabel(before.role);
  const permissionText = permissionSummary(before.permissions);
  const userName = firstString(
    before.name,
    (result.affectedData as Record<string, unknown> | undefined)?.userName,
    params.userName,
  );
  const historyTitle = userName
    ? truncateTitle(`${userName} 角色变更（${currentRole} → ${newRole}）`)
    : truncateTitle(`角色变更（${currentRole} → ${newRole}）`);

  return {
    answer: `我将把该用户的角色改成${newRole}。`,
    historyTitle,
    details: {
      sections: compactSections([
        buildRiskSection(copy),
        fields(copy.impactTitle, [
          { label: "当前角色", value: currentRole },
          { label: "变更后角色", value: newRole },
          { label: "当前权限", value: permissionText },
          { label: "变更后权限", value: "按新角色默认模板重置（自定义权限会被覆盖）" },
        ]),
      ]),
      nextSteps: copy.nextAction ? [copy.nextAction] : undefined,
    },
  };
}

function buildUpdatePermissionsConfirmation(
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  const copy = HIGH_RISK_CONFIRMATION_COPY.updateUserPermissions;
  const permissions = params.permissions as Record<string, unknown> | undefined;
  const enabledCount = permissions
    ? Object.values(permissions).filter((value) => value === true).length
    : 0;
  const enabledKeys = permissions
    ? Object.entries(permissions)
        .filter(([, value]) => value === true)
        .map(([key]) => key)
    : [];
  const before = (result.beforeSnapshot ?? {}) as Record<string, unknown>;
  const userName = firstString(
    before.name,
    (result.affectedData as Record<string, unknown> | undefined)?.userName,
    params.userName,
  );

  return {
    answer: copy.answer,
    historyTitle: userName ? truncateTitle(`${userName} 权限修改`) : "权限修改确认",
    details: {
      sections: compactSections([
        buildRiskSection(copy),
        fields(copy.impactTitle, [
          { label: "当前权限", value: permissionSummary(before.permissions) },
          { label: "变更后权限", value: `预计开通 ${enabledCount} 项` },
          {
            label: "开通项",
            value: enabledKeys.length ? enabledKeys.join("、") : "-",
          },
          { label: "生效时机", value: "确认后立即生效；用户下次刷新即可看到" },
        ]),
      ]),
      nextSteps: copy.nextAction ? [copy.nextAction] : undefined,
    },
  };
}

function buildKickUserConfirmation(result: ToolExecutionResult): AssistantPresentation {
  const copy = HIGH_RISK_CONFIRMATION_COPY.kickUser;
  const affectedData = (result.affectedData ?? {}) as Record<string, unknown>;
  const user = ((affectedData.user ?? {}) as Record<string, unknown>) ?? {};
  const userName = toDisplayText(user.name);

  return {
    answer: `我将把 ${userName} 踢出后台。`,
    historyTitle: truncateTitle(userName !== "-" ? `踢出 ${userName}` : "踢出用户"),
    details: {
      sections: compactSections([
        buildRiskSection(copy),
        fields(copy.impactTitle, [
          { label: "用户", value: userName },
          { label: "角色", value: roleLabel(user.role) },
          { label: "保留的填报记录", value: `${toDisplayText(affectedData.metricsCount)} 条` },
          { label: "保留的豁免记录", value: `${toDisplayText(affectedData.exemptionsCount)} 条` },
          { label: "生效时机", value: "执行后该账号立即失去登录权限" },
        ]),
      ]),
      nextSteps: copy.nextAction ? [copy.nextAction] : undefined,
    },
  };
}

function buildDeleteMetricsConfirmation(
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  const copy = HIGH_RISK_CONFIRMATION_COPY.deleteMetrics;
  const before = (result.beforeSnapshot ?? {}) as Record<string, unknown>;
  const reason = firstString(params.reason);
  const dateLabel = formatDate(before.report_date);

  const impactItems: AssistantFieldItem[] = [
    { label: "日期", value: dateLabel },
    { label: "标题", value: toDisplayText(before.title) },
    { label: "播放", value: formatNumber(before.play_count) },
    { label: "命中条数", value: "1" },
  ];
  if (reason) impactItems.push({ label: "原因", value: reason });
  if (copy.impactHint) {
    impactItems.push({ label: copy.impactHintLabel ?? "提示", value: copy.impactHint });
  }

  const titleDate = dateLabel !== "-" ? dateLabel : "";
  return {
    answer: copy.answer,
    historyTitle: titleDate ? truncateTitle(`删除错误数据 · ${titleDate}`) : "删除错误数据确认",
    details: {
      sections: compactSections([
        buildRiskSection(copy),
        fields(copy.impactTitle, impactItems),
      ]),
      nextSteps: copy.nextAction ? [copy.nextAction] : undefined,
    },
  };
}

function buildRetryDailyReviewConfirmation(
  result: ToolExecutionResult,
): AssistantPresentation {
  const copy = HIGH_RISK_CONFIRMATION_COPY.retryDailyReview;
  const affectedData = (result.affectedData ?? {}) as Record<string, unknown>;
  const videoIds = Array.isArray(affectedData.videoIds) ? affectedData.videoIds : [];
  const count = Number(affectedData.targetCount ?? videoIds.length ?? 0);
  return {
    answer: copy.answer,
    historyTitle: count > 0 ? truncateTitle(`次日复盘重跑（${count} 条）`) : "次日复盘重跑确认",
    details: {
      sections: compactSections([
        buildRiskSection(copy),
        fields(copy.impactTitle, [
          { label: "任务数量", value: toDisplayText(affectedData.targetCount) },
          { label: "命中视频", value: videoIds.length ? `${videoIds.length} 条` : "-" },
          { label: "覆盖规则", value: "原有复盘结果会被清空后重新生成" },
          { label: "额度影响", value: "AI 调用会重新消耗额度" },
        ]),
      ]),
      nextSteps: copy.nextAction ? [copy.nextAction] : undefined,
    },
  };
}

function buildRetryContentBreakdownConfirmation(
  result: ToolExecutionResult,
): AssistantPresentation {
  const copy = HIGH_RISK_CONFIRMATION_COPY.retryContentBreakdown;
  const affectedData = (result.affectedData ?? {}) as Record<string, unknown>;
  const contentId = toDisplayText(affectedData.contentItemId);
  return {
    answer: copy.answer,
    historyTitle: contentId !== "-" ? truncateTitle(`内容拆解重跑 · ${contentId}`) : "内容拆解重跑确认",
    details: {
      sections: compactSections([
        buildRiskSection(copy),
        fields(copy.impactTitle, [
          { label: "内容 ID", value: toDisplayText(affectedData.contentItemId) },
          { label: "预计拆段", value: toDisplayText(affectedData.segmentCount) },
          { label: "覆盖规则", value: "原有拆解段会被清空后重新生成" },
          { label: "额度影响", value: "AI 调用会重新消耗额度" },
        ]),
      ]),
      nextSteps: copy.nextAction ? [copy.nextAction] : undefined,
    },
  };
}

function buildGrantExemptionConfirmation(
  result: ToolExecutionResult,
): AssistantPresentation {
  const copy = HIGH_RISK_CONFIRMATION_COPY.grantExemption;
  const affectedData = (result.affectedData ?? {}) as Record<string, unknown>;
  const reason = toDisplayText(affectedData.reason);
  const userCount = Number(affectedData.userCount ?? 0);
  const dateLabel = formatDate(affectedData.date);
  const title =
    userCount > 0 && dateLabel !== "-"
      ? `批量豁免 · ${dateLabel}（${userCount} 人）`
      : userCount > 0
        ? `批量豁免（${userCount} 人）`
        : "批量豁免确认";
  return {
    answer: copy.answer,
    historyTitle: truncateTitle(title),
    details: {
      sections: compactSections([
        buildRiskSection(copy),
        fields(copy.impactTitle, [
          { label: "覆盖人数", value: toDisplayText(affectedData.userCount) },
          { label: "日期", value: formatDate(affectedData.date) },
          { label: "原因", value: reason },
          { label: "作用范围", value: "仅该日期，不再计入未填报" },
        ]),
      ]),
      nextSteps: copy.nextAction ? [copy.nextAction] : undefined,
    },
  };
}

function buildClearCacheConfirmation(
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  const copy = HIGH_RISK_CONFIRMATION_COPY.clearCache;
  const affectedData = (result.affectedData ?? {}) as Record<string, unknown>;
  const cacheType = typeof params.cacheType === "string" ? params.cacheType : "";
  const rangeLabel = cacheTypeLabel(cacheType);
  return {
    answer: copy.answer,
    historyTitle: cacheType ? truncateTitle(`清缓存 · ${rangeLabel}`) : "清理分析结果确认",
    details: {
      sections: compactSections([
        buildRiskSection(copy),
        fields(copy.impactTitle, [
          { label: "范围", value: cacheTypeLabel(cacheType) },
          {
            label: "覆盖用户",
            value: cacheType === "all" ? "全站用户" : "命中范围内的用户",
          },
          { label: "说明", value: toDisplayText(affectedData.note) },
        ]),
      ]),
      nextSteps: copy.nextAction ? [copy.nextAction] : undefined,
    },
  };
}

function buildGenericConfirmation(
  toolName: AdminAiToolName,
  result: ToolExecutionResult,
): AssistantPresentation {
  return {
    answer: "我将执行这项后台操作。",
    historyTitle: toolName,
    details: {
      sections: compactSections([
        fields("为什么要确认", [
          { label: "风险说明", value: "该操作可能影响后台数据或账号状态。" },
        ]),
        fields("影响范围", [
          { label: "说明", value: result.error ?? "这项操作需要你先确认后才能继续。" },
        ]),
      ]),
      nextSteps: ["确认后立即执行；取消则一切照旧。"],
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
    case "retryContentBreakdown":
      return buildRetryContentBreakdownConfirmation(result);
    case "retryDailyReview":
      return buildRetryDailyReviewConfirmation(result);
    case "grantExemption":
      return buildGrantExemptionConfirmation(result);
    case "clearCache":
      return buildClearCacheConfirmation(params, result);
    default:
      return buildGenericConfirmation(toolName, result);
  }
}

type LowRiskSuccessBuilder = (
  params: Record<string, unknown>,
  result: ToolExecutionResult,
) => AssistantPresentation;

const LOW_RISK_SUCCESS_BUILDERS: Partial<Record<AdminAiToolName, LowRiskSuccessBuilder>> = {
  fillMissingData: (params, result) => {
    const data = (result.data ?? {}) as Record<string, unknown>;
    const dateLabel = formatDate(params.date ?? data.date);
    const userName = firstString(
      (result.affectedData as Record<string, unknown> | undefined)?.userName,
      params.userName,
      data.userName,
    );
    const metrics = (params.metrics ?? {}) as Record<string, unknown>;
    const impactItems: AssistantFieldItem[] = [];
    if (userName) impactItems.push({ label: "用户", value: userName });
    impactItems.push({ label: "日期", value: dateLabel });
    if (metrics.total_views !== undefined) {
      impactItems.push({ label: "播放", value: formatNumber(Number(metrics.total_views)) });
    }
    if (metrics.total_likes !== undefined) {
      impactItems.push({ label: "点赞", value: formatNumber(Number(metrics.total_likes)) });
    }
    if (metrics.fans_count !== undefined) {
      impactItems.push({ label: "涨粉", value: formatNumber(Number(metrics.fans_count)) });
    }
    const who = userName ? `${userName} ` : "";
    return {
      answer: `已补填${who}${dateLabel} 的日报数据。`,
      historyTitle: truncateTitle(who ? `${userName} ${dateLabel} 补填完成` : `${dateLabel} 补填完成`),
      details: {
        sections: compactSections([fields("补填明细", impactItems)]),
        nextSteps: ["如果你要，我可以继续帮你核对该用户的其他缺口日期。"],
      },
    };
  },
  retryContentBreakdown: (params, result) => {
    const data = (result.data ?? {}) as Record<string, unknown>;
    const contentId = toDisplayText(data.contentItemId ?? params.contentItemId);
    const count = Number(data.segmentCount ?? 0);
    return {
      answer: `内容拆解任务已重新触发，预计生成 ${count > 0 ? count : "若干"} 个段落。`,
      historyTitle: truncateTitle(contentId !== "-" ? `内容拆解 · ${contentId}` : "内容拆解已重跑"),
      details: {
        sections: compactSections([
          fields("执行信息", [
            { label: "内容 ID", value: contentId },
            { label: "拆段数量", value: count > 0 ? String(count) : "-" },
            { label: "预计完成", value: "通常 1-2 分钟内" },
          ]),
        ]),
        nextSteps: ["如果你要，我可以继续帮你查这条视频的最新拆解结果。"],
      },
    };
  },
  retryDailyReview: (params, result) => {
    const data = (result.data ?? {}) as Record<string, unknown>;
    const cleared = Array.isArray(data.clearedForRetry) ? data.clearedForRetry : [];
    const count = cleared.length;
    const date = formatDate(params.date ?? data.date);
    const userName = firstString(params.userName, data.userName);
    const who = userName ? `${userName} ` : "";
    return {
      answer: `次日复盘任务已重新触发${count > 0 ? `（${count} 条）` : ""}。`,
      historyTitle: truncateTitle(
        userName && date !== "-" ? `${userName} ${date} 复盘重跑` : "次日复盘已重跑",
      ),
      details: {
        sections: compactSections([
          fields("执行信息", [
            { label: "用户", value: who.trim() || "-" },
            { label: "日期", value: date },
            { label: "清理条数", value: count > 0 ? String(count) : "-" },
            { label: "预计完成", value: "通常 2-5 分钟内" },
          ]),
        ]),
        nextSteps: ["如果你要，我可以继续帮你查复盘生成后的结论。"],
      },
    };
  },
  grantExemption: (params, result) => {
    const data = (result.data ?? {}) as Record<string, unknown>;
    const userIds = Array.isArray(data.userIds) ? data.userIds : [];
    const count = userIds.length;
    const date = formatDate(data.date ?? params.date);
    return {
      answer: `已标记豁免 ${count > 0 ? `${count} 人` : ""}，日期 ${date}。`,
      historyTitle: truncateTitle(count > 0 && date !== "-" ? `${date} 豁免 ${count} 人` : "豁免标记完成"),
      details: {
        sections: compactSections([
          fields("豁免明细", [
            { label: "人数", value: String(count) },
            { label: "日期", value: date },
            { label: "作用范围", value: "仅该日期，不再计入未填报" },
          ]),
        ]),
        nextSteps: ["如果你要，我可以继续查这些用户的最近填报状态。"],
      },
    };
  },
};

function buildMutationSuccessPresentation(
  toolName: AdminAiToolName,
  params: Record<string, unknown>,
  result: ToolExecutionResult,
): AssistantPresentation {
  const customBuilder = LOW_RISK_SUCCESS_BUILDERS[toolName];
  if (customBuilder) return customBuilder(params, result);

  switch (toolName) {
    case "changeUserRole":
      return {
        answer: `角色已改成${roleLabel(params.newRole)}。`,
        historyTitle: truncateTitle(`角色已改为${roleLabel(params.newRole)}`),
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
    case "deleteMetrics": {
      const before = (result.beforeSnapshot ?? {}) as Record<string, unknown>;
      const dateLabel = formatDate(before.report_date);
      return {
        answer: "错误数据已删除。",
        historyTitle: truncateTitle(dateLabel !== "-" ? `${dateLabel} 错误数据已删除` : "错误数据已删除"),
      };
    }
    case "clearCache": {
      const cacheType = typeof params.cacheType === "string" ? params.cacheType : "";
      return {
        answer: "分析结果数据已清理。",
        historyTitle: truncateTitle(cacheType ? `清缓存 · ${cacheTypeLabel(cacheType)}` : "分析结果已清理"),
      };
    }
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
      return buildDiagnosisPresentation(params, result);
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

const TOOL_DISPLAY_NAME: Record<AdminAiToolName, string> = {
  getUserInfo: "用户信息查询",
  getAnomalousData: "异常数据查询",
  getTaskStatus: "任务状态查询",
  kickUser: "踢出用户",
  changeUserRole: "角色变更",
  updateUserPermissions: "权限修改",
  deleteMetrics: "删除错误数据",
  fillMissingData: "补填数据",
  grantExemption: "批量豁免",
  retryContentBreakdown: "内容拆解重跑",
  retryDailyReview: "次日复盘重跑",
  clearCache: "清理分析结果",
  diagnoseIssue: "问题诊断",
};

export function buildCancelledPresentation(toolName: AdminAiToolName): AssistantPresentation {
  const label = TOOL_DISPLAY_NAME[toolName] ?? toolName;
  return {
    answer: "操作已取消，当前没有改动数据。",
    historyTitle: truncateTitle(`${label}已取消`),
  };
}
