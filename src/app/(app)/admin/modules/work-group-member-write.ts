import type { SupabaseClient } from "@supabase/supabase-js";

import type { CurrentPermissionContext } from "@/lib/current-permission-context";
import {
  isWorkGroupKind,
  isWorkGroupSchemaMissing,
  mapWorkGroupRow,
  resolveWorkGroupAssignment,
  resolveWorkGroupUnassignment,
  resolveWorkGroupWriteGate,
  type WorkGroupDbRow,
  type WorkGroupFailure,
  type WorkGroupResult,
} from "@/lib/work-groups";

export type MemberWorkGroupAssignment = {
  groupId: string;
  userId: string;
  changed: boolean;
  replacedGroupName: string | null;
};

export type MemberWorkGroupUnassignment = {
  groupId: string;
  userId: string;
  changed: boolean;
};

type WorkGroupChangeInput = { groupId: string; userId: string };
type RpcArgs = { p_member_id: string; p_slot: "peer" | "operator"; p_group_id: string | null };

type RpcResult = {
  ok?: unknown;
  changed?: unknown;
  reason?: unknown;
  previous_group_id?: unknown;
};

export type AuthenticatedWorkGroupRpcClient = {
  rpc: (
    functionName: "reassign_member_work_group",
    args: RpcArgs,
  ) => Promise<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

export type MemberWorkGroupWriteDeps = {
  backend: "cloudbase" | "supabase";
  resolvePermissionContext: () => Promise<CurrentPermissionContext | null>;
  createAdminClient: () => SupabaseClient;
  createAuthenticatedClient: () => Promise<AuthenticatedWorkGroupRpcClient>;
  assignSupabase: (
    client: SupabaseClient,
    input: { actorId: string; actorTeamId: string; groupId: string; userId: string },
  ) => Promise<WorkGroupResult<MemberWorkGroupAssignment>>;
  unassignSupabase: (
    client: SupabaseClient,
    input: { actorId: string; actorTeamId: string; groupId: string; userId: string },
  ) => Promise<WorkGroupResult<MemberWorkGroupUnassignment>>;
};

type MemberRow = {
  id: string;
  name: string | null;
  team_id: string | null;
  membership_status: string;
  company_role: string;
  work_peer_group_id: string | null;
  work_operator_group_id: string | null;
};

type TrustedRows = {
  group: NonNullable<ReturnType<typeof mapWorkGroupRow>>;
  member: MemberRow;
};

function failure(status: number, message: string): WorkGroupFailure {
  return { ok: false, status, message };
}

async function resolveActor(
  deps: MemberWorkGroupWriteDeps,
): Promise<{
  ok: true;
  actorId: string;
  teamId: string;
  companyRole: "admin" | "company_owner";
} | WorkGroupFailure> {
  const permission = await deps.resolvePermissionContext();
  if (!permission) return failure(403, "用户权限范围加载失败");

  const { permissionInfo, scope } = permission;
  if (
    permissionInfo.membershipStatus !== "active" ||
    (permissionInfo.companyRole !== "admin" && permissionInfo.companyRole !== "company_owner") ||
    permissionInfo.permissions?.manage_members !== true
  ) {
    return failure(403, "无权限管理成员小队");
  }

  const gate = resolveWorkGroupWriteGate({
    permissions: permissionInfo.permissions,
    actorTeamId: scope.teamId,
  });
  if (!gate.ok) return gate;

  return {
    ok: true,
    actorId: permissionInfo.userId,
    teamId: gate.teamId,
    companyRole: permissionInfo.companyRole,
  };
}

async function loadTrustedRows(
  client: SupabaseClient,
  input: WorkGroupChangeInput,
  teamId: string,
  actorRole: "admin" | "company_owner",
): Promise<{ ok: true; rows: TrustedRows } | WorkGroupFailure> {
  const [groupResult, memberResult] = await Promise.all([
    client
      .from("work_groups")
      .select("id, team_id, name, kind, created_at, created_by")
      .eq("id", input.groupId)
      .maybeSingle(),
    client
      .from("profiles")
      .select("id, name, team_id, membership_status, company_role, work_peer_group_id, work_operator_group_id")
      .eq("id", input.userId)
      .maybeSingle(),
  ]);

  if (groupResult.error || memberResult.error) {
    const missingSchema = isWorkGroupSchemaMissing(groupResult.error) || isWorkGroupSchemaMissing(memberResult.error);
    return failure(missingSchema ? 503 : 500, missingSchema ? "工种小队功能尚未上线" : "加载小队成员失败");
  }

  const group = groupResult.data
    ? mapWorkGroupRow(groupResult.data as WorkGroupDbRow)
    : null;
  if (!group || !isWorkGroupKind(group.kind)) return failure(404, "小队不存在");
  if (group.teamId !== teamId) return failure(403, "不能管理其他公司的小队");

  const member = memberResult.data as MemberRow | null;
  if (!member) return failure(404, "成员不存在");
  if (member.id !== input.userId) return failure(404, "成员不存在");
  if (member.team_id !== teamId) return failure(403, "不能调整其他公司的成员");
  if (
    member.membership_status !== "active" ||
    (actorRole === "admin" && member.company_role !== "member") ||
    (actorRole === "company_owner" && member.company_role !== "member" && member.company_role !== "admin")
  ) {
    return failure(403, "目标成员不在当前角色可管理的小队范围内");
  }

  return { ok: true, rows: { group, member } };
}

function parseRpcResult(value: unknown): RpcResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RpcResult;
}

