import { createAdminClient } from "@/lib/supabase/admin";

import type {
  YikeApiError,
  YikeAreaDTO,
  YikeAreaRow,
  YikeActor,
  YikeCreateItemInput,
  YikeItemDTO,
  YikeItemInsert,
  YikeItemRow,
  YikeItemStatus,
  YikeMemoSplitInput,
  YikePersonDTO,
  YikePersonRow,
  YikeProjectDTO,
  YikeProjectRow,
  YikeTimeBucket,
  YikeUpdateItemInput,
  YikeWorkspaceContext,
} from "./types";
import { YikeServiceError } from "./errors";
import { yikeError } from "./errors";
import {
  validateAreaInput,
  validateAreaReorderInput,
  validateAreaUpdateInput,
  validateCreateItemInput,
  validateMemoSplitInput,
  validatePersonInput,
  validatePersonUpdateInput,
  validateProjectInput,
  validateProjectTaskInput,
  validateProjectUpdateInput,
  validateQuickCreateInput,
  validateSetProjectNextTaskInput,
  validateUpdateItemInput,
} from "./validation";

export type YikeResult<T> = { ok: true; data: T } | { ok: false; error: YikeApiError };

type PostgrestErrorLike = { code?: string; message?: string };
type QueryResponse<T = unknown> = { data: T | null; error: PostgrestErrorLike | null; count?: number | null };
type QueryResult<T> = Promise<QueryResponse<T>>;

type YikeWorkspaceRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type SupabaseQueryBuilder = PromiseLike<QueryResponse> & {
  select(columns?: string): SupabaseQueryBuilder;
  insert(value: unknown, options?: unknown): SupabaseQueryBuilder;
  update(value: unknown): SupabaseQueryBuilder;
  upsert(value: unknown, options?: unknown): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  neq(column: string, value: unknown): SupabaseQueryBuilder;
  is(column: string, value: null): SupabaseQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): SupabaseQueryBuilder;
  maybeSingle<T = unknown>(): QueryResult<T>;
  single<T = unknown>(): QueryResult<T>;
};

export type YikeDbClient = {
  from(table: string): SupabaseQueryBuilder;
};

const ITEM_SELECT = [
  "id",
  "workspace_id",
  "user_id",
  "item_type",
  "status",
  "title",
  "note",
  "raw_input",
  "area_id",
  "project_id",
  "complexity",
  "time_bucket",
  "bucket_anchor_date",
  "due_date",
  "is_urgent",
  "memo_granularity",
  "assignee_person_id",
  "delegated_note",
  "follow_up_bucket",
  "source_memo_id",
  "client_request_id",
  "completed_at",
  "archived_at",
  "created_at",
  "updated_at",
].join(", ");

const AREA_SELECT = "id, workspace_id, user_id, name, sort_order, color, archived_at, created_at, updated_at";
const PROJECT_SELECT = [
  "id",
  "workspace_id",
  "user_id",
  "area_id",
  "name",
  "goal_note",
  "acceptance_criteria",
  "next_task_id",
  "archived_at",
  "created_at",
  "updated_at",
].join(", ");
const PERSON_SELECT = "id, workspace_id, user_id, name, sort_order, archived_at, created_at, updated_at";

function getClient(client?: YikeDbClient): YikeDbClient {
  return client ?? (createAdminClient() as unknown as YikeDbClient);
}

export function buildCreateItemInsert(
  context: YikeWorkspaceContext,
  input: YikeCreateItemInput,
): YikeItemInsert {
  return {
    workspace_id: context.workspaceId,
    user_id: context.userId,
    item_type: input.itemType,
    status: input.status,
    title: input.title,
    note: input.note ?? input.rawText,
    raw_input: input.rawText,
    area_id: input.areaId,
    project_id: input.projectId,
    complexity: input.complexity,
    time_bucket: input.timeBucket,
    due_date: input.dueDate,
    is_urgent: input.isUrgent,
    memo_granularity: input.memoGranularity,
    assignee_person_id: input.assigneePersonId,
    delegated_note: input.delegatedNote,
    follow_up_bucket: input.followUpBucket,
    client_request_id: input.clientRequestId,
  };
}

