import type { SupabaseClient } from "@supabase/supabase-js";

import {
  auditAppliedButNotLoggedMessage,
  auditRollbackIncompleteMessage,
  auditRollbackMessage,
  writeAuditLog,
} from "@/lib/audit-log";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import type { Permissions } from "@/types";

/**
 * 岗位管理「按团队」的数据层：工种小队编制（work_groups）的读写与归属分配。
 *
 * 边界（2026-09-22 方案冻结）：
 * - 只做分组展示与编制，不参与权限、公司模型与数据范围；不改 teams。
 * - 门禁 `manage_members` + 限本公司：建组只挂操作人本公司 team_id，分配只限本公司成员。
 * - 同槽位换组 = 就地自动替换（文案/达人二选一、运营至多一个），不要求先取消原分配；
 *   跨公司与跨团队成员仍一律 403。裁定见 2026-09-22 A 案。
 * - 每个写操作成功后统一 `writeAuditLog` → `audit_logs`（不写 admin_actions）。
 * - 双入口（按团队抽屉 / 成员抽屉）必须共用本模块，禁止两套赋值逻辑。
 */

export type WorkGroupKind = "writer" | "talent" | "operator";

export const WORK_GROUP_KINDS = ["writer", "talent", "operator"] as const;

export const WORK_GROUP_KIND_LABELS: Record<WorkGroupKind, string> = {
  writer: "文案",
  talent: "达人",
  operator: "运营",
};

/** 归属槽位：peer = 文案/达人（互斥），operator = 运营（可兼任，至多一个）。 */
export type WorkGroupSlot = "peer" | "operator";

export const WORK_GROUP_SLOT_COLUMNS = {
  peer: "work_peer_group_id",
  operator: "work_operator_group_id",
} as const satisfies Record<WorkGroupSlot, string>;

/** 小队名称长度上限：挡住会撑破表格与抽屉标题的极端输入。 */
export const WORK_GROUP_NAME_MAX_LENGTH = 40;

export type WorkGroupColumn = (typeof WORK_GROUP_SLOT_COLUMNS)[WorkGroupSlot];

/** 领域模型（camelCase）：对外与前端约定的形状。 */
export type WorkGroupRow = {
  id: string;
  teamId: string;
  name: string;
  kind: WorkGroupKind;
  createdAt: string | null;
  createdBy: string | null;
};

export type WorkGroupRosterMember = {
  id: string;
  name: string | null;
  teamId: string | null;
  peerGroupId: string | null;
  operatorGroupId: string | null;
};

export type WorkGroupDirectory = {
  /** false = 库还没跑 work_groups migration（应用先于数据库部署）；此时列表为空但不算失败。 */
  ready: boolean;
  groups: WorkGroupRow[];
  roster: WorkGroupRosterMember[];
};

export type WorkGroupFailure = { ok: false; status: number; message: string };
export type WorkGroupResult<T> = { ok: true; value: T } | WorkGroupFailure;

export type WorkGroupWriteGate =
  | { ok: true; teamId: string }
  | { ok: false; status: 403; message: string };

export type WorkGroupAssignmentPlan = {
  groupId: string;
  userId: string;
  slot: WorkGroupSlot;
  column: WorkGroupColumn;
  /** false = 已在该小队（幂等无操作，不写库、不写审计）。 */
  changed: boolean;
  /**
   * 该槽位原有归属 id（审计与回滚用）：
   * - 同组幂等：等于本组 id；
   * - 同槽位换组（自动替换，见 resolveWorkGroupAssignment）：等于被替换掉的原组 id；
   * - 空槽位新分配：null。
   */
  previousGroupId: string | null;
};

type WorkGroupDbRow = {
  id: string;
  team_id: string;
  name: string;
  kind: string;
  created_at?: string | null;
  created_by?: string | null;
};

type MemberDbRow = {
  id: string;
  team_id?: string | null;
  name?: string | null;
  work_peer_group_id?: string | null;
  work_operator_group_id?: string | null;
};

