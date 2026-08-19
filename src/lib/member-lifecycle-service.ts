import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildArchiveMemberProfilePatch,
  buildRestoreMemberProfilePatch,
  canArchiveMember,
  canRestoreMember,
  normalizeMembershipStatus,
  type MemberArchiveSnapshot,
  type MemberLifecycleProfile,
} from "@/lib/member-lifecycle";
import type { Permissions, UserRole } from "@/types";

type PostgrestErrorLike = { code?: string; message?: string } | null;

export type MemberLifecycleClient = SupabaseClient;

export type MemberLifecycleProfileRow = MemberLifecycleProfile & {
  name?: string | null;
  permissions: Permissions | null;
  team_id: string | null;
  membership_status: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  archive_snapshot?: MemberArchiveSnapshot | null;
};

export type MemberLifecycleActor = {
  id: string;
  role: UserRole;
  permissions?: Permissions | null;
  teamId?: string | null;
  groupMode?: boolean;
};

export type MemberLifecycleOperationResult =
  | {
      ok: true;
      changed: boolean;
      target: MemberLifecycleProfileRow;
      beforeSnapshot: Record<string, unknown>;
      afterSnapshot: Record<string, unknown>;
      affectedData?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      firstError: string;
    };

type AuthUserSnapshot = {
  metadata: Record<string, unknown>;
  banned: boolean;
};

const LONG_BAN_DURATION = "876000h";

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return String(error || "未知错误");
}

function isMissingLifecycleColumnError(error: PostgrestErrorLike) {
  const message = error?.message ?? "";
  return [
    "membership_status",
    "archived_at",
    "archived_by",
    "archive_reason",
    "archive_snapshot",
  ].some((column) => message.includes(column));
}

function isMissingCompanyRoleColumnError(error: PostgrestErrorLike) {
  const message = error?.message ?? "";
  return message.includes("company_role") || message.includes("Could not find the 'company_role' column");
}

function operationFailure(
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

function normalizeMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return { ...(metadata as Record<string, unknown>) };
}

function isUserBanned(bannedUntil: string | null | undefined) {
  if (!bannedUntil || bannedUntil === "none") return false;
  const timestamp = Date.parse(bannedUntil);
  return Number.isNaN(timestamp) || timestamp > Date.now();
}

async function loadAuthUserSnapshot(
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

async function setAuthBan(client: MemberLifecycleClient, userId: string, banned: boolean) {
  const result = await client.auth.admin.updateUserById(userId, {
    ban_duration: banned ? LONG_BAN_DURATION : "none",
  });
  return result.error;
}

export async function syncAuthUserTeamMetadata(
  client: MemberLifecycleClient,
  userId: string,
  input: {
    teamId: string | null;
    teamName: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  let metadata = input.metadata;
  if (!metadata) {
    const snapshot = await loadAuthUserSnapshot(client, userId);
    if (!snapshot.ok) return snapshot.error;
    metadata = snapshot.value.metadata;
  }

  const result = await client.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...metadata,
      team_id: input.teamId,
      team_name: input.teamName,
    },
  });
  return result.error;
}

async function restoreAuthUserMetadata(
  client: MemberLifecycleClient,
  userId: string,
  metadata: Record<string, unknown>,
) {
  const result = await client.auth.admin.updateUserById(userId, {
    user_metadata: metadata,
  });
  return result.error;
}

