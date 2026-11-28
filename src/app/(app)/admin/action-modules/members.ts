import {
canActorManageMemberTeam,
canChangeMemberRole,
canRemoveMemberTarget,
isProfileWriteApplied,
resolveMemberTeamTransfer,
} from "@/app/(app)/admin/权限管理";
import {
formatTeamName,
getTeamNameMap,
resolveTargetRuntimeRole
} from "@/lib/admin-actions-helpers";
import {
auditRollbackIncompleteMessage,
auditRollbackMessage
} from "@/lib/audit-log";
import { buildCompanyRoleProfilePatch,resolveProfileCompanyRole } from "@/lib/company-permissions";
import type { RestoredTeamInfo,RestoreMemberActionResult } from "@/lib/member-lifecycle";
import {
archiveMemberWithClient,
removeMemberFromTeamWithClient,
restoreMemberWithClient,
transferMemberToTeamWithClient,
} from "@/lib/member-lifecycle-service";
import { getUserPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Permissions } from "@/types";
import { revalidatePath } from "next/cache";
import { adminActionFailure,auditNotLogged,lifecycleActor,recordAdminAudit } from "./audit";

export async function updateMemberTeam(
  targetUserId: string,
  newTeamId: string | null,
  options?: { expectedCurrentTeamId?: string | null },
): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  // 先过权限再看数据：没权限的人不该因为一次调用就读到成员资料。
  if (!canActorManageMemberTeam({ actorRole: perm.role, actorPermissions: perm.permissions })) {
    return { error: "无权限" };
  }

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: profileRows, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, role, company_role, name, permissions, team_id, membership_status")
    .in("id", [perm.userId, targetUserId]);
  if (profileError) return adminActionFailure("update-member-team", "加载成员资料失败，请稍后重试", profileError);

  const actor = profileRows?.find((profile) => profile.id === perm.userId);
  const target = profileRows?.find((profile) => profile.id === targetUserId);
  if (!target) return { error: "用户不存在" };
  const targetRole = resolveTargetRuntimeRole(target);
  if (!targetRole) return { error: "成员角色字段冲突或无效，拒绝操作" };
  if (
    options &&
    Object.prototype.hasOwnProperty.call(options, "expectedCurrentTeamId") &&
    (target.team_id ?? null) !== (options.expectedCurrentTeamId ?? null)
  ) {
    return { error: "成员归属已变化，请刷新后重试" };
  }

  const decision = resolveMemberTeamTransfer({
    actorRole: perm.role,
    actorCompanyRole: perm.companyRole,
    actorId: perm.userId,
    actorPermissions: perm.permissions,
    actorTeamId: actor?.team_id ?? null,
    targetId: targetUserId,
    targetRole,
    targetTeamId: target.team_id ?? null,
    newTeamId,
  });

  if (decision.error) return { error: decision.error };
  if (!decision.shouldApply) return {};

  if (target.membership_status === "archived") {
    return { error: "已归档账号不能调配团队，请先恢复账号" };
  }

  if (newTeamId === null) {
    const result = await removeMemberFromTeamWithClient({
      client: adminSupabase,
      actor: lifecycleActor(perm),
      targetId: targetUserId,
    });
    if (!result.ok) return { error: result.error };

    if (result.changed) {
      const audit = await recordAdminAudit({
        supabase,
        userId: perm.userId,
        action: "remove_from_team",
        target: targetUserId,
        detail: `将 ${target.name} 移出团队，账号仍可登录，数据保留`,
      });
      // 成员归属变更要重跑另一条受门禁的服务调用才能回头，失败风险高于收益：如实报告，不悄悄回滚。
      if (!audit.ok) return auditNotLogged("移出团队");
      revalidatePath("/admin");
      revalidatePath("/admin/modules");
    }
    return {};
  }

  const oldTeamId = target.team_id ?? null;
  const teamNames = await getTeamNameMap(adminSupabase, [oldTeamId, newTeamId]);
  const oldTeamName = formatTeamName(oldTeamId, teamNames);
  const newTeamName = formatTeamName(newTeamId, teamNames);
  const result = await transferMemberToTeamWithClient({
    client: adminSupabase,
    actor: lifecycleActor(perm),
    targetId: targetUserId,
    newTeamId,
    newTeamName,
  });
  if (!result.ok) return { error: result.error };

  const audit = await recordAdminAudit({
    supabase,
    userId: perm.userId,
    action: "transfer_team",
    target: targetUserId,
    detail: `将 ${target.name} 从 ${oldTeamName} 调配至 ${newTeamName}`,
  });
  // 同「移出团队」：跨成员归属的写操作不做二段回滚，如实报告已生效。
  if (!audit.ok) return auditNotLogged("调配团队");

  revalidatePath("/admin");
  revalidatePath("/admin/modules");
  return {};
}