function failure(status: number, message: string): WorkGroupFailure {
  return { ok: false, status, message };
}

function isDuplicateKeyError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|already exists/i.test(error.message ?? "");
}

/**
 * 判「work_groups 相关列/表还不存在」。应用先于 migration 部署时，按团队视图降级为空态，
 * 而不是把整个岗位管理页打挂；真正的查询故障仍然照常抛出。
 */
export function isWorkGroupSchemaMissing(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(code)) return true;
  const message = error.message ?? "";
  const namesWorkGroupSchema = /work_groups|work_peer_group_id|work_operator_group_id/i.test(message);
  return namesWorkGroupSchema && /does not exist|could not find|schema cache/i.test(message);
}

export function isWorkGroupKind(value: unknown): value is WorkGroupKind {
  return typeof value === "string" && (WORK_GROUP_KINDS as readonly string[]).includes(value);
}

export function workGroupSlotForKind(kind: WorkGroupKind): WorkGroupSlot {
  return kind === "operator" ? "operator" : "peer";
}

export function mapWorkGroupRow(row: WorkGroupDbRow): WorkGroupRow | null {
  if (!isWorkGroupKind(row.kind)) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    kind: row.kind,
    createdAt: row.created_at ?? null,
    createdBy: row.created_by ?? null,
  };
}

/**
 * 写入门禁：`manage_members` + 必须有本公司 team_id。
 * 不使用 `canManageTeamStructure`（那是集团模式下 company_owner 专属，会把普通公司 admin 挡在外面）。
 */
export function resolveWorkGroupWriteGate(input: {
  permissions: Permissions | null | undefined;
  actorTeamId: string | null | undefined;
}): WorkGroupWriteGate {
  if (input.permissions?.manage_members !== true) {
    return { ok: false, status: 403, message: "无权限管理工种小队" };
  }
  const teamId = typeof input.actorTeamId === "string" ? input.actorTeamId.trim() : "";
  if (!teamId) {
    return { ok: false, status: 403, message: "无法确认操作人所属团队，已拒绝管理小队" };
  }
  return { ok: true, teamId };
}

export function normalizeWorkGroupName(
  value: unknown,
): { ok: true; name: string } | { ok: false; message: string } {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, message: "小队名称不能为空" };
  if (name.length > WORK_GROUP_NAME_MAX_LENGTH) {
    return { ok: false, message: `小队名称不能超过 ${WORK_GROUP_NAME_MAX_LENGTH} 个字` };
  }
  return { ok: true, name };
}

export function resolveWorkGroupAssignment(input: {
  actorTeamId: string;
  group: Pick<WorkGroupRow, "id" | "kind" | "teamId">;
  member: {
    id: string;
    teamId: string | null;
    peerGroupId: string | null;
    operatorGroupId: string | null;
  } | null;
}): WorkGroupResult<WorkGroupAssignmentPlan> {
  if (input.group.teamId !== input.actorTeamId) {
    return failure(403, "不能管理其他公司的小队");
  }
  if (!input.member) return failure(404, "成员不存在");
  if (input.member.teamId !== input.actorTeamId) {
    return failure(403, "不能分配其他公司的成员");
  }

  const slot = workGroupSlotForKind(input.group.kind);
  const column = WORK_GROUP_SLOT_COLUMNS[slot];
  const previousGroupId = slot === "peer" ? input.member.peerGroupId : input.member.operatorGroupId;

  if (previousGroupId === input.group.id) {
    return {
      ok: true,
      value: { groupId: input.group.id, userId: input.member.id, slot, column, changed: false, previousGroupId },
    };
  }
  // 同槽位换组 = 就地替换（2026-09-22 阿禅裁定 A 案）。
  // 文案/达人二选一、运营至多一个，两个入口的界面都已写「加入将替换原归属」，
  // 所以这里必须真的替换：旧归属由本次写入覆盖（单列天然互斥），并在审计里留下 from。
  // 跨公司小队 / 跨公司成员 / 无团队归属成员仍在上方被 403 拦下，不受本裁定影响。
  return {
    ok: true,
    value: {
      groupId: input.group.id,
      userId: input.member.id,
      slot,
      column,
      changed: true,
      previousGroupId: previousGroupId ?? null,
    },
  };
}

