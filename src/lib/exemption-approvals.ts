export type ExemptionApprovalLike = {
  id?: string | null;
  request_id?: string | null;
};

export type CommandHubTab = "todos" | "approvals" | "history";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function resolveApprovalRequestId(
  item: ExemptionApprovalLike,
): string | null {
  if (isUuid(item.request_id)) return item.request_id.trim();
  if (isUuid(item.id)) return item.id.trim();
  return null;
}

export function collectApprovalRequestIds(
  items: ExemptionApprovalLike[],
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const item of items) {
    const requestId = resolveApprovalRequestId(item);
    if (!requestId || seen.has(requestId)) continue;
    seen.add(requestId);
    ids.push(requestId);
  }

  return ids;
}

export function removeReviewedApproval<T extends ExemptionApprovalLike>(
  items: T[],
  requestId: string,
): T[] {
  return items.filter((item) => resolveApprovalRequestId(item) !== requestId);
}

/**
 * 撤回/失败恢复时，把已移除的申请插回待审列表，但跳过当前列表中已存在（重复）的编号。
 * 返回「应新增」的原始卡片（优先保留原始对象），供调用方拼接回列表头部。
 */
export function restoreApprovalItems<T extends ExemptionApprovalLike>(
  current: readonly T[],
  toRestore: readonly T[],
): T[] {
  const existingIds = new Set(collectApprovalRequestIds([...current]));
  return toRestore.filter((item) => {
    const reqId = resolveApprovalRequestId(item);
    return !reqId || !existingIds.has(reqId);
  });
}

export function getCommandHubDefaultTab(input: {
  todoCount: number;
  approvalCount: number;
  isAdmin: boolean;
}): CommandHubTab {
  if (input.isAdmin) return "approvals";
  if (input.todoCount > 0) return "todos";
  return "todos";
}
