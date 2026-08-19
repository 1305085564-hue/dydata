"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { hasExemptionManagementPermission } from "@/lib/exemption-permissions";
import { getTeamMeta, getTeamOptions } from "@/lib/teams";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import {
  formatExemptionDetail,
  type ExemptionFormValues,
} from "@/lib/豁免";
import {
  buildGrantDraft,
  buildRequestDraft,
  isMissingExemptionRequestCategoryError,
  stripExemptionCategoryFromRequestDraft,
  type AnyGrantMode,
  type GrantMode,
  type ReviewDecision,
} from "@/lib/豁免流程";

import {
  applyExemptionGrantAtomically,
  clearExemptionGrantAtomically,
  reviewExemptionRequestAtomically,
} from "@/lib/exemption-review";
import type { DataScope, Permissions, UserRole } from "@/types";
import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import { buildCompanyRoleProfilePatch } from "@/lib/company-permissions";
import {
  archiveMemberWithClient,
  removeMemberFromTeamWithClient,
  restoreMemberWithClient,
  transferMemberToTeamWithClient,
} from "@/lib/member-lifecycle-service";
import {
  canChangeMemberRole,
  canRemoveMemberTarget,
  isProfileWriteApplied,
  resolvePermissionUpdate,
  resolveMemberTeamTransfer,
} from "./权限管理";

const SAFE_EXEMPTION_REQUEST_INPUT_ERRORS = new Set([
  "多日豁免必须填写开始和结束日期",
  "开始日期不能晚于结束日期",
  "豁免至少选择1天",
  "永久豁免必须填写原因",
]);

function hasActiveScopeAccess(
  scope: Awaited<ReturnType<typeof buildDataAccessScope>> | null,
  userId: string,
) {
  if (!scope) return false;
  const activeVisibleUserIds = scope.activeVisibleUserIds ?? scope.visibleUserIds;
  return activeVisibleUserIds.includes(userId);
}

async function writeAuditLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: string,
  target: string,
  detail?: string
) {
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    target,
    detail: detail ?? null,
  }).then(() => {}, () => {});
}

async function getProfileTeamId(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const adminSupabase = createAdminClient();
  const profileResult = await adminSupabase
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profileResult.error && profileResult.data) {
    return profileResult.data.team_id ?? null;
  }

  const { data, error } = await adminSupabase.auth.admin.getUserById(userId);
  if (error) {
    throw new Error(error.message);
  }

  return getTeamMeta(data.user?.user_metadata).teamId;
}

function isMissingProfileTeamColumnError(error: { message?: string } | null | undefined) {
  return Boolean(
    error?.message &&
      (error.message.includes("profiles.team_id") ||
        error.message.includes("column profiles.team_id does not exist") ||
        error.message.includes("Could not find the 'team_id' column of 'profiles'")),
  );
}

async function applyGrantToProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    userId: string;
    mode: AnyGrantMode;
    category?: "waive" | "leave" | null;
    reason?: string | null;
    requestId: string | null;
    groupModeTokenHash?: string;
    today?: string;
    startDate?: string | null;
    endDate?: string | null;
    replaceExisting?: boolean;
  }
) {
  const draft = buildGrantDraft({
    ...input,
    teamId: null,
    today: input.today ?? formatShanghaiDateOnly(),
  });

  const shouldReplaceExisting =
    input.replaceExisting === true || draft.profile.exempt_type === "permanent";
  const result = await applyExemptionGrantAtomically({
    supabase,
    draft,
    replaceExisting: shouldReplaceExisting,
    groupModeTokenHash: input.groupModeTokenHash,
  });
  return result.ok ? {} : { error: result.message };
}