export function resolveWorkGroupUnassignment(input: {
  actorTeamId: string;
  group: Pick<WorkGroupRow, "id" | "kind" | "teamId">;
  member: {
    id: string;
    teamId: string | null;
    peerGroupId: string | null;
    operatorGroupId: string | null;
  } | null;
}): WorkGroupResult<WorkGroupAssignmentPlan> {
  if (input.group.teamId !== input.actorTeamId) {
    return failure(403, "不能管理其他公司的小队");
  }
  if (!input.member) return failure(404, "成员不存在");
  if (input.member.teamId !== input.actorTeamId) {
    return failure(403, "不能调整其他公司的成员");
  }

  const slot = workGroupSlotForKind(input.group.kind);
  const column = WORK_GROUP_SLOT_COLUMNS[slot];
  const previousGroupId = slot === "peer" ? input.member.peerGroupId : input.member.operatorGroupId;
  return {
    ok: true,
    value: {
      groupId: input.group.id,
      userId: input.member.id,
      slot,
      column,
      changed: previousGroupId === input.group.id,
      previousGroupId,
    },
  };
}

function normalizeTeamIds(teamIds: Array<string | null | undefined>) {
  return Array.from(
    new Set(teamIds.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)),
  );
}

/**
 * 一次调用取回「可见小队 + 本公司编制名单」，恒定两次查询，不随小队数量增长（P2.1 消除 N+1）。
 * 名单含零产出成员（按 team_id 取本公司全体，而不是按日报反推）。
 */
export async function loadWorkGroupDirectory(
  supabase: SupabaseClient,
  input: { teamIds: Array<string | null | undefined> },
): Promise<WorkGroupDirectory> {
  const teamIds = normalizeTeamIds(input.teamIds);
  if (teamIds.length === 0) return { ready: true, groups: [], roster: [] };

  const [groupsResult, rosterResult] = await Promise.all([
    supabase
      .from("work_groups")
      .select("id, team_id, name, kind, created_at, created_by")
      .in("team_id", teamIds)
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, name, team_id, work_peer_group_id, work_operator_group_id")
      .in("team_id", teamIds),
  ]);

  if (isWorkGroupSchemaMissing(groupsResult.error) || isWorkGroupSchemaMissing(rosterResult.error)) {
    return { ready: false, groups: [], roster: [] };
  }
  assertSupabaseQuerySucceeded(groupsResult.error, "加载工种小队失败");
  assertSupabaseQuerySucceeded(rosterResult.error, "加载工种小队成员名单失败");

  const groups = ((groupsResult.data ?? []) as WorkGroupDbRow[])
    .map(mapWorkGroupRow)
    .filter((row): row is WorkGroupRow => row !== null);

  const roster = ((rosterResult.data ?? []) as MemberDbRow[]).map((row) => ({
    id: row.id,
    name: row.name ?? null,
    teamId: row.team_id ?? null,
    peerGroupId: row.work_peer_group_id ?? null,
    operatorGroupId: row.work_operator_group_id ?? null,
  }));

  return { ready: true, groups, roster };
}

async function loadWorkGroup(
  supabase: SupabaseClient,
  groupId: string,
): Promise<WorkGroupResult<WorkGroupRow>> {
  const { data, error } = await supabase
    .from("work_groups")
    .select("id, team_id, name, kind, created_at, created_by")
    .eq("id", groupId)
    .maybeSingle();
  if (error) {
    if (isWorkGroupSchemaMissing(error)) return failure(503, "工种小队功能尚未上线");
    return failure(500, "加载小队失败");
  }
  const group = data ? mapWorkGroupRow(data as WorkGroupDbRow) : null;
  if (!group) return failure(404, "小队不存在");
  return { ok: true, value: group };
}

