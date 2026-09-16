import type { ToolContext } from "./types";

export function isActiveTargetInScope(context: ToolContext, userId: string | null | undefined) {
  return Boolean(userId && context.activeVisibleUserIds?.includes(userId));
}

export function areActiveTargetsInScope(context: ToolContext, userIds: string[]) {
  return userIds.length > 0 && userIds.every((userId) => isActiveTargetInScope(context, userId));
}