export async function updateExemption(values: ExemptionFormValues): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasExemptionManagementPermission(perm.role, perm.permissions)) return { error: "无权限" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const scope = await buildDataAccessScope(adminSupabase, perm.userId, {
    profile: {
      id: perm.userId,
      role: perm.role,
      permissions: perm.permissions,
      data_scope: perm.dataScope,
      team_id: perm.teamId ?? null,
      company_role: perm.companyRole,
      group_mode: perm.groupMode,
      group_mode_token_hash: perm.groupModeTokenHash,
    },
  });
  if (!scope) return { error: "用户信息不存在" };

  const { data: target, error: targetError } = await adminSupabase
    .from("profiles")
    .select("id, membership_status")
    .eq("id", values.userId)
    .maybeSingle();
  if (targetError) return { error: targetError.message };
  if (!target) return { error: "用户不存在" };
  if (target.membership_status === "archived") return { error: "已归档账号不能修改豁免，请先恢复账号" };
  if (!hasActiveScopeAccess(scope, values.userId)) {
    return { error: "不能操作已归档或当前管理范围外的成员" };
  }

  try {
    if (values.mode === "none") {
      const result = await clearExemptionGrantAtomically({
        supabase,
        userId: values.userId,
        groupModeTokenHash: perm.groupModeTokenHash,
      });
      if (!result.ok) return { error: result.message };
      await writeAuditLog(supabase, perm.userId, "clear_exempt", values.userId, "清除豁免");
      revalidatePath("/admin");
      revalidatePath("/admin/modules");
      revalidatePath("/dashboard");
      return {};
    }

    const mode: GrantMode = values.mode === "permanent" ? "permanent" : values.mode === "yesterday" ? "yesterday" : "range";

    const result = await applyGrantToProfile(supabase, {
      userId: values.userId,
      mode,
      reason: values.reason,
      category: values.category,
      requestId: null,
      today: formatShanghaiDateOnly(),
      startDate: values.mode === "range" ? values.startDate ?? null : values.date ?? null,
      endDate: values.mode === "range" ? values.endDate ?? null : values.date ?? null,
      replaceExisting: true,
      groupModeTokenHash: perm.groupModeTokenHash,
    });

    if (result.error) {
      return result;
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "豁免设置失败",
    };
  }

  await writeAuditLog(
    supabase,
    perm.userId,
    "set_exempt",
    values.userId,
    formatExemptionDetail(values)
  );

  revalidatePath("/admin");
  revalidatePath("/admin/modules");
  revalidatePath("/dashboard");
  return {};
}

export async function clearExemption(userId: string): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasExemptionManagementPermission(perm.role, perm.permissions)) return { error: "无权限" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const scope = await buildDataAccessScope(adminSupabase, perm.userId, {
    profile: {
      id: perm.userId,
      role: perm.role,
      permissions: perm.permissions,
      data_scope: perm.dataScope,
      team_id: perm.teamId ?? null,
      company_role: perm.companyRole,
      group_mode: perm.groupMode,
      group_mode_token_hash: perm.groupModeTokenHash,
    },
  });
  if (!scope) return { error: "用户信息不存在" };

  const { data: target, error: targetError } = await adminSupabase
    .from("profiles")
    .select("id, membership_status")
    .eq("id", userId)
    .maybeSingle();
  if (targetError) return { error: targetError.message };
  if (!target) return { error: "用户不存在" };
  if (target.membership_status === "archived") return { error: "已归档账号不能修改豁免，请先恢复账号" };
  if (!hasActiveScopeAccess(scope, userId)) {
    return { error: "不能操作已归档或当前管理范围外的成员" };
  }

  const result = await clearExemptionGrantAtomically({
    supabase,
    userId,
    groupModeTokenHash: perm.groupModeTokenHash,
  });
  if (!result.ok) return { error: result.message };

  await writeAuditLog(supabase, perm.userId, "clear_exempt", userId, "清除豁免");

  revalidatePath("/admin");
  revalidatePath("/admin/modules");
  revalidatePath("/dashboard");
  return {};
}