async function loadTargetProfile(client: MemberLifecycleClient, targetId: string) {
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

async function loadName(
  client: MemberLifecycleClient,
  table: "teams",
  id: string | null,
) {
  if (!id) return { name: null as string | null };
  const result = await client.from(table).select("name").eq("id", id).maybeSingle<{ name: string | null }>();
  if (result.error) return { error: result.error.message ?? "加载团队名称失败" };
  return { name: result.data?.name ?? null };
}

function toProfileSnapshot(profile: MemberLifecycleProfileRow): Record<string, unknown> {
  return {
    id: profile.id,
    name: profile.name ?? null,
    role: profile.role,
    ...(profile.company_role !== undefined ? { company_role: profile.company_role } : {}),
    permissions: profile.permissions ?? {},
    team_id: profile.team_id ?? null,
    membership_status: normalizeMembershipStatus(profile.membership_status),
    archived_at: profile.archived_at ?? null,
    archived_by: profile.archived_by ?? null,
    archive_reason: profile.archive_reason ?? null,
    archive_snapshot: profile.archive_snapshot ?? null,
  };
}

function buildOriginalProfilePatch(profile: MemberLifecycleProfileRow): Record<string, unknown> {
  return {
    role: profile.role,
    ...(profile.company_role !== undefined ? { company_role: profile.company_role } : {}),
    permissions: profile.permissions ?? {},
    team_id: profile.team_id ?? null,
    membership_status: normalizeMembershipStatus(profile.membership_status),
    archived_at: profile.archived_at ?? null,
    archived_by: profile.archived_by ?? null,
    archive_reason: profile.archive_reason ?? null,
    archive_snapshot: profile.archive_snapshot ?? null,
  };
}

async function writeProfile(
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

async function writeMemberChangeLog(
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

async function rollback(
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

export async function transferMemberToTeamWithClient(input: {
  client: MemberLifecycleClient;
  actor: MemberLifecycleActor;
  targetId: string;
  newTeamId: string;
  newTeamName: string;
}): Promise<MemberLifecycleOperationResult> {
  const loaded = await loadTargetProfile(input.client, input.targetId);
  if (!loaded.profile) {
    return operationFailure("transfer_team", "加载成员资料", new Error(loaded.error ?? "用户不存在"));
  }

  const target = loaded.profile;
  if (input.actor.id === target.id) return operationFailure("transfer_team", "校验", new Error("不能调配自己"));
  if (target.role === "owner" || target.company_role === "company_owner") return operationFailure("transfer_team", "校验", new Error("不能调配公司所有者"));
  if (normalizeMembershipStatus(target.membership_status) === "archived") {
    return operationFailure("transfer_team", "校验", new Error("已归档账号不能调配团队，请先恢复账号"));
  }
  if (target.team_id === input.newTeamId) {
    return {
      ok: true,
      changed: false,
      target,
      beforeSnapshot: toProfileSnapshot(target),
      afterSnapshot: toProfileSnapshot(target),
    };
  }

  const beforeSnapshot = toProfileSnapshot(target);
  const auth = await loadAuthUserSnapshot(input.client, target.id);
  if (!auth.ok) return operationFailure("transfer_team", "读取 Auth 用户", auth.error);

  const profileWrite = await writeProfile(input.client, target.id, {
    team_id: input.newTeamId,
  });
  if (profileWrite.error) return operationFailure("transfer_team", "成员资料写入", profileWrite.error);

  const metadataError = await syncAuthUserTeamMetadata(input.client, target.id, {
    teamId: input.newTeamId,
    teamName: input.newTeamName,
    metadata: auth.value.metadata,
  });
  if (metadataError) {
    const rollbackErrors = await rollback([
      {
        label: "恢复成员团队归属",
        run: async () => (await writeProfile(input.client, target.id, {
          team_id: target.team_id ?? null,
        })).error,
      },
      {
        label: "恢复 Auth 团队元数据",
        run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata),
      },
    ]);
    return operationFailure("transfer_team", "Auth 团队元数据同步", metadataError, rollbackErrors);
  }

  const logError = await writeMemberChangeLog(input.client, {
    targetId: target.id,
    teamId: input.newTeamId,
    actionType: "transfer_team",
    operatorId: input.actor.id,
  });
  if (logError) {
    const rollbackErrors = await rollback([
      {
        label: "恢复成员团队归属",
        run: async () => (await writeProfile(input.client, target.id, {
          team_id: target.team_id ?? null,
        })).error,
      },
      {
        label: "恢复 Auth 团队元数据",
        run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata),
      },
    ]);
    return operationFailure("transfer_team", "成员变更日志写入", logError, rollbackErrors);
  }

  return {
    ok: true,
    changed: true,
    target,
    beforeSnapshot,
    afterSnapshot: { ...beforeSnapshot, team_id: input.newTeamId },
    affectedData: { userId: target.id, teamId: input.newTeamId },
  };
}

export async function removeMemberFromTeamWithClient(input: {
  client: MemberLifecycleClient;
  actor: MemberLifecycleActor;
  targetId: string;
}): Promise<MemberLifecycleOperationResult> {
  const loaded = await loadTargetProfile(input.client, input.targetId);
  if (!loaded.profile) {
    return operationFailure("remove_from_team", "加载成员资料", new Error(loaded.error ?? "用户不存在"));
  }

  const target = loaded.profile;
  if (input.actor.id === target.id) return operationFailure("remove_from_team", "校验", new Error("不能移出自己"));
  if (target.role === "owner" || target.company_role === "company_owner") return operationFailure("remove_from_team", "校验", new Error("不能移出公司所有者"));
  if (normalizeMembershipStatus(target.membership_status) === "archived") {
    return {
      ok: true,
      changed: false,
      target,
      beforeSnapshot: toProfileSnapshot(target),
      afterSnapshot: toProfileSnapshot(target),
    };
  }
  if (target.team_id === null) {
    return {
      ok: true,
      changed: false,
      target,
      beforeSnapshot: toProfileSnapshot(target),
      afterSnapshot: toProfileSnapshot(target),
    };
  }

  const beforeSnapshot = toProfileSnapshot(target);
  const auth = await loadAuthUserSnapshot(input.client, target.id);
  if (!auth.ok) return operationFailure("remove_from_team", "读取 Auth 用户", auth.error);

  const profileWrite = await writeProfile(input.client, target.id, { team_id: null });
  if (profileWrite.error) return operationFailure("remove_from_team", "成员资料写入", profileWrite.error);

  const metadataError = await syncAuthUserTeamMetadata(input.client, target.id, {
    teamId: null,
    teamName: null,
    metadata: auth.value.metadata,
  });
  if (metadataError) {
    const rollbackErrors = await rollback([
      {
        label: "恢复成员团队归属",
        run: async () => (await writeProfile(input.client, target.id, {
          team_id: target.team_id ?? null,
        })).error,
      },
      {
        label: "恢复 Auth 团队元数据",
        run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata),
      },
    ]);
    return operationFailure("remove_from_team", "Auth 团队元数据同步", metadataError, rollbackErrors);
  }

  const logError = await writeMemberChangeLog(input.client, {
    targetId: target.id,
    teamId: target.team_id ?? null,
    actionType: "remove_from_team",
    operatorId: input.actor.id,
  });
  if (logError) {
    const rollbackErrors = await rollback([
      {
        label: "恢复成员团队归属",
        run: async () => (await writeProfile(input.client, target.id, {
          team_id: target.team_id ?? null,
        })).error,
      },
      {
        label: "恢复 Auth 团队元数据",
        run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata),
      },
    ]);
    return operationFailure("remove_from_team", "成员变更日志写入", logError, rollbackErrors);
  }

  return {
    ok: true,
    changed: true,
    target,
    beforeSnapshot,
    afterSnapshot: { ...beforeSnapshot, team_id: null },
  };
}

