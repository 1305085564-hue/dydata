import type { SupabaseClient } from "@supabase/supabase-js";
import { observeMutation, type ObserveMutationDeps } from "./observed-mutation";
import {
  auditAppliedButNotLoggedMessage,
  auditRollbackIncompleteMessage,
  auditRollbackMessage,
  writeAuditLog,
} from "@/lib/audit-log";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import type {
  WorkGroupColumn,
  WorkGroupDbRow,
  WorkGroupDirectory,
  WorkGroupFailure,
  WorkGroupResult,
  WorkGroupRow,
  MemberDbRow,
} from "./work-groups/rules";
import {
  isWorkGroupKind,
  isWorkGroupSchemaMissing,
  mapWorkGroupRow,
  normalizeWorkGroupName,
  resolveWorkGroupAssignment,
  resolveWorkGroupUnassignment,
  MAX_WORK_GROUP_BATCH_ASSIGN_USERS,
  WORK_GROUP_BATCH_LIMIT_ERROR_CODE,
} from "./work-groups/rules";

export * from "./work-groups/rules";
export * from "./work-groups/slots";

function failure(status: number, message: string): WorkGroupFailure {
  return { ok: false, status, message };
}

function isDuplicateKeyError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|already exists/i.test(error.message ?? "");
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
  observationDeps: ObserveMutationDeps = {},
): Promise<WorkGroupResult<WorkGroupBatchAssignOutcome>> {
  const userIds = Array.from(new Set(input.userIds));
  const requestId = observationDeps.createRequestId?.() ?? crypto.randomUUID();
  const logBatchOutcome = async (resultCode: string, counts: { assigned: number; skipped: number; failed: number }) => {
    const status = resultCode === "success" || resultCode === "PARTIAL_SUCCESS" ? 200 : resultCode === WORK_GROUP_BATCH_LIMIT_ERROR_CODE ? 400 : 500;
    await observeMutation(
      "/api/admin/collaboration/assign-work-group-members",
      async (observation) => {
        observation.mark(status >= 400 ? "validate" : "finalize");
        observation.setDetail?.({
          actorId: input.actorId,
          teamId: input.actorTeamId,
          groupId: input.groupId,
          requestedCount: input.userIds.length,
          deduplicatedCount: userIds.length,
          assignedCount: counts.assigned,
          skippedCount: counts.skipped,
          failedCount: counts.failed,
          resultCode,
        });
        return Response.json({ ok: status < 500 }, { status });
      },
      { ...observationDeps, createRequestId: () => requestId },
    );
  };
  if (userIds.length > MAX_WORK_GROUP_BATCH_ASSIGN_USERS) {
    await logBatchOutcome(WORK_GROUP_BATCH_LIMIT_ERROR_CODE, { assigned: 0, skipped: 0, failed: 0 });
    return {
      ok: false,
      status: 400,
      code: WORK_GROUP_BATCH_LIMIT_ERROR_CODE,
      limit: MAX_WORK_GROUP_BATCH_ASSIGN_USERS,
      requestedCount: userIds.length,
      message: `一次最多分配 ${MAX_WORK_GROUP_BATCH_ASSIGN_USERS} 人，本次选择了 ${userIds.length} 人`,
    };
  }
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

  if (details.length === 0 && firstFailure) {
    await logBatchOutcome("ALL_FAILED", { assigned: 0, skipped: 0, failed: failures.length });
    return firstFailure;
  }

  await logBatchOutcome(failures.length > 0 ? "PARTIAL_SUCCESS" : "success", {
    assigned: details.filter((detail) => detail.changed).length,
    skipped: details.filter((detail) => !detail.changed).length,
    failed: failures.length,
  });

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
