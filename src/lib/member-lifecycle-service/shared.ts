import {
normalizeMembershipStatus
} from "@/lib/member-lifecycle";
import type { CompanyRole } from "@/types";
import type { AuthUserSnapshot,MemberLifecycleClient,MemberLifecycleOperationResult,MemberLifecycleProfileRow,PostgrestErrorLike } from "./types";

export const LONG_BAN_DURATION = "876000h";

export function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return String(error || "未知错误");
}

export function isMissingLifecycleColumnError(error: PostgrestErrorLike) {
  const message = error?.message ?? "";
  return [
    "membership_status",
    "archived_at",
    "archived_by",
    "archive_reason",
    "archive_snapshot",
  ].some((column) => message.includes(column));
}

export function isMissingCompanyRoleColumnError(error: PostgrestErrorLike) {
  const message = error?.message ?? "";
  return message.includes("company_role") || message.includes("Could not find the 'company_role' column");
}

export function operationFailure(
  operation: string,
  stage: string,
  error: unknown,
  rollbackErrors: string[] = [],
): Extract<MemberLifecycleOperationResult, { ok: false }> {
  const firstError = errorMessage(error);
  const rollbackDetail = rollbackErrors.length > 0
    ? `；补偿失败：${rollbackErrors.join("；")}`
    : "";
  console.error("[member-lifecycle] operation failed", {
    operation,
    stage,
    firstError,
    rollbackErrors,
  });
  return {
    ok: false,
    error: `${stage}失败：${firstError}${rollbackDetail}`,
    firstError,
  };
}

export function normalizeMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return { ...(metadata as Record<string, unknown>) };
}

export function isUserBanned(bannedUntil: string | null | undefined) {
  if (!bannedUntil || bannedUntil === "none") return false;
  const timestamp = Date.parse(bannedUntil);
  return Number.isNaN(timestamp) || timestamp > Date.now();
}

export async function loadAuthUserSnapshot(
  client: MemberLifecycleClient,
  userId: string,
): Promise<{ ok: true; value: AuthUserSnapshot } | { ok: false; error: unknown }> {
  const result = await client.auth.admin.getUserById(userId);
  if (result.error) return { ok: false, error: result.error };
  if (!result.data.user) return { ok: false, error: new Error("Auth 用户不存在") };

  return {
    ok: true,
    value: {
      metadata: normalizeMetadata(result.data.user.user_metadata),
      banned: isUserBanned(result.data.user.banned_until),
    },
  };
}

export async function getAuthUserSnapshot(
  client: MemberLifecycleClient,
  userId: string,
) {
  return loadAuthUserSnapshot(client, userId);
}

export async function setAuthBan(client: MemberLifecycleClient, userId: string, banned: boolean) {
  const result = await client.auth.admin.updateUserById(userId, {
    ban_duration: banned ? LONG_BAN_DURATION : "none",
  });
  return result.error;
}

// CloudBase 团队归属以 profiles.team_id 为唯一真源，不再回写 Auth 用户元数据。
export async function syncAuthUserTeamMetadata(
  client: MemberLifecycleClient,
  userId: string,
  input: { teamId: string | null; teamName: string | null; metadata?: Record<string, unknown> },
) {
  void client;
  void userId;
  void input;
  return null;
}

export async function restoreAuthUserMetadata(
  client: MemberLifecycleClient,
  userId: string,
  metadata: Record<string, unknown>,
) {
  void client;
  void userId;
  void metadata;
  return null;
}

export async function loadTargetProfile(client: MemberLifecycleClient, targetId: string) {
  const result = await client
    .from("profiles")
    .select("id, name, role, company_role, permissions, team_id, membership_status, archived_at, archived_by, archive_reason, archive_snapshot")
    .eq("id", targetId)
    .maybeSingle<MemberLifecycleProfileRow>();

  if (isMissingCompanyRoleColumnError(result.error)) {
    const fallback = await client
      .from("profiles")
      .select("id, name, role, permissions, team_id, membership_status, archived_at, archived_by, archive_reason, archive_snapshot")
      .eq("id", targetId)
      .maybeSingle<MemberLifecycleProfileRow>();
    if (fallback.error) {
      if (isMissingLifecycleColumnError(fallback.error)) {
        return { error: "成员生命周期数据库迁移未完成，请先执行 member_lifecycle migration" };
      }
      return { error: fallback.error.message ?? "加载成员资料失败" };
    }
    if (!fallback.data) return { error: "用户不存在" };
    return { profile: fallback.data };
  }

  if (result.error) {
    if (isMissingLifecycleColumnError(result.error)) {
      return { error: "成员生命周期数据库迁移未完成，请先执行 member_lifecycle migration" };
    }
    return { error: result.error.message ?? "加载成员资料失败" };
  }
  if (!result.data) return { error: "用户不存在" };
  return { profile: result.data };
}