/**
 * best-effort 读取小队名：只用于「自动替换」时把原组名写进审计与提示，
 * 读不到就返回 null，绝不因为它读不到而阻断写入。
 */
async function loadWorkGroupName(supabase: SupabaseClient, groupId: string): Promise<string | null> {
  const { data } = await supabase.from("work_groups").select("name").eq("id", groupId).maybeSingle();
  const name = (data as { name?: unknown } | null)?.name;
  return typeof name === "string" && name.trim() ? name : null;
}

async function loadMember(
  supabase: SupabaseClient,
  userId: string,
): Promise<WorkGroupResult<MemberDbRow>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, team_id, work_peer_group_id, work_operator_group_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (isWorkGroupSchemaMissing(error)) return failure(503, "工种小队功能尚未上线");
    return failure(500, "加载成员失败");
  }
  if (!data) return failure(404, "成员不存在");
  return { ok: true, value: data as MemberDbRow };
}

function toAssignmentMember(row: MemberDbRow) {
  return {
    id: row.id,
    teamId: row.team_id ?? null,
    peerGroupId: row.work_peer_group_id ?? null,
    operatorGroupId: row.work_operator_group_id ?? null,
  };
}

async function findGroupByName(
  supabase: SupabaseClient,
  input: { teamId: string; name: string },
): Promise<{ row: WorkGroupRow | null; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from("work_groups")
    .select("id, team_id, name, kind, created_at, created_by")
    .eq("team_id", input.teamId)
    .eq("name", input.name)
    .maybeSingle();
  if (error) return { row: null, error };
  return { row: data ? mapWorkGroupRow(data as WorkGroupDbRow) : null, error: null };
}

export async function createWorkGroup(
  supabase: SupabaseClient,
  input: { actorId: string; actorTeamId: string; name: unknown; kind: unknown },
): Promise<WorkGroupResult<WorkGroupRow>> {
  if (!isWorkGroupKind(input.kind)) return failure(400, "工种必须是 writer / talent / operator");
  const normalized = normalizeWorkGroupName(input.name);
  if (!normalized.ok) return failure(400, normalized.message);
  const name = normalized.name;

  const duplicate = await findGroupByName(supabase, { teamId: input.actorTeamId, name });
  if (duplicate.error) {
    if (isWorkGroupSchemaMissing(duplicate.error)) return failure(503, "工种小队功能尚未上线");
    return failure(500, "校验小队名称失败");
  }
  if (duplicate.row) return failure(409, "同一部/二部内已有同名小队");

  const { data, error } = await supabase
    .from("work_groups")
    .insert({ team_id: input.actorTeamId, name, kind: input.kind, created_by: input.actorId })
    .select("id, team_id, name, kind, created_at, created_by")
    .single();
  if (error || !data) {
    if (isDuplicateKeyError(error)) return failure(409, "同一部/二部内已有同名小队");
    return failure(500, "创建小队失败");
  }

  const created = mapWorkGroupRow(data as WorkGroupDbRow);
  if (!created) return failure(500, "创建小队失败");

  const audit = await writeAuditLog(supabase, {
    userId: input.actorId,
    action: "create_work_group",
    target: created.id,
    detail: JSON.stringify({ name, kind: created.kind, team_id: created.teamId }),
  });
  if (!audit.ok) {
    const rollback = await supabase.from("work_groups").delete().eq("id", created.id);
    return failure(
      500,
      rollback.error ? auditRollbackIncompleteMessage("创建小队") : auditRollbackMessage("创建小队"),
    );
  }

  return { ok: true, value: created };
}

