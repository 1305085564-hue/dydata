/**
 * 岗位管理「按岗位 / 按团队」的 URL 契约与进组定位（纯函数，可单测）。
 *
 * 约定（2026-09-22 定稿）：
 * - 按岗位：`?year=&month=&tab=<talents|operators|writers|editors>`，不带 `view`。
 * - 按团队列表：`?year=&month=&view=teams`，不带 `groupId`。
 * - 进组详情：`?year=&month=&view=teams&groupId=<小队 id>`（id 需转义）。
 * 浏览器历史由调用方用 replace 处理，本模块只管字符串与定位，不碰路由。
 */

export const COLLABORATION_BASE_PATH = "/admin/collaboration";

export type CollaborationAdminView = "roles" | "teams";

export type CollaborationTabKey = "talents" | "operators" | "writers" | "editors";

/** 页面参数 → 视图：只有显式 `view=teams` 才进按团队，其他一律按岗位。 */
export function resolveCollaborationView(value: string | null | undefined): CollaborationAdminView {
  return value === "teams" ? "teams" : "roles";
}

/**
 * 生成查询串（不含 `?`）。
 * - 按团队时忽略 tab；带 groupId 才拼 groupId。
 * - 按岗位时忽略 groupId（从按团队切回按岗位不该残留进组参数）。
 */
export function buildCollaborationSearchParams(input: {
  year: number;
  month: number;
  view: CollaborationAdminView;
  tab?: CollaborationTabKey | null;
  groupId?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("year", String(input.year));
  params.set("month", String(input.month));

  if (input.view === "teams") {
    params.set("view", "teams");
    const groupId = typeof input.groupId === "string" ? input.groupId.trim() : "";
    if (groupId) params.set("groupId", groupId);
  } else {
    if (input.tab) params.set("tab", input.tab);
  }

  return params.toString();
}

export function buildCollaborationUrl(input: {
  year: number;
  month: number;
  view: CollaborationAdminView;
  tab?: CollaborationTabKey | null;
  groupId?: string | null;
}): string {
  return `${COLLABORATION_BASE_PATH}?${buildCollaborationSearchParams(input)}`;
}

/**
 * 进组定位：只有「按团队 + 命中 id」才给详情。
 * 按岗位模式下即使 URL 里残留 groupId 也不进组；id 不存在（例如被删掉的小队）返回 null 回到列表。
 */
export function pickActiveGroupDetail<T extends { summary: { id: string } }>(input: {
  view: CollaborationAdminView;
  groupId: string | null | undefined;
  details?: T[] | null;
}): T | null {
  if (input.view !== "teams") return null;
  const groupId = typeof input.groupId === "string" ? input.groupId.trim() : "";
  if (!groupId || !input.details) return null;
  return input.details.find((detail) => detail.summary.id === groupId) ?? null;
}