export async function submitExemptionRequest(input: {
  mode: GrantMode;
  category: "waive" | "leave";
  reason?: string | null;
  startDate?: string;
  endDate?: string;
}): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };

  const supabase = await createClient();
  const teamId = await getProfileTeamId(supabase, perm.userId);

  let draft: ReturnType<typeof buildRequestDraft>;
  try {
    draft = buildRequestDraft({
      applicantUserId: perm.userId,
      teamId,
      mode: input.mode,
      category: input.category,
      reason: input.reason,
      today: formatShanghaiDateOnly(),
      startDate: input.startDate,
      endDate: input.endDate,
    });
  } catch (error) {
    const message = error instanceof Error && SAFE_EXEMPTION_REQUEST_INPUT_ERRORS.has(error.message)
      ? error.message
      : "提交申请失败";
    if (message === "提交申请失败") {
      console.error("[exemptions] failed to build admin request", error);
    }
    return {
      error: message,
    };
  }

  try {
    const { error } = await supabase.from("exemption_request").insert(draft);
    if (error) {
      if (!isMissingExemptionRequestCategoryError(error)) {
        console.error("[exemptions] failed to submit admin request", error);
        return { error: "提交豁免申请失败" };
      }

      const fallback = await supabase
        .from("exemption_request")
        .insert(stripExemptionCategoryFromRequestDraft(draft));

      if (fallback.error) {
        console.error("[exemptions] failed to submit legacy admin request", fallback.error);
        return { error: "提交豁免申请失败" };
      }
    }
  } catch (error) {
    console.error("[exemptions] admin request threw", error);
    return { error: "提交豁免申请失败" };
  }

  await writeAuditLog(
    supabase,
    perm.userId,
    "submit_exemption_request",
    perm.userId,
    `${input.category}|${input.mode}|${input.reason ?? ""}`,
  );
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return {};
}

export async function reviewExemptionRequest(input: {
  requestId: string;
  decision: ReviewDecision;
}): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasExemptionManagementPermission(perm.role, perm.permissions)) return { error: "无权限" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const scope = await buildDataAccessScope(adminSupabase, perm.userId, {
    profile: {
      id: perm.userId,
      role: perm.role,
      permissions: perm.permissions,
      data_scope: perm.dataScope,
      team_id: perm.teamId ?? null,
      company_role: perm.companyRole,
      group_mode: perm.groupMode,
      group_mode_token_hash: perm.groupModeTokenHash,
    },
  });
  if (!scope) return { error: "用户信息不存在" };

  const { data: requestRow, error: requestError } = await adminSupabase
    .from("exemption_request")
    .select("id, applicant_user_id, request_status")
    .eq("id", input.requestId)
    .maybeSingle();
  if (requestError) return { error: requestError.message };
  if (!requestRow) return { error: "豁免申请不存在" };
  if (!hasActiveScopeAccess(scope, requestRow.applicant_user_id)) {
    return { error: "不能操作已归档或当前管理范围外的成员" };
  }

  const result = await reviewExemptionRequestAtomically({
    supabase,
    requestId: input.requestId,
    decision: input.decision,
    groupModeTokenHash: perm.groupModeTokenHash,
  });
  if (!result.ok) return { error: result.message };

  await writeAuditLog(
    supabase,
    perm.userId,
    input.decision === "approved" ? "approve_exemption_request" : "reject_exemption_request",
    input.requestId,
    input.decision,
  );

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return {};
}

export async function adminUpdateReport(
  reportId: string,
  data: {
    title: string;
    play_count: number;
    completion_rate: string | null;
    avg_play_duration: string | null;
    bounce_rate_2s: string | null;
    completion_rate_5s: string | null;
    likes: number;
    comments: number;
    shares: number;
    favorites: number;
    follower_gain: number;
    follower_convert: number | null;
  }
): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "review_content")) return { error: "无权限" };

  const supabase = await createClient();
  const { error } = await supabase.from("daily_reports").update(data).eq("id", reportId);

  if (error) return { error: error.message };

  await writeAuditLog(supabase, perm.userId, "update_report", reportId, JSON.stringify(data));

  revalidatePath("/admin");
  return {};
}