export async function archiveMemberWithClient(input: {
  client: MemberLifecycleClient;
  actor: MemberLifecycleActor;
  targetId: string;
  reason: string;
  archivedAt: string;
}): Promise<MemberLifecycleOperationResult> {
  const reason = input.reason.trim();
  if (!reason) return operationFailure("archive", "校验归档原因", new Error("归档必须填写原因"));
  if (reason.length > 500) return operationFailure("archive", "校验归档原因", new Error("归档原因不能超过 500 个字符"));

  const loaded = await loadTargetProfile(input.client, input.targetId);
  if (!loaded.profile) {
    return operationFailure("archive", "加载成员资料", new Error(loaded.error ?? "用户不存在"));
  }
  const target = loaded.profile;

  if (!canArchiveMember({
    actorRole: input.actor.role,
    actorPermissions: input.actor.permissions,
    actorTeamId: input.actor.teamId,
    groupMode: input.actor.groupMode,
    actorId: input.actor.id,
    target,
  })) {
    return operationFailure("archive", "权限校验", new Error("不能归档当前管理范围外的成员"));
  }
  if (normalizeMembershipStatus(target.membership_status) === "archived") {
    return {
      ok: true,
      changed: false,
      target,
      beforeSnapshot: toProfileSnapshot(target),
      afterSnapshot: toProfileSnapshot(target),
    };
  }

  const [team, auth] = await Promise.all([
    loadName(input.client, "teams", target.team_id ?? null),
    loadAuthUserSnapshot(input.client, target.id),
  ]);
  if (team.error) return operationFailure("archive", "加载团队快照", new Error(team.error));
  if (!auth.ok) return operationFailure("archive", "读取 Auth 用户", auth.error);

  const beforeSnapshot = toProfileSnapshot(target);
  const archiveSnapshot: MemberArchiveSnapshot = {
    role: target.role,
    ...(target.company_role !== undefined ? { company_role: target.company_role } : {}),
    permissions: target.permissions ?? {},
    team_id: target.team_id ?? null,
    team_name: team.name,
  };
  const profilePatch = buildArchiveMemberProfilePatch({
    target,
    archivedBy: input.actor.id,
    reason,
    archivedAt: input.archivedAt,
    snapshot: archiveSnapshot,
  });
  if (target.company_role === undefined) {
    delete (profilePatch as Partial<Record<keyof typeof profilePatch, unknown>>).company_role;
  }

  const banError = await setAuthBan(input.client, target.id, true);
  if (banError) return operationFailure("archive", "Auth 封禁", banError);

  const profileWrite = await writeProfile(input.client, target.id, profilePatch);
  if (profileWrite.error) {
    const rollbackErrors = await rollback([
      { label: "恢复 Auth 登录状态", run: () => setAuthBan(input.client, target.id, auth.value.banned) },
    ]);
    return operationFailure("archive", "成员资料写入", profileWrite.error, rollbackErrors);
  }

  const metadataError = await syncAuthUserTeamMetadata(input.client, target.id, {
    teamId: null,
    teamName: null,
    metadata: auth.value.metadata,
  });
  if (metadataError) {
    const rollbackErrors = await rollback([
      { label: "恢复成员资料", run: () => writeProfile(input.client, target.id, buildOriginalProfilePatch(target)).then((result) => result.error) },
      { label: "恢复 Auth 团队元数据", run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata) },
      { label: "恢复 Auth 登录状态", run: () => setAuthBan(input.client, target.id, auth.value.banned) },
    ]);
    return operationFailure("archive", "Auth 团队元数据同步", metadataError, rollbackErrors);
  }

  const logError = await writeMemberChangeLog(input.client, {
    targetId: target.id,
    teamId: target.team_id ?? null,
    actionType: "archive",
    operatorId: input.actor.id,
    reason,
  });
  if (logError) {
    const rollbackErrors = await rollback([
      { label: "恢复成员资料", run: () => writeProfile(input.client, target.id, buildOriginalProfilePatch(target)).then((result) => result.error) },
      { label: "恢复 Auth 团队元数据", run: () => restoreAuthUserMetadata(input.client, target.id, auth.value.metadata) },
      { label: "恢复 Auth 登录状态", run: () => setAuthBan(input.client, target.id, auth.value.banned) },
    ]);
    return operationFailure("archive", "成员变更日志写入", logError, rollbackErrors);
  }

  const afterSnapshot = {
    ...beforeSnapshot,
    ...profilePatch,
  };
  return {
    ok: true,
    changed: true,
    target,
    beforeSnapshot,
    afterSnapshot,
    affectedData: { userId: target.id, archiveReason: reason },
  };
}

