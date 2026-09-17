export type MemberAiProfile = { id: string; name: string | null };

const AI_TOOL_DISPLAY_NAMES: Record<string, string> = {
  kickUser: "归档成员账号",
  changeUserRole: "调整成员角色",
  updateUserPermissions: "调整成员权限",
  deleteMetrics: "删除错误数据",
  grantExemption: "设置成员豁免",
  retryContentBreakdown: "重跑内容拆解",
  retryDailyReview: "重跑次日复盘",
  clearCache: "清理分析缓存",
};

export function getAiToolDisplayName(toolName: string): string {
  return AI_TOOL_DISPLAY_NAMES[toolName] ?? "AI 管理动作";
}

export function formatAiToolPreview(
  toolName: string,
  preview: unknown,
  profiles: MemberAiProfile[],
): string[] {
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) return [];
  const data = preview as Record<string, unknown>;
  const targetName = (userId: unknown) => {
    const id = typeof userId === "string" ? userId : "";
    return profiles.find((profile) => profile.id === id)?.name || id || "目标成员";
  };

  switch (toolName) {
    case "kickUser": {
      const user = data.user && typeof data.user === "object" && !Array.isArray(data.user)
        ? data.user as Record<string, unknown>
        : {};
      const name = typeof user.name === "string" && user.name ? user.name : targetName(user.id);
      return [
        `「${name}」：账号将被归档并停止登录`,
        `历史日报 ${Number(data.metricsCount ?? 0)} 条、豁免记录 ${Number(data.exemptionsCount ?? 0)} 条将保留`,
      ];
    }
    case "changeUserRole": {
      const roleLabel = data.newRole === "admin" ? "组长" : data.newRole === "member" ? "组员" : "未知角色";
      return [`「${targetName(data.userId)}」：角色将改为「${roleLabel}」`];
    }
    case "updateUserPermissions": {
      const permissions = data.permissions && typeof data.permissions === "object" && !Array.isArray(data.permissions)
        ? data.permissions as Record<string, unknown>
        : {};
      const enabledCount = Object.values(permissions).filter((value) => value === true).length;
      return [`「${targetName(data.userId)}」：将更新功能权限（${enabledCount} 项开启）`];
    }
    case "deleteMetrics":
      return typeof data.metricsId === "string" ? [`将删除错误数据记录「${data.metricsId}」`] : [];
    case "grantExemption":
      return typeof data.userCount === "number" && typeof data.date === "string"
        ? [`${data.userCount} 位成员：将在 ${data.date} 设置豁免${typeof data.reason === "string" ? `，原因「${data.reason}」` : ""}`]
        : [];
    case "retryContentBreakdown":
      return typeof data.contentItemId === "string"
        ? [`内容「${data.contentItemId}」：预计重新拆分为 ${Number(data.segmentCount ?? 0)} 段`]
        : [];
    case "retryDailyReview":
      return typeof data.targetCount === "number" ? [`将重跑 ${data.targetCount} 条次日复盘任务`] : [];
    case "clearCache":
      return typeof data.note === "string" ? [data.note] : [];
    default:
      return [];
  }
}
