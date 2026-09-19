import { createAdminClient } from "@/lib/supabase/admin";
import {
  canChangeMemberRole,
  isProfileWriteApplied,
} from "@/app/(app)/admin/权限管理";
import { archiveMemberWithClient } from "@/lib/member-lifecycle-service";
import { canArchiveMember } from "@/lib/member-lifecycle";
import { buildCompanyRoleProfilePatch, resolveProfileCompanyRole } from "@/lib/company-permissions";
import type { Permissions, UserRole } from "@/types";
import type { ToolExecutionResult, ToolContext } from "./types";
import { isActiveTargetInScope } from "./scope";
import { toOptionalString, toTrimmedString } from "./utils";

type AdminToolProfile = {
  id: string;
  name?: string | null;
  role: UserRole;
  company_role?: "member" | "admin" | "company_owner" | null;
  permissions?: Permissions | null;
  team_id?: string | null;
  status?: string | null;
};

export const ARCHIVE_ROLLBACK_GUIDANCE =
  "归档同时涉及 Auth 封禁和 profile 多字段修改，禁止直接 SQL 回滚，请使用 restoreMember 正式恢复流程。";

async function loadActorAndTargetProfiles(service: ReturnType<typeof createAdminClient>, actorId: string, targetId: string) {
  let { data, error } = await service
    .from("profiles")
    .select("id, name, role, company_role, permissions, team_id, status")
    .in("id", [actorId, targetId]);
  if (error?.message?.includes("company_role")) {
    const legacy = await service
      .from("profiles")
      .select("id, name, role, permissions, team_id, status")
      .in("id", [actorId, targetId]);
    data = legacy.data as unknown as typeof data;
    error = legacy.error;
  }
  if (error) return { error: error.message };

  const profiles = (data ?? []) as AdminToolProfile[];
  return {
    actor: profiles.find((profile) => profile.id === actorId) ?? null,
    target: profiles.find((profile) => profile.id === targetId) ?? null,
  };
}

export async function kickUser(
  params: Record<string, unknown>,
  dryRun: boolean,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  const userId = toOptionalString(params.userId);
  if (!userId) return { success: false, error: "缺少 userId" };
  if (!isActiveTargetInScope(context, userId)) return { success: false, error: "不能归档当前管理范围外的成员" };
  const reason = toTrimmedString(params.reason);
  if (!reason) return { success: false, error: "归档必须填写原因" };

  const service = createAdminClient();
  const [profilesResult, { data: reports }, { data: exemptions }] = await Promise.all([
    loadActorAndTargetProfiles(service, context.actorId, userId),
    service.from("daily_reports").select("id").eq("user_id", userId),
    service.from("exemption_grant").select("id").eq("user_id", userId),
  ]);

  if ("error" in profilesResult) return { success: false, error: profilesResult.error };
  const { target: profile } = profilesResult;
  if (!profile) return { success: false, error: "用户不存在" };
  const targetRoleResolution = resolveProfileCompanyRole(profile.role, profile.company_role);
  if (targetRoleResolution.conflict || !targetRoleResolution.companyRole) {
    return { success: false, error: "成员角色字段冲突或无效，拒绝操作" };
  }
  if (context.actorPermissions.manage_members !== true) return { success: false, error: "无权限归档账号" };
  if (context.actorId === userId) return { success: false, error: "不能归档自己" };
  if (!canArchiveMember({
    actorRole: context.actorRole,
    actorCompanyRole: context.actorCompanyRole,
    actorPermissions: context.actorPermissions,
    actorTeamId: context.actorTeamId,
    groupMode: context.groupMode,
    actorId: context.actorId,
    target: {
      id: profile.id,
      role: profile.role,
      company_role: profile.company_role,
      permissions: profile.permissions ?? {},
      team_id: profile.team_id ?? null,
    },
  })) {
    return { success: false, error: "不能归档当前管理范围外的成员" };
  }

  const backupSql = ARCHIVE_ROLLBACK_GUIDANCE;
  const affectedData = {
    user: profile,
    metricsCount: reports?.length ?? 0,
    exemptionsCount: exemptions?.length ?? 0,
  };

  if (dryRun) {
    return {
      success: true,
      backupSql,
      beforeSnapshot: profile,
      affectedData,
    };
  }

  const lifecycle = await archiveMemberWithClient({
    client: service,
    actor: {
      id: context.actorId,
      role: context.actorRole,
      companyRole: context.actorCompanyRole,
      permissions: context.actorPermissions,
      teamId: context.actorTeamId,
      groupMode: context.groupMode,
    },
    targetId: userId,
    reason,
    archivedAt: new Date().toISOString(),
  });
  if (!lifecycle.ok) {
    return {
      success: false,
      error: lifecycle.error,
      backupSql,
      beforeSnapshot: profile,
      affectedData,
    };
  }

  return {
    success: true,
    data: { userId },
    backupSql,
    beforeSnapshot: profile,
    afterSnapshot: lifecycle.afterSnapshot,
    affectedData,
  };
}

