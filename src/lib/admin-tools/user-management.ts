import { createAdminClient } from "@/lib/supabase/admin";
import {
  canChangeMemberRole,
  canRemoveMemberTarget,
  isProfileWriteApplied,
  sanitizePermissions,
} from "@/app/(app)/admin/权限管理";
import { canManagePermissionsForTarget } from "@/lib/business-role";
import type { Permissions, UserRole } from "@/types";
import type { ToolExecutionResult, ToolContext } from "./types";
import { toOptionalString, toSafeString } from "./utils";

type AdminToolProfile = {
  id: string;
  name?: string | null;
  role: UserRole;
  permissions?: Permissions | null;
  team_id?: string | null;
  status?: string | null;
};

async function loadActorAndTargetProfiles(service: ReturnType<typeof createAdminClient>, actorId: string, targetId: string) {
  const { data, error } = await service
    .from("profiles")
    .select("id, name, role, permissions, team_id, status")
    .in("id", [actorId, targetId]);
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

  const service = createAdminClient();
  const [profilesResult, { data: reports }, { data: exemptions }] = await Promise.all([
    loadActorAndTargetProfiles(service, context.actorId, userId),
    service.from("daily_reports").select("id").eq("user_id", userId),
    service.from("exemption_grant").select("id").eq("user_id", userId),
  ]);

  if ("error" in profilesResult) return { success: false, error: profilesResult.error };
  const { actor, target: profile } = profilesResult;
  if (!profile) return { success: false, error: "用户不存在" };
  if (
    !canRemoveMemberTarget({
      actorRole: context.actorRole,
      actorId: context.actorId,
      actorPermissions: context.actorPermissions,
      actorTeamId: actor?.team_id ?? null,
      targetId: userId,
      targetRole: profile.role,
      targetPermissions: profile.permissions ?? {},
      targetTeamId: profile.team_id ?? null,
    })
  ) {
    return { success: false, error: context.actorRole === "owner" ? "不能踢出该用户" : "负责人只能踢出本团队组员" };
  }

  const backupSql = `INSERT INTO profiles_backup SELECT * FROM profiles WHERE id = '${userId}';`;
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

  const { error: banError } = await service.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });
  if (banError) return { success: false, error: banError.message, backupSql, beforeSnapshot: profile, affectedData };

  const { data: updatedProfile, error } = await service
    .from("profiles")
    .update({ role: "member", permissions: {} })
    .eq("id", userId)
    .select("id")
    .single();
  if (error) return { success: false, error: error.message, backupSql, beforeSnapshot: profile, affectedData };
  if (!isProfileWriteApplied(updatedProfile)) {
    return { success: false, error: "踢出用户未生效，请刷新后重试", backupSql, beforeSnapshot: profile, affectedData };
  }

  const { data: after } = await service.from("profiles").select("id, role, permissions").eq("id", userId).single();

  return {
    success: true,
    data: { userId },
    backupSql,
    beforeSnapshot: profile,
    afterSnapshot: after,
    affectedData,
  };
}

export async function changeUserRole(
  params: Record<string, unknown>,
  dryRun: boolean,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  const userId = toOptionalString(params.userId);
  const newRole = toSafeString(params.newRole);
  if (!userId || !["member", "admin"].includes(newRole)) {
    return { success: false, error: "newRole 仅支持 member/admin" };
  }
  const requestedRole = newRole as "member" | "admin";

  const service = createAdminClient();
  const profilesResult = await loadActorAndTargetProfiles(service, context.actorId, userId);
  if ("error" in profilesResult) return { success: false, error: profilesResult.error };

  const { actor, target: before } = profilesResult;
  if (!before) return { success: false, error: "用户不存在" };
  if (
    !canChangeMemberRole({
      actorRole: context.actorRole,
      actorId: context.actorId,
      actorPermissions: context.actorPermissions,
      actorTeamId: actor?.team_id ?? null,
      targetId: userId,
      targetRole: before.role,
      targetPermissions: before.permissions ?? {},
      targetTeamId: before.team_id ?? null,
      newRole: requestedRole,
    })
  ) {
    return { success: false, error: context.actorRole === "owner" ? "不能修改该用户角色" : "负责人只能调整本团队组员和组长" };
  }

  const backupSql = `UPDATE profiles SET role='${before.role}' WHERE id='${userId}';`;
  if (dryRun) return { success: true, backupSql, beforeSnapshot: before, affectedData: { userId, newRole: requestedRole } };

  const payload = requestedRole === "member" ? { role: requestedRole, permissions: {} } : { role: requestedRole };
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

  const { data: after } = await service.from("profiles").select("id, role, permissions").eq("id", userId).single();
  return { success: true, data: { userId, newRole: requestedRole }, backupSql, beforeSnapshot: before, afterSnapshot: after };
}

export async function updateUserPermissions(
  params: Record<string, unknown>,
  dryRun: boolean,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  const userId = toOptionalString(params.userId);
  const permissions = params.permissions as Record<string, boolean> | undefined;
  if (!userId || !permissions || typeof permissions !== "object") {
    return { success: false, error: "参数无效" };
  }
  if (userId === context.actorId) return { success: false, error: "不能修改自己的权限" };

  const service = createAdminClient();
  const profilesResult = await loadActorAndTargetProfiles(service, context.actorId, userId);
  if ("error" in profilesResult) return { success: false, error: profilesResult.error };
  const { actor, target: before } = profilesResult;
  if (!actor || !before) return { success: false, error: "用户不存在" };
  if (!canManagePermissionsForTarget(actor, before)) {
    return {
      success: false,
      error: context.actorBusinessRole === "team_admin" ? "负责人只能修改本团队权限" : "无权限",
    };
  }

  const backupSql = `UPDATE profiles SET permissions='${JSON.stringify(before.permissions ?? {})}'::jsonb WHERE id='${userId}';`;
  const sanitizedPermissions = sanitizePermissions(permissions);
  if (dryRun) return { success: true, backupSql, beforeSnapshot: before, affectedData: { userId, permissions: sanitizedPermissions } };

  const { data: updatedProfile, error } = await service
    .from("profiles")
    .update({ permissions: sanitizedPermissions })
    .eq("id", userId)
    .select("id")
    .single();
  if (error) return { success: false, error: error.message, backupSql, beforeSnapshot: before };
  if (!isProfileWriteApplied(updatedProfile)) {
    return { success: false, error: "权限更新未生效，请刷新后重试", backupSql, beforeSnapshot: before };
  }

  const { data: after } = await service.from("profiles").select("id, permissions").eq("id", userId).single();
  return { success: true, data: { userId }, backupSql, beforeSnapshot: before, afterSnapshot: after };
}