export async function adminDeleteReport(reportId: string): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "review_content")) return { error: "无权限" };

  const supabase = await createClient();

  const { data: report } = await supabase.from("daily_reports").select("submitter, report_date, title").eq("id", reportId).single();

  const { error } = await supabase.from("daily_reports").delete().eq("id", reportId);

  if (error) return { error: error.message };

  await writeAuditLog(supabase, perm.userId, "delete_report", reportId, report ? `${report.submitter} ${report.report_date} ${report.title}` : reportId);

  revalidatePath("/admin");
  return {};
}

export async function updatePermissions(
  targetUserId: string,
  newPermissions: Permissions,
  newDataScope?: DataScope
): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: target, error: targetError } = await adminSupabase
    .from("profiles")
    .select("role, company_role, permissions, team_id, membership_status")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetError) return { error: targetError.message };
  if (!target) return { error: "用户不存在" };
  if (target.membership_status === "archived") return { error: "已归档账号不能修改权限，请先恢复账号" };

  const decision = resolvePermissionUpdate({
    actorRole: perm.role,
    actorId: perm.userId,
    actorPermissions: perm.permissions,
    actorTeamId: perm.teamId,
    groupMode: perm.groupMode,
    targetId: targetUserId,
    targetRole: target.company_role === "company_owner" ? "owner" : target.role as UserRole,
    targetPermissions: (target.permissions ?? {}) as Permissions,
    targetTeamId: target.team_id ?? null,
    newPermissions,
    newDataScope,
  });
  if (decision.error) return { error: decision.error };

  const updatePayload: Record<string, unknown> = {
    permissions: decision.permissions,
  };
  if (decision.dataScope !== undefined) {
    updatePayload.data_scope = decision.dataScope;
  }

  const { data: updatedProfile, error } = await adminSupabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", targetUserId)
    .select("id")
    .single();

  if (error) return { error: error.message };
  if (!isProfileWriteApplied(updatedProfile)) return { error: "权限更新未生效，请刷新后重试" };

  await writeAuditLog(
    supabase,
    perm.userId,
    "update_permissions",
    targetUserId,
    JSON.stringify({ permissions: newPermissions, data_scope: newDataScope })
  );

  revalidatePath("/admin");
  return {};
}

async function getTeamNameMap(
  adminSupabase: ReturnType<typeof createAdminClient>,
  teamIds: Array<string | null | undefined>,
) {
  const ids = Array.from(new Set(teamIds.filter((teamId): teamId is string => Boolean(teamId))));
  if (ids.length === 0) return new Map<string, string>();

  const { data, error } = await adminSupabase
    .from("teams")
    .select("id, name")
    .in("id", ids);
  if (error) return new Map<string, string>();

  return new Map((data ?? []).map((team) => [team.id as string, team.name as string]));
}

function formatTeamName(teamId: string | null, teamNames: Map<string, string>) {
  if (!teamId) return "未分配";
  return teamNames.get(teamId) ?? teamId;
}

export async function updateMemberTeam(
  targetUserId: string,
  newTeamId: string | null,
): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: profileRows, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, role, company_role, name, permissions, team_id, membership_status")
    .in("id", [perm.userId, targetUserId]);
  if (profileError) return { error: profileError.message };

  const actor = profileRows?.find((profile) => profile.id === perm.userId);
  const target = profileRows?.find((profile) => profile.id === targetUserId);
  if (!target) return { error: "用户不存在" };

  const decision = resolveMemberTeamTransfer({
    actorRole: perm.role,
    actorId: perm.userId,
    actorPermissions: perm.permissions,
    actorTeamId: actor?.team_id ?? null,
    groupMode: perm.groupMode,
    targetId: targetUserId,
    targetRole: target.company_role === "company_owner" ? "owner" : target.role as UserRole,
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
      actor: {
        id: perm.userId,
        role: perm.role,
        permissions: perm.permissions,
        teamId: perm.teamId,
        groupMode: perm.groupMode,
      },
      targetId: targetUserId,
    });
    if (!result.ok) return { error: result.error };

    if (result.changed) {
      await writeAuditLog(
        supabase,
        perm.userId,
        "remove_from_team",
        targetUserId,
        `将 ${target.name} 移出团队，账号仍可登录，数据保留`,
      );
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
    actor: {
      id: perm.userId,
      role: perm.role,
      permissions: perm.permissions,
      teamId: perm.teamId,
      groupMode: perm.groupMode,
    },
    targetId: targetUserId,
    newTeamId,
    newTeamName,
  });
  if (!result.ok) return { error: result.error };

  await writeAuditLog(
    supabase,
    perm.userId,
    "transfer_team",
    targetUserId,
    `将 ${target.name} 从 ${oldTeamName} 调配至 ${newTeamName}`,
  );

  revalidatePath("/admin");
  revalidatePath("/admin/modules");
  return {};
}