export async function loadName(
  client: MemberLifecycleClient,
  table: "teams",
  id: string | null,
) {
  if (!id) return { name: null as string | null };
  const result = await client.from(table).select("name").eq("id", id).maybeSingle<{ name: string | null }>();
  if (result.error) return { error: result.error.message ?? "加载团队名称失败" };
  return { name: result.data?.name ?? null };
}

export function toProfileSnapshot(profile: MemberLifecycleProfileRow): Record<string, unknown> {
  return {
    id: profile.id,
    name: profile.name ?? null,
    role: profile.role,
    ...(profile.company_role !== undefined ? { company_role: profile.company_role } : {}),
    permissions: profile.permissions ?? {}, // gate:legacy-permissions-ok 归档快照与失败回滚须保留原始字段，不用旧 JSON 授权
    team_id: profile.team_id ?? null,
    membership_status: normalizeMembershipStatus(profile.membership_status),
    archived_at: profile.archived_at ?? null,
    archived_by: profile.archived_by ?? null,
    archive_reason: profile.archive_reason ?? null,
    archive_snapshot: profile.archive_snapshot ?? null,
  };
}

export function buildOriginalProfilePatch(profile: MemberLifecycleProfileRow): Record<string, unknown> {
  return {
    role: profile.role,
    ...(profile.company_role !== undefined ? { company_role: profile.company_role } : {}),
    permissions: profile.permissions ?? {}, // gate:legacy-permissions-ok 归档快照与失败回滚须保留原始字段，不用旧 JSON 授权
    team_id: profile.team_id ?? null,
    membership_status: normalizeMembershipStatus(profile.membership_status),
    archived_at: profile.archived_at ?? null,
    archived_by: profile.archived_by ?? null,
    archive_reason: profile.archive_reason ?? null,
    archive_snapshot: profile.archive_snapshot ?? null,
  };
}

export function buildRoleColumnsPatch(
  profile: MemberLifecycleProfileRow,
  companyRole: CompanyRole,
): Record<string, unknown> {
  return {
    role: profile.role,
    company_role: companyRole,
  };
}

export function roleColumnsMatch(
  profile: MemberLifecycleProfileRow,
  patch: object,
) {
  const patchRecord = patch as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(patchRecord, "role") && profile.role !== patchRecord.role) return false;
  if (
    Object.prototype.hasOwnProperty.call(patchRecord, "company_role")
    && profile.company_role !== patchRecord.company_role
  ) {
    return false;
  }
  return true;
}

export async function writeProfile(
  client: MemberLifecycleClient,
  targetId: string,
  patch: object,
) {
  const result = await client
    .from("profiles")
    .update(patch)
    .eq("id", targetId)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (result.error) return { error: result.error };
  if (!result.data?.id) return { error: new Error("成员资料写入未生效") };
  return { data: result.data };
}

export async function writeProfileAndReload(
  client: MemberLifecycleClient,
  targetId: string,
  patch: object,
) {
  const write = await writeProfile(client, targetId, patch);
  if (write.error) return { error: write.error, applied: false };

  const loaded = await loadTargetProfile(client, targetId);
  if (!loaded.profile) {
    return { error: new Error(loaded.error ?? "成员资料复读失败"), applied: true };
  }
  if (!roleColumnsMatch(loaded.profile, patch)) {
    return { error: new Error("角色字段写入复读校验失败"), applied: true };
  }
  return { profile: loaded.profile };
}

export async function writeMemberChangeLog(
  client: MemberLifecycleClient,
  input: {
    targetId: string;
    teamId: string | null;
    actionType: "remove_from_team" | "transfer_team" | "archive" | "restore";
    operatorId: string;
    reason?: string | null;
  },
) {
  const result = await client.from("member_change_log").insert({
    profile_id: input.targetId,
    change_type: input.actionType,
    action_type: input.actionType,
    change_payload: {
      team_id: input.teamId,
      action_reason: input.reason ?? null,
    },
    audit_fields: {
      operator_id: input.operatorId,
    },
  });
  return result.error;
}

export async function updatePendingExemptionRequestTeam(
  client: MemberLifecycleClient,
  input: {
    userId: string;
    previousTeamId: string | null;
    nextTeamId: string | null;
  },
) {
  let query = client
    .from("exemption_request")
    .update({ team_id: input.nextTeamId })
    .eq("applicant_user_id", input.userId)
    .eq("request_status", "pending");

  query = input.previousTeamId === null
    ? query.is("team_id", null)
    : query.eq("team_id", input.previousTeamId);

  const result = await query.select("id, team_id");
  if (result.error) return { error: result.error };
  return {
    data: (result.data ?? []) as Array<{ id: string; team_id: string | null }>,
  };
}

export async function rollback(
  tasks: Array<{ label: string; run: () => Promise<unknown> }>,
) {
  const errors: string[] = [];
  for (const task of tasks) {
    try {
      const error = await task.run();
      if (error) errors.push(`${task.label}：${errorMessage(error)}`);
    } catch (error) {
      errors.push(`${task.label}：${errorMessage(error)}`);
    }
  }
  return errors;
}