export async function changeUserRole(
  params: Record<string, unknown>,
  dryRun: boolean,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  const userId = toOptionalString(params.userId);
  const newRole = toTrimmedString(params.newRole);
  if (!userId || !["member", "admin"].includes(newRole)) {
    return { success: false, error: "newRole 仅支持 member/admin" };
  }
  if (!isActiveTargetInScope(context, userId)) return { success: false, error: "不能修改当前管理范围外的成员" };
  const requestedRole = newRole as "member" | "admin";

  const service = createAdminClient();
  const profilesResult = await loadActorAndTargetProfiles(service, context.actorId, userId);
  if ("error" in profilesResult) return { success: false, error: profilesResult.error };

  const { actor, target: before } = profilesResult;
  if (!before) return { success: false, error: "用户不存在" };
  const targetRoleResolution = resolveProfileCompanyRole(before.role, before.company_role);
  if (targetRoleResolution.conflict || !targetRoleResolution.companyRole) {
    return { success: false, error: "成员角色字段冲突或无效，拒绝操作" };
  }
  const targetRole: UserRole = targetRoleResolution.companyRole === "company_owner"
    ? "owner"
    : targetRoleResolution.companyRole;
  if (
    !canChangeMemberRole({
      actorRole: context.actorRole,
      actorCompanyRole: context.actorCompanyRole,
      actorId: context.actorId,
      actorPermissions: context.actorPermissions,
      actorTeamId: actor?.team_id ?? null,
      groupMode: context.groupMode,
      targetId: userId,
      targetRole,
      targetPermissions: before.permissions ?? {},
      targetTeamId: before.team_id ?? null,
      newRole: requestedRole,
    })
  ) {
    return { success: false, error: context.actorRole === "owner" ? "不能修改该用户角色" : "负责人只能调整本团队组员和组长" };
  }

  const backupCompanyRole = targetRoleResolution.companyRole;
  const backupSql = `UPDATE profiles SET role='${before.role}', company_role='${backupCompanyRole}' WHERE id='${userId}';`;
  if (dryRun) return { success: true, backupSql, beforeSnapshot: before, affectedData: { userId, newRole: requestedRole } };

  const payload = buildCompanyRoleProfilePatch(requestedRole);
  const { data: updatedProfile, error } = await service
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("id")
    .single();
  if (error) return { success: false, error: error.message, backupSql, beforeSnapshot: before };
  if (!isProfileWriteApplied(updatedProfile)) {
    return { success: false, error: "角色更新未生效，请刷新后重试", backupSql, beforeSnapshot: before };
  }

  const { data: after, error: rereadError } = await service
    .from("profiles")
    .select("id, role, company_role, permissions")
    .eq("id", userId)
    .single();
  if (rereadError || !after) {
    return { success: false, error: rereadError?.message ?? "角色更新复读失败", backupSql, beforeSnapshot: before };
  }
  const afterRoleResolution = resolveProfileCompanyRole(after.role, after.company_role);
  if (
    afterRoleResolution.conflict
    || after.role !== requestedRole
    || after.company_role !== requestedRole
  ) {
    return { success: false, error: "角色更新复读校验失败，请刷新后重试", backupSql, beforeSnapshot: before, afterSnapshot: after };
  }
  return { success: true, data: { userId, newRole: requestedRole }, backupSql, beforeSnapshot: before, afterSnapshot: after };
}
