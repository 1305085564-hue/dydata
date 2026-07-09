export type ExemptionApprovalLike = {
  id?: string | null;
  request_id?: string | null;
};

export type CommandHubTab = "todos" | "approvals" | "notifications";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function resolveApprovalRequestId(item: ExemptionApprovalLike): string | null {
  if (isUuid(item.request_id)) return item.request_id.trim();
  if (isUuid(item.id)) return item.id.trim();
  return null;
}

export function collectApprovalRequestIds(items: ExemptionApprovalLike[]): string[] {
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

export function getCommandHubDefaultTab(input: {
  todoCount: number;
  approvalCount: number;
  isAdmin: boolean;
}): CommandHubTab {
  if (input.todoCount > 0) return "todos";
  if (input.isAdmin && input.approvalCount > 0) return "approvals";
  return "notifications";
}