export async function removeMemberFromTeam(
  targetUserId: string,
): Promise<{ error?: string }> {
  return updateMemberTeam(targetUserId, null);
}

export async function archiveMember(
  targetUserId: string,
  reason: string,
): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };
  if (targetUserId === perm.userId) return { error: "不能归档自己" };
  if (!reason?.trim()) return { error: "归档必须填写原因" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const result = await archiveMemberWithClient({
    client: adminSupabase,
    actor: {
      id: perm.userId,
      role: perm.role,
      permissions: perm.permissions,
      teamId: perm.teamId,
      groupMode: perm.groupMode,
    },
    targetId: targetUserId,
    reason,
    archivedAt: new Date().toISOString(),
  });
  if (!result.ok) return { error: result.error };

  if (result.changed) {
    await writeAuditLog(
      supabase,
      perm.userId,
      "archive_member",
      targetUserId,
      `归档成员：${result.target.name ?? targetUserId}；原因：${reason.trim()}`,
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/modules");
  return {};
}

export async function restoreMember(targetUserId: string): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };
  if (targetUserId === perm.userId) return { error: "不能恢复自己" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const result = await restoreMemberWithClient({
    client: adminSupabase,
    actor: {
      id: perm.userId,
      role: perm.role,
      permissions: perm.permissions,
      teamId: perm.teamId,
      groupMode: perm.groupMode,
    },
    targetId: targetUserId,
  });
  if (!result.ok) return { error: result.error };

  if (result.changed) {
    await writeAuditLog(
      supabase,
      perm.userId,
      "restore_member",
      targetUserId,
      `恢复成员：${result.target.name ?? targetUserId}；恢复后未分配团队、普通成员、空权限`,
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/modules");
  return {};
}

export async function resetMemberPassword(
  targetUserId: string,
  newPassword: string
): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };
  if (targetUserId === perm.userId) return { error: "不能重置自己的密码" };

  const normalizedPassword = newPassword.trim();
  if (normalizedPassword.length < 6) return { error: "密码至少需要 6 位。" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const { data: profileRows, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, role, company_role, name, permissions, team_id, membership_status")
    .in("id", [perm.userId, targetUserId]);
  if (profileError) return { error: profileError.message };

  const actor = profileRows?.find((profile) => profile.id === perm.userId);
  const target = profileRows?.find((profile) => profile.id === targetUserId);
  if (!target) return { error: "用户不存在" };
  if (target.membership_status === "archived") return { error: "已归档账号不能重置密码，请先恢复账号" };
  if (!canRemoveMemberTarget({
    actorRole: perm.role,
    actorId: perm.userId,
    actorPermissions: perm.permissions,
    actorTeamId: actor?.team_id ?? null,
    groupMode: perm.groupMode,
    targetId: targetUserId,
    targetRole: target.company_role === "company_owner" ? "owner" : target.role as UserRole,
    targetPermissions: (target.permissions ?? {}) as Permissions,
    targetTeamId: target.team_id ?? null,
  })) {
    return { error: perm.role === "admin" ? "负责人只能重置本团队组员密码" : "不能重置该用户密码" };
  }

  const { error } = await adminSupabase.auth.admin.updateUserById(targetUserId, {
    password: normalizedPassword,
  });
  if (error) return { error: error.message };

  await writeAuditLog(supabase, perm.userId, "reset_member_password", targetUserId, `重置密码: ${target.name}`);

  revalidatePath("/admin");
  return {};
}

export async function changeRole(
  targetUserId: string,
  newRole: "member" | "admin"
): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };

  if (targetUserId === perm.userId) return { error: "不能修改自己的角色" };

  if (newRole !== "member" && newRole !== "admin") return { error: "无效角色" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: profileRows, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, role, company_role, name, permissions, team_id, membership_status")
    .in("id", [perm.userId, targetUserId]);
  if (profileError) return { error: profileError.message };

  const actor = profileRows?.find((profile) => profile.id === perm.userId);
  const target = profileRows?.find((profile) => profile.id === targetUserId);
  if (!target) return { error: "用户不存在" };
  if (target.membership_status === "archived") return { error: "已归档账号不能修改角色，请先恢复账号" };
  if (target.company_role === "company_owner" || target.role === "owner") {
    return { error: "不能修改其他公司所有者" };
  }

  if (
    !canChangeMemberRole({
      actorRole: perm.role,
      actorId: perm.userId,
      actorPermissions: perm.permissions,
      actorTeamId: actor?.team_id ?? null,
      groupMode: perm.groupMode,
      targetId: targetUserId,
      targetRole: target.company_role === "company_owner" ? "owner" : target.role as UserRole,
      targetPermissions: (target.permissions ?? {}) as Permissions,
      targetTeamId: target.team_id ?? null,
      newRole,
    })
  ) {
    return { error: perm.role === "owner" ? "不能修改该用户角色" : "负责人只能调整本团队组员和组长" };
  }

  const updateData = buildCompanyRoleProfilePatch(newRole);

  const { data: updatedProfile, error } = await adminSupabase
    .from("profiles")
    .update(updateData)
    .eq("id", targetUserId)
    .select("id")
    .single();

  if (error) return { error: error.message };
  if (!isProfileWriteApplied(updatedProfile)) return { error: "角色更新未生效，请刷新后重试" };

  await writeAuditLog(supabase, perm.userId, "change_role", targetUserId, `${target.name}: ${target.role} → ${newRole}`);

  revalidatePath("/admin");
  return {};
}

export async function createTeam(teamName: string): Promise<{ error?: string; team?: { id: string; name: string } }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };

  const normalizedName = teamName.trim();
  if (!normalizedName) return { error: "请输入团队名称" };

  const teams = await getTeamOptions();
  if (teams.some((team) => team.name === normalizedName)) {
    return { error: "团队名称已存在" };
  }

  const adminSupabase = createAdminClient();
  const { data: createdTeam, error } = await adminSupabase
    .from("teams")
    .insert({
      name: normalizedName,
    })
    .select("id, name")
    .single();
  if (error) return { error: error.message };

  const supabase = await createClient();
  await writeAuditLog(supabase, perm.userId, "create_team", normalizedName, normalizedName);

  revalidatePath("/admin");
  revalidatePath("/register");
  return {
    team: createdTeam
      ? {
          id: createdTeam.id,
          name: createdTeam.name ?? normalizedName,
        }
      : undefined,
  };
}

export async function deleteTeam(teamId: string): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };

  const adminSupabase = createAdminClient();

  // Check if team has members
  const { data: members, error: membersError } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("team_id", teamId)
    .limit(1);
  if (membersError) return { error: membersError.message };
  if (members && members.length > 0) return { error: "该团队下还有成员，无法删除" };

  const { data: team } = await adminSupabase.from("teams").select("name").eq("id", teamId).single();

  const { error } = await adminSupabase.from("teams").delete().eq("id", teamId);
  if (error) return { error: error.message };

  const supabase = await createClient();
  await writeAuditLog(supabase, perm.userId, "delete_team", teamId, team?.name ?? teamId);

  revalidatePath("/admin");
  revalidatePath("/register");
  return {};
}