export function toYikeItemDTO(row: YikeItemRow): YikeItemDTO {
  return {
    id: row.id,
    itemType: row.item_type,
    status: row.status,
    title: row.title,
    note: row.note,
    rawInput: row.raw_input,
    areaId: row.area_id,
    projectId: row.project_id,
    complexity: row.complexity,
    timeBucket: row.time_bucket,
    bucketAnchorDate: row.bucket_anchor_date,
    dueDate: row.due_date,
    isUrgent: row.is_urgent,
    memoGranularity: row.memo_granularity,
    assigneePersonId: row.assignee_person_id,
    delegatedNote: row.delegated_note,
    followUpBucket: row.follow_up_bucket,
    sourceMemoId: row.source_memo_id,
    clientRequestId: row.client_request_id,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toYikeAreaDTO(row: YikeAreaRow): YikeAreaDTO {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    color: row.color,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toYikeProjectDTO(row: YikeProjectRow): YikeProjectDTO {
  return {
    id: row.id,
    areaId: row.area_id,
    name: row.name,
    goalNote: row.goal_note,
    acceptanceCriteria: row.acceptance_criteria,
    nextTaskId: row.next_task_id,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toYikePersonDTO(row: YikePersonRow): YikePersonDTO {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isAllowedYikeStatusTransition(from: YikeItemStatus, to: YikeItemStatus) {
  if (from === to) return true;

  const allowed: Record<YikeItemStatus, YikeItemStatus[]> = {
    planned: ["doing", "delegated", "done"],
    doing: ["done", "delegated", "planned"],
    delegated: ["done", "planned"],
    done: ["planned"],
  };

  return allowed[from].includes(to);
}

export function buildStatusTransitionUpdate(toStatus: YikeItemStatus, now = new Date().toISOString()) {
  return {
    status: toStatus,
    completed_at: toStatus === "done" ? now : null,
  };
}

export function buildUpdateItemPayload(input: YikeUpdateItemInput, today = new Date().toISOString().slice(0, 10)) {
  const payload: Partial<YikeItemRow> = {};
  if (input.rawText !== undefined) payload.raw_input = input.rawText;
  if (input.title !== undefined) payload.title = input.title;
  if (input.note !== undefined) payload.note = input.note;
  if (input.itemType !== undefined) payload.item_type = input.itemType;
  if (input.status !== undefined) Object.assign(payload, buildStatusTransitionUpdate(input.status));
  if (input.timeBucket !== undefined) {
    payload.time_bucket = input.timeBucket;
    // 改桶 = 用户的主动决定，锚定日刷成今天，防止 rollover 把它当成昨日遗留冲回今天。
    payload.bucket_anchor_date = today;
  }
  if (input.complexity !== undefined) payload.complexity = input.complexity;
  if (input.memoGranularity !== undefined) payload.memo_granularity = input.memoGranularity;
  if (input.areaId !== undefined) payload.area_id = input.areaId;
  if (input.projectId !== undefined) payload.project_id = input.projectId;
  if (input.dueDate !== undefined) payload.due_date = input.dueDate;
  if (input.isUrgent !== undefined) payload.is_urgent = input.isUrgent;
  if (input.assigneePersonId !== undefined) payload.assignee_person_id = input.assigneePersonId;
  if (input.delegatedNote !== undefined) payload.delegated_note = input.delegatedNote;
  if (input.followUpBucket !== undefined) payload.follow_up_bucket = input.followUpBucket;
  return payload;
}

export function buildMemoSplitTaskInserts(
  context: YikeWorkspaceContext,
  sourceMemo: YikeItemRow,
  input: YikeMemoSplitInput,
): YikeItemInsert[] {
  return input.tasks.map((task) => ({
    workspace_id: context.workspaceId,
    user_id: context.userId,
    item_type: "task",
    status: "planned",
    title: task.title,
    note: task.note,
    raw_input: null,
    area_id: sourceMemo.area_id,
    project_id: sourceMemo.project_id,
    complexity: "small",
    time_bucket: "today",
    due_date: null,
    is_urgent: false,
    memo_granularity: "single",
    assignee_person_id: null,
    delegated_note: null,
    follow_up_bucket: null,
    client_request_id: null,
    source_memo_id: sourceMemo.id,
  }));
}

export function buildRolloverUpdate(item: YikeItemRow, today: string) {
  if (item.status === "done") return null;
  // 跨度桶（本周/本月/以后）是用户主动选的时间范围，不自动顺延，保留选择。
  if (
    item.time_bucket === "this_week" ||
    item.time_bucket === "this_month" ||
    item.time_bucket === "later"
  ) {
    return null;
  }
  // 今天/明天是点状桶：锚定日还在今天或以后（今天刚设的），保持不动，不被冲回。
  if (item.bucket_anchor_date != null && item.bucket_anchor_date >= today) return null;
  // 锚定日已过（昨天或更早设的今天/明天，或老数据未锚定）→ 归到今天。
  return {
    time_bucket: "today" as YikeTimeBucket,
    bucket_anchor_date: today,
  };
}

export async function getOrCreateYikeWorkspace(
  actor: YikeActor,
  options: { client?: YikeDbClient } = {},
): Promise<YikeWorkspaceRow> {
  const client = getClient(options.client);
  const existing = await client
    .from("yike_workspaces")
    .select("id, user_id, name, created_at, updated_at")
    .eq("user_id", actor.userId)
    .maybeSingle<YikeWorkspaceRow>();

  if (existing.error) {
    throw new YikeServiceError({
      code: "INTERNAL_ERROR",
      message: existing.error.message ?? "读取此刻工作区失败",
    });
  }

  if (existing.data) return existing.data;

  const created = await client
    .from("yike_workspaces")
    .insert({ user_id: actor.userId, name: "此刻" })
    .select("id, user_id, name, created_at, updated_at")
    .single<YikeWorkspaceRow>();

  if (created.error) {
    if (created.error.code === "23505") {
      const retried = await client
        .from("yike_workspaces")
        .select("id, user_id, name, created_at, updated_at")
        .eq("user_id", actor.userId)
        .single<YikeWorkspaceRow>();
      if (retried.data) return retried.data;
    }

    throw new YikeServiceError({
      code: "INTERNAL_ERROR",
      message: created.error.message ?? "创建此刻工作区失败",
    });
  }

  if (!created.data) {
    throw new YikeServiceError({
      code: "INTERNAL_ERROR",
      message: "创建此刻工作区失败",
    });
  }

  return created.data;
}

export async function createYikeItem(
  actor: YikeActor,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikeItemDTO>> {
  const input = validateCreateItemInput(body);
  if (!input.ok) return { ok: false, error: input.error };

  const client = getClient(options.client);
  const workspace = await getOrCreateYikeWorkspace(actor, { client });
  const insertPayload = buildCreateItemInsert({ userId: actor.userId, workspaceId: workspace.id }, input.data);

  const inserted = await client.from("yike_items").insert(insertPayload).select(ITEM_SELECT).single<YikeItemRow>();

  if (inserted.error) {
    if (inserted.error.code === "23505" && insertPayload.client_request_id) {
      const existing = await client
        .from("yike_items")
        .select(ITEM_SELECT)
        .eq("user_id", actor.userId)
        .eq("client_request_id", insertPayload.client_request_id)
        .maybeSingle<YikeItemRow>();

      if (existing.data) return { ok: true, data: toYikeItemDTO(existing.data) };
    }

    return { ok: false, error: yikeError("INTERNAL_ERROR", inserted.error.message ?? "创建事项失败") };
  }

  if (!inserted.data) return { ok: false, error: yikeError("INTERNAL_ERROR", "创建事项失败") };

  return { ok: true, data: toYikeItemDTO(inserted.data) };
}

export async function quickCreateYikeItem(
  actor: YikeActor,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikeItemDTO>> {
  const input = validateQuickCreateInput(body);
  if (!input.ok) return { ok: false, error: input.error };

  return createYikeItem(
    actor,
    {
      rawText: input.data.rawText,
      clientRequestId: input.data.clientRequestId,
    },
    options,
  );
}

export async function transitionYikeItem(
  actor: YikeActor,
  itemId: string,
  toStatus: YikeItemStatus,
  options: { client?: YikeDbClient; now?: string } = {},
): Promise<YikeResult<YikeItemDTO>> {
  const client = getClient(options.client);
  const existing = await client
    .from("yike_items")
    .select(ITEM_SELECT)
    .eq("id", itemId)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .maybeSingle<YikeItemRow>();

  if (existing.error) return { ok: false, error: yikeError("INTERNAL_ERROR", existing.error.message ?? "读取事项失败") };
  if (!existing.data) return { ok: false, error: yikeError("NOT_FOUND", "事项不存在") };

  if (!isAllowedYikeStatusTransition(existing.data.status, toStatus)) {
    return { ok: false, error: yikeError("CONFLICT", "状态流转不合法") };
  }

  const updatePayload = buildStatusTransitionUpdate(toStatus, options.now);
  const updated = await client
    .from("yike_items")
    .update(updatePayload)
    .eq("id", itemId)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .select(ITEM_SELECT)
    .maybeSingle<YikeItemRow>();

  if (updated.error) return { ok: false, error: yikeError("INTERNAL_ERROR", updated.error.message ?? "更新事项失败") };
  if (!updated.data) return { ok: false, error: yikeError("NOT_FOUND", "事项不存在") };

  await client.from("yike_item_events").insert({
    workspace_id: updated.data.workspace_id,
    user_id: actor.userId,
    item_id: itemId,
    project_id: updated.data.project_id,
    event_type: toStatus === "done" ? "completed" : "status_changed",
    before_json: { status: existing.data.status, completedAt: existing.data.completed_at },
    after_json: { status: updated.data.status, completedAt: updated.data.completed_at },
  }).select("id").single();

  return { ok: true, data: toYikeItemDTO(updated.data) };
}

export async function updateYikeItem(
  actor: YikeActor,
  itemId: string,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikeItemDTO>> {
  const input = validateUpdateItemInput(body);
  if (!input.ok) return { ok: false, error: input.error };

  const client = getClient(options.client);
  const existing = await client
    .from("yike_items")
    .select(ITEM_SELECT)
    .eq("id", itemId)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .maybeSingle<YikeItemRow>();

  if (existing.error) return { ok: false, error: yikeError("INTERNAL_ERROR", existing.error.message ?? "读取事项失败") };
  if (!existing.data) return { ok: false, error: yikeError("NOT_FOUND", "事项不存在") };

  if (input.data.status && !isAllowedYikeStatusTransition((existing.data as YikeItemRow).status, input.data.status)) {
    return { ok: false, error: yikeError("CONFLICT", "状态流转不合法") };
  }

  const updated = await client
    .from("yike_items")
    .update(buildUpdateItemPayload(input.data))
    .eq("id", itemId)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .select(ITEM_SELECT)
    .maybeSingle<YikeItemRow>();

  if (updated.error) return { ok: false, error: yikeError("INTERNAL_ERROR", updated.error.message ?? "更新事项失败") };
  if (!updated.data) return { ok: false, error: yikeError("NOT_FOUND", "事项不存在") };

  return { ok: true, data: toYikeItemDTO(updated.data as YikeItemRow) };
}

/** 软删除事项：写 archived_at，不物理删，可日后恢复。 */
export async function deleteYikeItem(
  actor: YikeActor,
  itemId: string,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<{ id: string }>> {
  const client = getClient(options.client);
  const updated = await client
    .from("yike_items")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .select("id, workspace_id, project_id")
    .maybeSingle<{ id: string; workspace_id: string; project_id: string | null }>();

  if (updated.error) return { ok: false, error: yikeError("INTERNAL_ERROR", updated.error.message ?? "删除事项失败") };
  if (!updated.data) return { ok: false, error: yikeError("NOT_FOUND", "事项不存在") };

  await client.from("yike_item_events").insert({
    workspace_id: updated.data.workspace_id,
    user_id: actor.userId,
    item_id: itemId,
    project_id: updated.data.project_id,
    event_type: "item_archived",
    before_json: { archived: false },
    after_json: { archived: true },
  });

  return { ok: true, data: { id: updated.data.id } };
}

export async function convertYikeMemoToTask(
  actor: YikeActor,
  itemId: string,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikeItemDTO>> {
  const client = getClient(options.client);
  const updated = await client
    .from("yike_items")
    .update({ item_type: "task", memo_granularity: "single" })
    .eq("id", itemId)
    .eq("user_id", actor.userId)
    .eq("item_type", "memo")
    .is("archived_at", null)
    .select(ITEM_SELECT)
    .maybeSingle<YikeItemRow>();

  if (updated.error) return { ok: false, error: yikeError("INTERNAL_ERROR", updated.error.message ?? "备忘转任务失败") };
  if (!updated.data) return { ok: false, error: yikeError("NOT_FOUND", "备忘不存在") };

  await client.from("yike_item_events").insert({
    workspace_id: updated.data.workspace_id,
    user_id: actor.userId,
    item_id: itemId,
    project_id: updated.data.project_id,
    event_type: "memo_converted",
    before_json: { itemType: "memo" },
    after_json: { itemType: "task" },
  });

  return { ok: true, data: toYikeItemDTO(updated.data as YikeItemRow) };
}

export async function splitYikeMemo(
  actor: YikeActor,
  itemId: string,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<{ items: YikeItemDTO[]; sourceMemo: YikeItemDTO }>> {
  const input = validateMemoSplitInput(body);
  if (!input.ok) return { ok: false, error: input.error };

  const client = getClient(options.client);
  const workspace = await getOrCreateYikeWorkspace(actor, { client });
  const source = await client
    .from("yike_items")
    .select(ITEM_SELECT)
    .eq("id", itemId)
    .eq("user_id", actor.userId)
    .eq("item_type", "memo")
    .is("archived_at", null)
    .maybeSingle<YikeItemRow>();

  if (source.error) return { ok: false, error: yikeError("INTERNAL_ERROR", source.error.message ?? "读取备忘失败") };
  if (!source.data) return { ok: false, error: yikeError("NOT_FOUND", "备忘不存在") };

  const inserted = await client
    .from("yike_items")
    .insert(buildMemoSplitTaskInserts({ userId: actor.userId, workspaceId: workspace.id }, source.data as YikeItemRow, input.data))
    .select(ITEM_SELECT);

  if (inserted.error) return { ok: false, error: yikeError("INTERNAL_ERROR", inserted.error.message ?? "拆分备忘失败") };

  let sourceMemo = source.data as YikeItemRow;
  if (input.data.archiveSourceMemo) {
    const archived = await client
      .from("yike_items")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("user_id", actor.userId)
      .select(ITEM_SELECT)
      .maybeSingle();
    if (archived.data) sourceMemo = archived.data as YikeItemRow;
  }

  await client.from("yike_item_events").insert({
    workspace_id: workspace.id,
    user_id: actor.userId,
    item_id: itemId,
    project_id: sourceMemo.project_id,
    event_type: "memo_split",
    before_json: { sourceMemoId: itemId },
    after_json: { taskCount: input.data.tasks.length, archiveSourceMemo: input.data.archiveSourceMemo },
  });

  return {
    ok: true,
    data: {
      items: ((inserted.data ?? []) as YikeItemRow[]).map(toYikeItemDTO),
      sourceMemo: toYikeItemDTO(sourceMemo),
    },
  };
}

export async function listYikeAreas(
  actor: YikeActor,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikeAreaDTO[]>> {
  const client = getClient(options.client);
  await getOrCreateYikeWorkspace(actor, { client });
  const result = await client
    .from("yike_areas")
    .select(AREA_SELECT)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (result.error) return { ok: false, error: yikeError("INTERNAL_ERROR", result.error.message ?? "读取领域失败") };
  return { ok: true, data: ((result.data ?? []) as YikeAreaRow[]).map(toYikeAreaDTO) };
}

export async function createYikeArea(
  actor: YikeActor,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikeAreaDTO>> {
  const input = validateAreaInput(body);
  if (!input.ok) return { ok: false, error: input.error };
  const client = getClient(options.client);
  const workspace = await getOrCreateYikeWorkspace(actor, { client });
  const inserted = await client
    .from("yike_areas")
    .insert({
      workspace_id: workspace.id,
      user_id: actor.userId,
      name: input.data.name,
      sort_order: input.data.sortOrder,
      color: input.data.color ?? null,
    })
    .select(AREA_SELECT)
    .single();
  if (inserted.error) return { ok: false, error: yikeError(inserted.error.code === "23505" ? "CONFLICT" : "INTERNAL_ERROR", inserted.error.message ?? "创建领域失败") };
  return { ok: true, data: toYikeAreaDTO(inserted.data as YikeAreaRow) };
}

export async function updateYikeArea(
  actor: YikeActor,
  areaId: string,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikeAreaDTO>> {
  const input = validateAreaUpdateInput(body);
  if (!input.ok) return { ok: false, error: input.error };
  const payload: Record<string, unknown> = {};
  if (input.data.name !== undefined) payload.name = input.data.name;
  if (input.data.sortOrder !== undefined) payload.sort_order = input.data.sortOrder;
  if (input.data.archived !== undefined) payload.archived_at = input.data.archived ? new Date().toISOString() : null;
  if (input.data.color !== undefined) payload.color = input.data.color;

  const client = getClient(options.client);
  const updated = await client
    .from("yike_areas")
    .update(payload)
    .eq("id", areaId)
    .eq("user_id", actor.userId)
    .select(AREA_SELECT)
    .maybeSingle();
  if (updated.error) return { ok: false, error: yikeError("INTERNAL_ERROR", updated.error.message ?? "更新领域失败") };
  if (!updated.data) return { ok: false, error: yikeError("NOT_FOUND", "领域不存在") };
  return { ok: true, data: toYikeAreaDTO(updated.data as YikeAreaRow) };
}

export async function reorderYikeAreas(
  actor: YikeActor,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<{ updated: number }>> {
  const input = validateAreaReorderInput(body);
  if (!input.ok) return { ok: false, error: input.error };
  const client = getClient(options.client);
  for (const area of input.data.areas) {
    const result = await client
      .from("yike_areas")
      .update({ sort_order: area.sortOrder })
      .eq("id", area.id)
      .eq("user_id", actor.userId)
      .is("archived_at", null);
    if (result.error) return { ok: false, error: yikeError("INTERNAL_ERROR", result.error.message ?? "领域排序失败") };
  }
  return { ok: true, data: { updated: input.data.areas.length } };
}

export async function listYikeProjects(
  actor: YikeActor,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikeProjectDTO[]>> {
  const client = getClient(options.client);
  await getOrCreateYikeWorkspace(actor, { client });
  const result = await client
    .from("yike_projects")
    .select(PROJECT_SELECT)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (result.error) return { ok: false, error: yikeError("INTERNAL_ERROR", result.error.message ?? "读取项目失败") };
  return { ok: true, data: ((result.data ?? []) as YikeProjectRow[]).map(toYikeProjectDTO) };
}

export async function createYikeProject(
  actor: YikeActor,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikeProjectDTO>> {
  const input = validateProjectInput(body);
  if (!input.ok) return { ok: false, error: input.error };
  const client = getClient(options.client);
  const workspace = await getOrCreateYikeWorkspace(actor, { client });
  const inserted = await client
    .from("yike_projects")
    .insert({
      workspace_id: workspace.id,
      user_id: actor.userId,
      area_id: input.data.areaId,
      name: input.data.name,
      goal_note: input.data.goalNote,
      acceptance_criteria: input.data.acceptanceCriteria,
    })
    .select(PROJECT_SELECT)
    .single();
  if (inserted.error || !inserted.data) {
    return { ok: false, error: yikeError("INTERNAL_ERROR", inserted.error?.message ?? "创建项目失败") };
  }

  let project = inserted.data as YikeProjectRow;
  if (input.data.nextTaskTitle) {
    const taskResult = await addYikeProjectTask(
      actor,
      project.id,
      { title: input.data.nextTaskTitle, setAsNextTask: true },
      { client },
    );
    if (!taskResult.ok) return { ok: false, error: taskResult.error };
    const refreshed = await client
      .from("yike_projects")
      .select(PROJECT_SELECT)
      .eq("id", project.id)
      .eq("user_id", actor.userId)
      .maybeSingle();
    if (refreshed.data) project = refreshed.data as YikeProjectRow;
  }
  return { ok: true, data: toYikeProjectDTO(project) };
}

export async function updateYikeProject(
  actor: YikeActor,
  projectId: string,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikeProjectDTO>> {
  const input = validateProjectUpdateInput(body);
  if (!input.ok) return { ok: false, error: input.error };
  const payload: Record<string, unknown> = {};
  if (input.data.name !== undefined) payload.name = input.data.name;
  if (input.data.areaId !== undefined) payload.area_id = input.data.areaId;
  if (input.data.goalNote !== undefined) payload.goal_note = input.data.goalNote;
  if (input.data.acceptanceCriteria !== undefined) payload.acceptance_criteria = input.data.acceptanceCriteria;
  if (input.data.nextTaskId !== undefined) payload.next_task_id = input.data.nextTaskId;
  if (input.data.archived !== undefined) payload.archived_at = input.data.archived ? new Date().toISOString() : null;

  const client = getClient(options.client);
  const updated = await client
    .from("yike_projects")
    .update(payload)
    .eq("id", projectId)
    .eq("user_id", actor.userId)
    .select(PROJECT_SELECT)
    .maybeSingle();
  if (updated.error) return { ok: false, error: yikeError("INTERNAL_ERROR", updated.error.message ?? "更新项目失败") };
  if (!updated.data) return { ok: false, error: yikeError("NOT_FOUND", "项目不存在") };

  return { ok: true, data: toYikeProjectDTO(updated.data as YikeProjectRow) };
}

export async function addYikeProjectTask(
  actor: YikeActor,
  projectId: string,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikeItemDTO>> {
  const input = validateProjectTaskInput(body);
  if (!input.ok) return { ok: false, error: input.error };
  const client = getClient(options.client);
  const workspace = await getOrCreateYikeWorkspace(actor, { client });
  const project = await client
    .from("yike_projects")
    .select(PROJECT_SELECT)
    .eq("id", projectId)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .maybeSingle();
  if (project.error) return { ok: false, error: yikeError("INTERNAL_ERROR", project.error.message ?? "读取项目失败") };
  if (!project.data) return { ok: false, error: yikeError("NOT_FOUND", "项目不存在") };

  const inserted = await client
    .from("yike_items")
    .insert({
      workspace_id: workspace.id,
      user_id: actor.userId,
      item_type: "task",
      status: "planned",
      title: input.data.title,
      note: input.data.note,
      raw_input: null,
      area_id: (project.data as YikeProjectRow).area_id,
      project_id: projectId,
      complexity: input.data.complexity,
      time_bucket: input.data.timeBucket,
      due_date: null,
      is_urgent: false,
      memo_granularity: "single",
      assignee_person_id: null,
      delegated_note: null,
      follow_up_bucket: null,
      client_request_id: null,
    })
    .select(ITEM_SELECT)
    .single();
  if (inserted.error || !inserted.data) {
    return { ok: false, error: yikeError("INTERNAL_ERROR", inserted.error?.message ?? "创建项目任务失败") };
  }

  if (input.data.setAsNextTask || !(project.data as YikeProjectRow).next_task_id) {
    await client
      .from("yike_projects")
      .update({ next_task_id: (inserted.data as YikeItemRow).id })
      .eq("id", projectId)
      .eq("user_id", actor.userId);
  }

  return { ok: true, data: toYikeItemDTO(inserted.data as YikeItemRow) };
}

export async function setYikeProjectNextTask(
  actor: YikeActor,
  projectId: string,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikeProjectDTO>> {
  const input = validateSetProjectNextTaskInput(body);
  if (!input.ok) return { ok: false, error: input.error };
  return updateYikeProject(actor, projectId, { nextTaskId: input.data.nextTaskId }, options);
}

export async function listYikePeople(
  actor: YikeActor,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikePersonDTO[]>> {
  const client = getClient(options.client);
  await getOrCreateYikeWorkspace(actor, { client });
  const result = await client
    .from("yike_people")
    .select(PERSON_SELECT)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (result.error) return { ok: false, error: yikeError("INTERNAL_ERROR", result.error.message ?? "读取负责人失败") };
  return { ok: true, data: ((result.data ?? []) as YikePersonRow[]).map(toYikePersonDTO) };
}

export async function createYikePerson(
  actor: YikeActor,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikePersonDTO>> {
  const input = validatePersonInput(body);
  if (!input.ok) return { ok: false, error: input.error };
  const client = getClient(options.client);
  const workspace = await getOrCreateYikeWorkspace(actor, { client });
  const inserted = await client
    .from("yike_people")
    .insert({
      workspace_id: workspace.id,
      user_id: actor.userId,
      name: input.data.name,
      sort_order: input.data.sortOrder,
    })
    .select(PERSON_SELECT)
    .single();
  if (inserted.error || !inserted.data) {
    return { ok: false, error: yikeError("INTERNAL_ERROR", inserted.error?.message ?? "创建负责人失败") };
  }
  return { ok: true, data: toYikePersonDTO(inserted.data as YikePersonRow) };
}

export async function updateYikePerson(
  actor: YikeActor,
  personId: string,
  body: unknown,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<YikePersonDTO>> {
  const input = validatePersonUpdateInput(body);
  if (!input.ok) return { ok: false, error: input.error };
  const payload: Record<string, unknown> = {};
  if (input.data.name !== undefined) payload.name = input.data.name;
  if (input.data.sortOrder !== undefined) payload.sort_order = input.data.sortOrder;
  if (input.data.archived !== undefined) payload.archived_at = input.data.archived ? new Date().toISOString() : null;

  const client = getClient(options.client);
  const updated = await client
    .from("yike_people")
    .update(payload)
    .eq("id", personId)
    .eq("user_id", actor.userId)
    .select(PERSON_SELECT)
    .maybeSingle();
  if (updated.error) return { ok: false, error: yikeError("INTERNAL_ERROR", updated.error.message ?? "更新负责人失败") };
  if (!updated.data) return { ok: false, error: yikeError("NOT_FOUND", "负责人不存在") };
  return { ok: true, data: toYikePersonDTO(updated.data as YikePersonRow) };
}

export async function rolloverYikeItems(
  actor: YikeActor,
  today: string,
  options: { client?: YikeDbClient } = {},
): Promise<YikeResult<{ updated: number }>> {
  const client = getClient(options.client);
  const result = await client
    .from("yike_items")
    .select(ITEM_SELECT)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .neq("status", "done");
  if (result.error) return { ok: false, error: yikeError("INTERNAL_ERROR", result.error.message ?? "读取顺延事项失败") };

  let updatedCount = 0;
  for (const item of (result.data ?? []) as YikeItemRow[]) {
    const update = buildRolloverUpdate(item, today);
    if (!update) continue;
    const updated = await client
      .from("yike_items")
      .update(update)
      .eq("id", item.id)
      .eq("user_id", actor.userId);
    if (updated.error) return { ok: false, error: yikeError("INTERNAL_ERROR", updated.error.message ?? "顺延事项失败") };
    updatedCount += 1;
  }

  return { ok: true, data: { updated: updatedCount } };
}