export async function renameWorkGroup(
  supabase: SupabaseClient,
  input: { actorId: string; actorTeamId: string; groupId: string; name: unknown },
): Promise<WorkGroupResult<WorkGroupRow>> {
  const loaded = await loadWorkGroup(supabase, input.groupId);
  if (!loaded.ok) return loaded;
  const group = loaded.value;
  if (group.teamId !== input.actorTeamId) return failure(403, "不能管理其他公司的小队");

  const normalized = normalizeWorkGroupName(input.name);
  if (!normalized.ok) return failure(400, normalized.message);
  const name = normalized.name;
  if (name === group.name) return { ok: true, value: group };

  const duplicate = await findGroupByName(supabase, { teamId: group.teamId, name });
  if (duplicate.error) {
    if (isWorkGroupSchemaMissing(duplicate.error)) return failure(503, "工种小队功能尚未上线");
    return failure(500, "校验小队名称失败");
  }
  if (duplicate.row && duplicate.row.id !== group.id) {
    return failure(409, "同一部/二部内已有同名小队");
  }

  const { data, error } = await supabase
    .from("work_groups")
    .update({ name })
    .eq("id", group.id)
    .select("id, team_id, name, kind, created_at, created_by")
    .single();
  if (error || !data) {
    if (isDuplicateKeyError(error)) return failure(409, "同一部/二部内已有同名小队");
    return failure(500, "重命名小队失败");
  }

  const renamed = mapWorkGroupRow(data as WorkGroupDbRow);
  if (!renamed) return failure(500, "重命名小队失败");

  const audit = await writeAuditLog(supabase, {
    userId: input.actorId,
    action: "rename_work_group",
    target: renamed.id,
    detail: JSON.stringify({ previous_name: group.name, next_name: renamed.name }),
  });
  if (!audit.ok) {
    const rollback = await supabase.from("work_groups").update({ name: group.name }).eq("id", group.id);
    return failure(
      500,
      rollback.error ? auditRollbackIncompleteMessage("重命名") : auditRollbackMessage("重命名"),
    );
  }

  return { ok: true, value: renamed };
}

/**
 * 删除小队。成员归属由外键 `on delete set null` 自动清空（不删人）。
 * 删除不可回滚，审计写入失败时如实报告半成品状态，不伪装成功。
 */
export async function deleteWorkGroup(
  supabase: SupabaseClient,
  input: { actorId: string; actorTeamId: string; groupId: string },
): Promise<WorkGroupResult<{ groupId: string }>> {
  const loaded = await loadWorkGroup(supabase, input.groupId);
  if (!loaded.ok) return loaded;
  const group = loaded.value;
  if (group.teamId !== input.actorTeamId) return failure(403, "不能管理其他公司的小队");

  const { error } = await supabase.from("work_groups").delete().eq("id", group.id);
  if (error) {
    if (isWorkGroupSchemaMissing(error)) return failure(503, "工种小队功能尚未上线");
    return failure(500, "删除小队失败");
  }

  const audit = await writeAuditLog(supabase, {
    userId: input.actorId,
    action: "delete_work_group",
    target: group.id,
    detail: JSON.stringify({ name: group.name, kind: group.kind, team_id: group.teamId }),
  });
  if (!audit.ok) {
    return failure(500, auditAppliedButNotLoggedMessage("删除小队"));
  }

  return { ok: true, value: { groupId: group.id } };
}

async function updateMemberSlot(
  supabase: SupabaseClient,
  input: { userId: string; column: WorkGroupColumn; value: string | null },
): Promise<{ ok: true } | WorkGroupFailure> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ [input.column]: input.value })
    .eq("id", input.userId)
    .select("id")
    .single();
  if (error || !data) {
    if (isWorkGroupSchemaMissing(error)) return failure(503, "工种小队功能尚未上线");
    return failure(500, "小队归属更新未生效，请刷新后重试");
  }
  return { ok: true };
}

