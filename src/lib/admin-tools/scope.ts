import type { ToolContext } from "./types";

export function isActiveTargetInScope(context: ToolContext, userId: string | null | undefined) {
  if (!userId) return false;
  // 类型层已必填；这里仍做一次运行时校验，防止外部数据绕过类型后把"缺失"当成"范围很宽"。
  const activeVisibleUserIds = context.activeVisibleUserIds;
  return Array.isArray(activeVisibleUserIds) && activeVisibleUserIds.includes(userId);
}

export function areActiveTargetsInScope(context: ToolContext, userIds: string[]) {
  return userIds.length > 0 && userIds.every((userId) => isActiveTargetInScope(context, userId));
}