export async function archiveMember(
  targetUserId: string,
  reason: string,
): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (perm.permissions.manage_members !== true) return { error: "无权限" };
  if (targetUserId === perm.userId) return { error: "不能归档自己" };
  if (!reason?.trim()) return { error: "归档必须填写原因" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const result = await archiveMemberWithClient({
    client: adminSupabase,
    actor: lifecycleActor(perm),
    targetId: targetUserId,
    reason,
    archivedAt: new Date().toISOString(),
  });
  if (!result.ok) return { error: result.error };

  if (result.changed) {
    const audit = await recordAdminAudit({
      supabase,
      userId: perm.userId,
      action: "archive_member",
      target: targetUserId,
      detail: `归档成员：${result.target.name ?? targetUserId}；原因：${reason.trim()}`,
    });
    // 归档回滚只能用「恢复成员」，那是把成员重置为（原团队）普通成员/空权限，
    // 不是原状态，因此不冒充回滚，按已生效上报。
    if (!audit.ok) return auditNotLogged("归档成员");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/modules");
  return {};
}

/** 恢复后回到归档前的团队；团队已被删除时 teamMissing 为 true、不分配团队。 */
export async function restoreMember(targetUserId: string): Promise<RestoreMemberActionResult> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (perm.permissions.manage_members !== true) return { error: "无权限" };
  if (targetUserId === perm.userId) return { error: "不能恢复自己" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const result = await restoreMemberWithClient({
    client: adminSupabase,
    actor: lifecycleActor(perm),
    targetId: targetUserId,
  });
  if (!result.ok) return { error: result.error };
  const { restoredTeamId = null, restoredTeamName = null, teamMissing = false } = (result.affectedData ?? {}) as RestoredTeamInfo;

  if (result.changed) {
    const audit = await recordAdminAudit({
      supabase,
      userId: perm.userId,
      action: "restore_member",
      target: targetUserId,
      detail: `恢复成员：${result.target.name ?? targetUserId}；恢复后${restoredTeamId ? `回到原团队「${restoredTeamName}」` : "未分配团队"}、普通成员、空权限`,
    });
    // 恢复的逆向操作是归档，需另填原因且会改归属，不作回滚，如实报告。
    if (!audit.ok) return auditNotLogged("恢复成员");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/modules");
  return { team: restoredTeamId ? { id: restoredTeamId, name: restoredTeamName } : null, teamMissing };
}

export async function resetMemberPassword(
  targetUserId: string,
  newPassword: string
): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (perm.permissions.manage_members !== true) return { error: "无权限" };
  if (targetUserId === perm.userId) return { error: "不能重置自己的密码" };

  const normalizedPassword = newPassword.trim();
  if (normalizedPassword.length < 6) return { error: "密码至少需要 6 位。" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const { data: profileRows, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, role, company_role, name, permissions, team_id, membership_status")
    .in("id", [perm.userId, targetUserId]);
  if (profileError) return adminActionFailure("reset-member-password", "加载成员资料失败，请稍后重试", profileError);

  const actor = profileRows?.find((profile) => profile.id === perm.userId);
  const target = profileRows?.find((profile) => profile.id === targetUserId);
  if (!target) return { error: "用户不存在" };
  if (target.membership_status === "archived") return { error: "已归档账号不能重置密码，请先恢复账号" };
  const targetRole = resolveTargetRuntimeRole(target);
  if (!targetRole) return { error: "成员角色字段冲突或无效，拒绝操作" };
  if (!canRemoveMemberTarget({
    actorRole: perm.role,
    actorCompanyRole: perm.companyRole,
    actorId: perm.userId,
    actorPermissions: perm.permissions,
    actorTeamId: actor?.team_id ?? null,
    targetId: targetUserId,
    targetRole,
    targetPermissions: (target.permissions ?? {}) as Permissions,
    targetTeamId: target.team_id ?? null,
  })) {
    return { error: perm.companyRole === "admin" ? "负责人只能重置本团队组员密码" : "不能重置该用户密码" };
  }

  const { error } = await adminSupabase.auth.admin.updateUserById(targetUserId, {
    password: normalizedPassword,
  });
  if (error) return adminActionFailure("reset-member-password", "重置密码失败，请稍后重试", error);

  const audit = await recordAdminAudit({
    supabase,
    userId: perm.userId,
    action: "reset_member_password",
    target: targetUserId,
    detail: `重置密码: ${target.name}`,
  });
  // 旧密码不可知，改不回去：承认已生效，让操作人去找留痕。
  if (!audit.ok) return auditNotLogged("重置密码");

  revalidatePath("/admin");
  return {};
}

export async function changeRole(
  targetUserId: string,
  newRole: "member" | "admin"
): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (perm.permissions.manage_members !== true) return { error: "无权限" };

  if (targetUserId === perm.userId) return { error: "不能修改自己的角色" };

  if (newRole !== "member" && newRole !== "admin") return { error: "无效角色" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: profileRows, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, role, company_role, name, permissions, team_id, membership_status")
    .in("id", [perm.userId, targetUserId]);
  if (profileError) return adminActionFailure("change-member-role", "加载成员资料失败，请稍后重试", profileError);

  const actor = profileRows?.find((profile) => profile.id === perm.userId);
  const target = profileRows?.find((profile) => profile.id === targetUserId);
  if (!target) return { error: "用户不存在" };
  if (target.membership_status === "archived") return { error: "已归档账号不能修改角色，请先恢复账号" };
  const targetRole = resolveTargetRuntimeRole(target);
  if (!targetRole) return { error: "成员角色字段冲突或无效，拒绝操作" };
  if (targetRole === "owner") {
    return { error: "不能修改其他团队所有者" };
  }

  if (
    !canChangeMemberRole({
      actorRole: perm.role,
      actorCompanyRole: perm.companyRole,
      actorId: perm.userId,
      actorPermissions: perm.permissions,
      actorTeamId: actor?.team_id ?? null,
      targetId: targetUserId,
      targetRole,
      targetPermissions: (target.permissions ?? {}) as Permissions,
      targetTeamId: target.team_id ?? null,
      newRole,
    })
  ) {
    return { error: perm.companyRole === "company_owner" ? "不能修改该用户角色" : "负责人只能调整本团队组员和组长" };
  }

  const updateData = buildCompanyRoleProfilePatch(newRole);

  const { data: updatedProfile, error } = await adminSupabase
    .from("profiles")
    .update(updateData)
    .eq("id", targetUserId)
    .select("id")
    .single();

  if (error) return adminActionFailure("change-member-role", "修改角色失败，请稍后重试", error);
  if (!isProfileWriteApplied(updatedProfile)) return { error: "角色更新未生效，请刷新后重试" };

  const { data: rereadProfile, error: rereadError } = await adminSupabase
    .from("profiles")
    .select("id, role, company_role")
    .eq("id", targetUserId)
    .single();
  if (rereadError || !rereadProfile) {
    return adminActionFailure("reread-member-role", "角色更新复读失败，请刷新后重试", rereadError);
  }
  const rereadRole = resolveProfileCompanyRole(rereadProfile.role, rereadProfile.company_role);
  if (
    rereadRole.conflict
    || rereadProfile.role !== newRole
    || rereadProfile.company_role !== newRole
    || rereadRole.companyRole !== newRole
  ) {
    return { error: "角色更新复读校验失败，请刷新后重试" };
  }

  const audit = await recordAdminAudit({
    supabase,
    userId: perm.userId,
    action: "change_role",
    target: targetUserId,
    detail: `${target.name}: ${target.role} → ${newRole}`,
  });
  if (!audit.ok) {
    // 角色变更可回滚：把 role / company_role 写回读到的原值
    // （读入时已确认两列一致，不涉及冲突值）。
    const rollback = await adminSupabase
      .from("profiles")
      .update({ role: target.role, company_role: target.company_role })
      .eq("id", targetUserId)
      .select("id");
    const rolledBack = !rollback.error && (rollback.data?.length ?? 0) > 0;
    return { error: rolledBack ? auditRollbackMessage("修改角色") : auditRollbackIncompleteMessage("修改角色") };
  }

  revalidatePath("/admin");
  return {};
}