export async function assignWorkGroupMember(
  supabase: SupabaseClient,
  input: { actorId: string; actorTeamId: string; groupId: string; userId: string },
): Promise<
  WorkGroupResult<{
    groupId: string;
    userId: string;
    changed: boolean;
    /** 自动替换时被移出的原小队名（供提示「已从 A 移入 B」），无替换为 null。 */
    replacedGroupName: string | null;
  }>
> {
  const loadedGroup = await loadWorkGroup(supabase, input.groupId);
  if (!loadedGroup.ok) return loadedGroup;
  const loadedMember = await loadMember(supabase, input.userId);
  if (!loadedMember.ok) return loadedMember;

  const plan = resolveWorkGroupAssignment({
    actorTeamId: input.actorTeamId,
    group: loadedGroup.value,
    member: toAssignmentMember(loadedMember.value),
  });
  if (!plan.ok) return plan;
  const { column, changed, previousGroupId } = plan.value;
  if (!changed) {
    return {
      ok: true,
      value: { groupId: input.groupId, userId: input.userId, changed: false, replacedGroupName: null },
    };
  }

  const written = await updateMemberSlot(supabase, { userId: input.userId, column, value: input.groupId });
  if (!written.ok) return written;

  // 自动替换（changed 且 previousGroupId 非空）时取一次原组名，只用于审计可读性与操作提示。
  const replacedGroupName = previousGroupId ? await loadWorkGroupName(supabase, previousGroupId) : null;

  const audit = await writeAuditLog(supabase, {
    userId: input.actorId,
    action: "assign_work_group",
    target: input.userId,
    detail: JSON.stringify({
      group_id: loadedGroup.value.id,
      group_name: loadedGroup.value.name,
      kind: loadedGroup.value.kind,
      slot: plan.value.slot,
      previous_group_id: previousGroupId,
      previous_group_name: replacedGroupName,
      replaced: previousGroupId !== null,
    }),
  });
  if (!audit.ok) {
    const rollback = await updateMemberSlot(supabase, { userId: input.userId, column, value: previousGroupId });
    return failure(
      500,
      rollback.ok ? auditRollbackMessage("分配") : auditRollbackIncompleteMessage("分配"),
    );
  }

  return { ok: true, value: { groupId: input.groupId, userId: input.userId, changed: true, replacedGroupName } };
}

/** 成员归属槽位快照（按 id 存），乐观更新失败时用它逐人还原。 */
export type WorkGroupSlotSnapshot = Map<
  string,
  { peerGroupId: string | null; operatorGroupId: string | null }
>;

export function snapshotWorkGroupSlots(
  roster: WorkGroupRosterMember[],
  userIds: string[],
): WorkGroupSlotSnapshot {
  const wanted = new Set(userIds);
  const snapshot: WorkGroupSlotSnapshot = new Map();
  for (const member of roster) {
    if (!wanted.has(member.id)) continue;
    snapshot.set(member.id, {
      peerGroupId: member.peerGroupId,
      operatorGroupId: member.operatorGroupId,
    });
  }
  return snapshot;
}

/**
 * 乐观更新的回滚：只还原快照里记过的人（传 onlyUserIds 时再收窄到这些人），
 * 其他人保持当前值，不整表覆盖，避免把并发产生的其他变更一起盖掉。
 * 没有任何人需要还原时原样返回入参，省掉一次无意义的重渲染。
 */
export function rollbackWorkGroupSlots(
  roster: WorkGroupRosterMember[],
  snapshot: WorkGroupSlotSnapshot,
  onlyUserIds?: ReadonlySet<string>,
): WorkGroupRosterMember[] {
  let restored = false;
  const next = roster.map((member) => {
    if (onlyUserIds && !onlyUserIds.has(member.id)) return member;
    const previous = snapshot.get(member.id);
    if (!previous) return member;
    if (previous.peerGroupId === member.peerGroupId && previous.operatorGroupId === member.operatorGroupId) {
      return member;
    }
    restored = true;
    return { ...member, peerGroupId: previous.peerGroupId, operatorGroupId: previous.operatorGroupId };
  });
  return restored ? next : roster;
}