export async function restoreMemberWithClient(input: {
  client: MemberLifecycleClient;
  actor: MemberLifecycleActor;
  targetId: string;
}): Promise<MemberLifecycleOperationResult> {
  const loaded = await loadTargetProfile(input.client, input.targetId);
  if (!loaded.profile) {
    return operationFailure("restore", "加载成员资料", new Error(loaded.error ?? "用户不存在"));
  }
  const target = loaded.profile;

  if (!canRestoreMember({
    actorRole: input.actor.role,
    actorPermissions: input.actor.permissions,
    actorTeamId: input.actor.teamId,
    groupMode: input.actor.groupMode,
    actorId: input.actor.id,
    target,
  })) {
    return operationFailure("restore", "权限校验", new Error("不能恢复当前管理范围外的成员"));
  }
  if (normalizeMembershipStatus(target.membership_status) === "active") {
    return {
      ok: true,
      changed: false,
      target,
      beforeSnapshot: toProfileSnapshot(target),
      afterSnapshot: toProfileSnapshot(target),
    };
  }

  const auth = await loadAuthUserSnapshot(input.client, target.id);
  if (!auth.ok) return operationFailure("restore", "读取 Auth 用户", auth.error);
  const beforeSnapshot = toProfileSnapshot(target);
  const restorePatch = buildRestoreMemberProfilePatch();
  if (target.company_role === undefined) {
    delete (restorePatch as Partial<Record<keyof typeof restorePatch, unknown>>).company_role;
  }

  const unbanError = await setAuthBan(input.client, target.id, false);
  if (unbanError) return operationFailure("restore", "解除 Auth 封禁", unbanError);

  const profileWrite = await writeProfile(input.client, target.id, restorePatch);
  if (profileWrite.error) {
    const rollbackErrors = await rollback([
      { label: "恢复 Auth 封禁状态", run: () => setAuthBan(input.client, target.id, auth.value.banned) },
    ]);
    return operationFailure("restore", "成员资料写入", profileWrite.error, rollbackErrors);
  }

  const metadataError = await syncAuthUserTeamMetadata(input.client, target.id, {
    teamId: null,
    teamName: null,
    metadata: auth.value.metadata,
  });
  if (metadataError) {
    const rollbackErrors = await rollback([
      { label: "恢复归档成员资料", run: () => writeProfile(input.client, target.id, buildOriginalProfilePatch(target)).then((result) => result.error) },
      { label: "恢复 Auth 登录状态", run: () => setAuthBan(input.client, target.id, auth.value.banned) },
    ]);
    return operationFailure("restore", "Auth 团队元数据同步", metadataError, rollbackErrors);
  }

  const logError = await writeMemberChangeLog(input.client, {
    targetId: target.id,
    teamId: null,
    actionType: "restore",
    operatorId: input.actor.id,
  });
  if (logError) {
    const rollbackErrors = await rollback([
      { label: "恢复归档成员资料", run: () => writeProfile(input.client, target.id, buildOriginalProfilePatch(target)).then((result) => result.error) },
      { label: "恢复 Auth 登录状态", run: () => setAuthBan(input.client, target.id, auth.value.banned) },
    ]);
    return operationFailure("restore", "成员变更日志写入", logError, rollbackErrors);
  }

  return {
    ok: true,
    changed: true,
    target,
    beforeSnapshot,
    afterSnapshot: { ...beforeSnapshot, ...restorePatch },
    affectedData: { userId: target.id },
  };
}