function rpcFailure(error: { code?: string; message?: string } | null, result: RpcResult | null): WorkGroupFailure {
  if (error) {
    if (error.code === "42501") return failure(403, "无权限调整成员小队");
    if (error.code === "PGRST202" || error.code === "42883") return failure(503, "成员小队调整服务尚未就绪");
    return failure(500, "成员小队调整失败，请刷新后重试");
  }

  switch (result?.reason) {
    case "unauthenticated": return failure(401, "请登录后操作");
    case "forbidden": return failure(403, "无权限调整成员小队");
    case "member_not_assignable": return failure(403, "目标成员不在当前角色可管理的小队范围内");
    case "group_not_assignable": return failure(403, "不能管理其他公司的小队");
    case "group_kind_mismatch": return failure(400, "小队类型与归属位置不匹配");
    default: return failure(500, "成员小队调整失败，请刷新后重试");
  }
}

async function runCloudBaseRpc(
  deps: MemberWorkGroupWriteDeps,
  args: RpcArgs,
): Promise<WorkGroupResult<RpcResult>> {
  const client = await deps.createAuthenticatedClient();
  const { data, error } = await client.rpc("reassign_member_work_group", args);
  const result = parseRpcResult(data);
  if (error || result?.ok !== true) return rpcFailure(error, result);
  return { ok: true, value: result };
}

async function loadGroupName(client: SupabaseClient, groupId: string | null): Promise<string | null> {
  if (!groupId) return null;
  const { data, error } = await client.from("work_groups").select("name").eq("id", groupId).maybeSingle();
  if (error) return null;
  const name = (data as { name?: unknown } | null)?.name;
  return typeof name === "string" && name.trim() ? name : null;
}

export async function assignMemberWorkGroupForManagement(
  input: WorkGroupChangeInput,
  deps: MemberWorkGroupWriteDeps,
): Promise<WorkGroupResult<MemberWorkGroupAssignment>> {
  const actor = await resolveActor(deps);
  if (!actor.ok) return actor;

  if (deps.backend === "supabase") {
    return deps.assignSupabase(deps.createAdminClient(), {
      actorId: actor.actorId,
      actorTeamId: actor.teamId,
      groupId: input.groupId,
      userId: input.userId,
    });
  }

  const admin = deps.createAdminClient();
  const loaded = await loadTrustedRows(admin, input, actor.teamId, actor.companyRole);
  if (!loaded.ok) return loaded;
  const { group, member } = loaded.rows;
  if (member.id === actor.actorId) return failure(403, "不能调整自己的小队归属");

  const plan = resolveWorkGroupAssignment({
    actorTeamId: actor.teamId,
    group,
    member: {
      id: member.id,
      teamId: member.team_id,
      peerGroupId: member.work_peer_group_id,
      operatorGroupId: member.work_operator_group_id,
    },
  });
  if (!plan.ok) return plan;

  const mutation = await runCloudBaseRpc(deps, {
    p_member_id: member.id,
    p_slot: plan.value.slot,
    p_group_id: group.id,
  });
  if (!mutation.ok) return mutation;

  const previousGroupId = typeof mutation.value.previous_group_id === "string"
    ? mutation.value.previous_group_id
    : plan.value.previousGroupId;
  return {
    ok: true,
    value: {
      groupId: group.id,
      userId: member.id,
      changed: mutation.value.changed === true,
      replacedGroupName: mutation.value.changed === true ? await loadGroupName(admin, previousGroupId) : null,
    },
  };
}

export async function unassignMemberWorkGroupForManagement(
  input: WorkGroupChangeInput,
  deps: MemberWorkGroupWriteDeps,
): Promise<WorkGroupResult<MemberWorkGroupUnassignment>> {
  const actor = await resolveActor(deps);
  if (!actor.ok) return actor;

  if (deps.backend === "supabase") {
    return deps.unassignSupabase(deps.createAdminClient(), {
      actorId: actor.actorId,
      actorTeamId: actor.teamId,
      groupId: input.groupId,
      userId: input.userId,
    });
  }

  const admin = deps.createAdminClient();
  const loaded = await loadTrustedRows(admin, input, actor.teamId, actor.companyRole);
  if (!loaded.ok) return loaded;
  const { group, member } = loaded.rows;
  if (member.id === actor.actorId) return failure(403, "不能调整自己的小队归属");

  const plan = resolveWorkGroupUnassignment({
    actorTeamId: actor.teamId,
    group,
    member: {
      id: member.id,
      teamId: member.team_id,
      peerGroupId: member.work_peer_group_id,
      operatorGroupId: member.work_operator_group_id,
    },
  });
  if (!plan.ok) return plan;
  if (!plan.value.changed) {
    return { ok: true, value: { groupId: group.id, userId: member.id, changed: false } };
  }

  const mutation = await runCloudBaseRpc(deps, {
    p_member_id: member.id,
    p_slot: plan.value.slot,
    p_group_id: null,
  });
  if (!mutation.ok) return mutation;

  return {
    ok: true,
    value: { groupId: group.id, userId: member.id, changed: mutation.value.changed === true },
  };
}