export type WorkGroupBatchAssignOutcome = {
  groupId: string;
  /** 真正写入成功的人数（含同槽位自动替换），幂等跳过的不计入。 */
  assignedCount: number;
  /** 已在目标小队、无需写入的人数。 */
  skippedCount: number;
  /** 失败明细（按入参顺序）；全部成功时为空数组。 */
  failures: Array<{ userId: string; message: string }>;
  details: Array<{ userId: string; changed: boolean; replacedGroupName: string | null }>;
};

/**
 * 批量分配：逐个复用 assignWorkGroupMember，失败不中断、也不回滚已成功的人。
 *
 * 语义（2026-09-22 修复 A1）：
 * - 只要有人成功 → ok:true，失败的人如实放进 failures，由 UI 做增量回滚与逐条提示；
 * - 全员失败 → 直接返回首个失败，状态码与文案与单次分配一致；
 * - 空入参 → 成功且 0 人。
 */
export async function assignWorkGroupMembers(
  supabase: SupabaseClient,
  input: { actorId: string; actorTeamId: string; groupId: string; userIds: string[] },
): Promise<WorkGroupResult<WorkGroupBatchAssignOutcome>> {
  const userIds = Array.from(new Set(input.userIds));
  const details: WorkGroupBatchAssignOutcome["details"] = [];
  const failures: WorkGroupBatchAssignOutcome["failures"] = [];
  let firstFailure: WorkGroupFailure | null = null;

  for (const userId of userIds) {
    const res = await assignWorkGroupMember(supabase, {
      actorId: input.actorId,
      actorTeamId: input.actorTeamId,
      groupId: input.groupId,
      userId,
    });
    if (!res.ok) {
      if (!firstFailure) firstFailure = res;
      failures.push({ userId, message: res.message });
      continue;
    }
    details.push(res.value);
  }

  if (details.length === 0 && firstFailure) return firstFailure;

  return {
    ok: true,
    value: {
      groupId: input.groupId,
      assignedCount: details.filter((detail) => detail.changed).length,
      skippedCount: details.filter((detail) => !detail.changed).length,
      failures,
      details,
    },
  };
}

export async function unassignWorkGroupMember(
  supabase: SupabaseClient,
  input: { actorId: string; actorTeamId: string; groupId: string; userId: string },
): Promise<WorkGroupResult<{ groupId: string; userId: string; changed: boolean }>> {
  const loadedGroup = await loadWorkGroup(supabase, input.groupId);
  if (!loadedGroup.ok) return loadedGroup;
  const loadedMember = await loadMember(supabase, input.userId);
  if (!loadedMember.ok) return loadedMember;

  const plan = resolveWorkGroupUnassignment({
    actorTeamId: input.actorTeamId,
    group: loadedGroup.value,
    member: toAssignmentMember(loadedMember.value),
  });
  if (!plan.ok) return plan;
  const { column, changed, previousGroupId } = plan.value;
  if (!changed) return { ok: true, value: { groupId: input.groupId, userId: input.userId, changed: false } };

  const written = await updateMemberSlot(supabase, { userId: input.userId, column, value: null });
  if (!written.ok) return written;

  const audit = await writeAuditLog(supabase, {
    userId: input.actorId,
    action: "unassign_work_group",
    target: input.userId,
    detail: JSON.stringify({
      group_id: loadedGroup.value.id,
      group_name: loadedGroup.value.name,
      kind: loadedGroup.value.kind,
      slot: plan.value.slot,
    }),
  });
  if (!audit.ok) {
    const rollback = await updateMemberSlot(supabase, { userId: input.userId, column, value: previousGroupId });
    return failure(
      500,
      rollback.ok ? auditRollbackMessage("取消分配") : auditRollbackIncompleteMessage("取消分配"),
    );
  }

  return { ok: true, value: { groupId: input.groupId, userId: input.userId, changed: true } };
}
