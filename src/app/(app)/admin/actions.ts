"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTeamMeta, getTeamOptions } from "@/lib/teams";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import {
  canAccessTeam,
  canAssignMemberToGroup,
  canManageGroup,
  canUseLeaderCandidate,
  resolveTeamManagementAccess,
  type TeamManagementGroup,
  type TeamManagementProfile,
} from "@/lib/team-management";
import {
  formatExemptionDetail,
  type ExemptionFormValues,
} from "@/lib/豁免";
import {
  buildGrantDraft,
  buildRequestDraft,
  buildReviewPatch,
  isMissingExemptionRequestCategoryError,
  normalizeGrantMode,
  stripExemptionCategoryFromRequestDraft,
  type AnyGrantMode,
  type GrantMode,
  type ReviewDecision,
} from "@/lib/豁免流程";
import type { Permissions, UserRole } from "@/types";
import {
  buildMemberTeamTransferPatch,
  canChangeMemberRole,
  canRemoveMemberTarget,
  isProfileWriteApplied,
  resolvePermissionUpdate,
  resolveMemberTeamTransfer,
} from "./权限管理";

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
        error.message.includes("profiles.group_id") ||
        error.message.includes("column profiles.team_id does not exist") ||
        error.message.includes("column profiles.group_id does not exist") ||
        error.message.includes("Could not find the 'team_id' column of 'profiles'") ||
        error.message.includes("Could not find the 'group_id' column of 'profiles'")),
  );
}

async function loadTeamManagementContext(perm: { userId: string; role: UserRole; permissions: Permissions }) {
  const adminSupabase = createAdminClient();
  const [profilesResult, fallbackProfilesResult, groupsResult] = await Promise.all([
    adminSupabase
      .from("profiles")
      .select("id, name, role, status, permissions, team_id, group_id")
      .order("created_at", { ascending: true }),
    adminSupabase
      .from("profiles")
      .select("id, name, role, status, permissions")
      .order("created_at", { ascending: true }),
    adminSupabase
      .from("groups")
      .select("id, name, team_id, leader_user_id")
      .order("name", { ascending: true }),
  ]);

  if (profilesResult.error && !isMissingProfileTeamColumnError(profilesResult.error)) {
    throw new Error(profilesResult.error.message);
  }
  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }

  const rawProfiles = profilesResult.error ? fallbackProfilesResult.data ?? [] : profilesResult.data ?? [];
  const authUsersResult = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authUserById = new Map((authUsersResult.data?.users ?? []).map((authUser) => [authUser.id, authUser]));
  const teams = await getTeamOptions();
  const teamIdByName = new Map(teams.map((team) => [team.name, team.id]));
  const profiles = (rawProfiles as TeamManagementProfile[]).map((profile) => {
    const metadata = authUserById.get(profile.id)?.user_metadata ?? {};
    const metadataTeamId = typeof metadata.team_id === "string" ? metadata.team_id : null;
    const metadataTeamName = typeof metadata.team_name === "string" ? metadata.team_name : null;
    const fallbackTeamId = metadataTeamId ?? (metadataTeamName ? teamIdByName.get(metadataTeamName) ?? null : null);

    return {
      ...profile,
      role: profile.role as UserRole,
      permissions: (profile.permissions ?? {}) as Permissions,
      team_id: profile.team_id ?? fallbackTeamId ?? null,
      group_id: profile.group_id ?? null,
      email: authUserById.get(profile.id)?.email ?? null,
    };
  });
  const groups = ((groupsResult.data ?? []) as TeamManagementGroup[]).map((group) => ({
    id: group.id,
    name: group.name,
    team_id: group.team_id ?? null,
    leader_user_id: group.leader_user_id ?? null,
  }));
  const actor =
    profiles.find((profile) => profile.id === perm.userId) ??
    ({
      id: perm.userId,
      name: "",
      role: perm.role,
      permissions: perm.permissions,
      team_id: null,
      group_id: null,
    } satisfies TeamManagementProfile);

  return {
    adminSupabase,
    profiles,
    groups,
    access: resolveTeamManagementAccess(actor, groups),
  };
}

async function syncProfileExemptionProjection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  fields: {
    status: "active" | "exempt";
    exempt_type: "permanent" | "temporary" | null;
    exempt_start_date: string | null;
    exempt_end_date: string | null;
    exempt_reason: string | null;
    exemption_category?: "waive" | "leave" | null;
  }
) {
  return supabase
    .from("profiles")
    .update({
      status: fields.status,
      exempt_type: fields.exempt_type,
      exempt_start_date: fields.exempt_start_date,
      exempt_end_date: fields.exempt_end_date,
      exempt_reason: fields.exempt_reason,
      exemption_category: fields.exemption_category ?? null,
    })
    .eq("id", userId);
}

function isMissingProfileExemptionCategoryError(error: { message?: string } | null | undefined) {
  return Boolean(
    error?.message &&
      (error.message.includes("profiles.exemption_category") ||
        error.message.includes("column profiles.exemption_category does not exist") ||
        error.message.includes("Could not find the 'exemption_category' column of 'profiles'")),
  );
}

async function syncProfileExemptionProjectionCompat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  fields: {
    status: "active" | "exempt";
    exempt_type: "permanent" | "temporary" | null;
    exempt_start_date: string | null;
    exempt_end_date: string | null;
    exempt_reason: string | null;
    exemption_category?: "waive" | "leave" | null;
  }
) {
  const primary = await syncProfileExemptionProjection(supabase, userId, fields);

  if (!isMissingProfileExemptionCategoryError(primary.error)) {
    return primary;
  }

  return supabase
    .from("profiles")
    .update({
      status: fields.status,
      exempt_type: fields.exempt_type,
      exempt_start_date: fields.exempt_start_date,
      exempt_end_date: fields.exempt_end_date,
      exempt_reason: fields.exempt_reason,
    })
    .eq("id", userId);
}

async function deactivateExistingGrants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  // exemption_grant 表可能未建，失败不阻断主流程
  await supabase
    .from("exemption_grant")
    .update({ status: "inactive" })
    .eq("user_id", userId)
    .eq("status", "active")
    .then(() => {}, () => {});
}

async function fetchExemptionRequestForReview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestId: string
) {
  const primary = await supabase
    .from("exemption_request")
    .select("id, applicant_user_id, exemption_type, exemption_category, start_date, end_date, reason, request_status")
    .eq("id", requestId)
    .single();

  if (!isMissingExemptionRequestCategoryError(primary.error)) {
    return primary;
  }

  const fallback = await supabase
    .from("exemption_request")
    .select("id, applicant_user_id, exemption_type, start_date, end_date, reason, request_status")
    .eq("id", requestId)
    .single();

  return {
    data: fallback.data
      ? {
          ...fallback.data,
          exemption_category: "waive" as const,
        }
      : null,
    error: fallback.error,
  };
}

async function applyGrantToProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    userId: string;
    teamId: string | null;
    mode: AnyGrantMode;
    category?: "waive" | "leave" | null;
    reason?: string | null;
    requestId: string | null;
    today?: string;
    startDate?: string | null;
    endDate?: string | null;
    replaceExisting?: boolean;
  }
) {
  const draft = buildGrantDraft({
    ...input,
    today: input.today ?? new Date().toISOString().slice(0, 10),
  });

  const shouldReplaceExisting =
    input.replaceExisting === true || draft.profile.exempt_type === "permanent";

  if (shouldReplaceExisting) {
    await deactivateExistingGrants(supabase, input.userId);
  }

  // exemption_grant 表可能未建，insert 失败不阻断（profiles 才是关键）
  await supabase.from("exemption_grant").insert(draft.grant).then(() => {}, () => {});

  const { error: profileError } = await syncProfileExemptionProjectionCompat(
    supabase,
    input.userId,
    draft.profile,
  );
  if (profileError) {
    return { error: profileError.message };
  }

  return { error: undefined };
}

export async function updateExemption(values: ExemptionFormValues): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };

  const supabase = await createClient();

  try {
    if (values.mode === "none") {
      const { error: profileError } = await syncProfileExemptionProjectionCompat(supabase, values.userId, {
        status: "active",
        exempt_type: null,
        exempt_start_date: null,
        exempt_end_date: null,
        exempt_reason: null,
        exemption_category: null,
      });

      if (profileError) {
        return { error: profileError.message };
      }

      await deactivateExistingGrants(supabase, values.userId);
      await writeAuditLog(supabase, perm.userId, "clear_exempt", values.userId, "清除豁免");
      revalidatePath("/admin");
      revalidatePath("/admin/modules");
      revalidatePath("/dashboard");
      return {};
    }

    const teamId = await getProfileTeamId(supabase, values.userId);
    const mode: GrantMode = values.mode === "permanent" ? "permanent" : values.mode === "yesterday" ? "yesterday" : "range";

    const result = await applyGrantToProfile(supabase, {
      userId: values.userId,
      teamId,
      mode,
      reason: values.reason,
      category: values.category,
      requestId: null,
      today: new Date().toISOString().slice(0, 10),
      startDate: values.mode === "range" ? values.startDate ?? null : values.date ?? null,
      endDate: values.mode === "range" ? values.endDate ?? null : values.date ?? null,
      replaceExisting: true,
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
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };

  const supabase = await createClient();

  await deactivateExistingGrants(supabase, userId);

  const { error } = await syncProfileExemptionProjectionCompat(supabase, userId, {
    status: "active",
    exempt_type: null,
    exempt_start_date: null,
    exempt_end_date: null,
    exempt_reason: null,
    exemption_category: null,
  });

  if (error) {
    return { error: error.message };
  }

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

  try {
    const draft = buildRequestDraft({
      applicantUserId: perm.userId,
      teamId,
      mode: input.mode,
      category: input.category,
      reason: input.reason,
      today: new Date().toISOString().slice(0, 10),
      startDate: input.startDate,
      endDate: input.endDate,
    });

    const { error } = await supabase.from("exemption_request").insert(draft);
    if (error) {
      if (!isMissingExemptionRequestCategoryError(error)) {
        return { error: error.message };
      }

      const fallback = await supabase
        .from("exemption_request")
        .insert(stripExemptionCategoryFromRequestDraft(draft));

      if (fallback.error) {
        return { error: fallback.error.message };
      }
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "提交申请失败",
    };
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
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };

  const supabase = await createClient();

  const { data: request, error: fetchError } = await fetchExemptionRequestForReview(supabase, input.requestId);

  if (fetchError || !request) return { error: "申请不存在" };
  if (request.request_status !== "pending") return { error: "该申请已处理" };

  if (input.decision === "approved") {
    const teamId = await getProfileTeamId(supabase, request.applicant_user_id);
    const result = await applyGrantToProfile(supabase, {
      userId: request.applicant_user_id,
      teamId,
      mode: normalizeGrantMode(request.exemption_type as AnyGrantMode),
      category: request.exemption_category,
      reason: request.reason,
      requestId: request.id,
      today: new Date().toISOString().slice(0, 10),
      startDate: request.start_date,
      endDate: request.end_date,
      replaceExisting: false,
    });

    if (result.error) {
      return result;
    }
  }

  const patch = buildReviewPatch({ reviewerId: perm.userId, decision: input.decision });

  const { error: requestError } = await supabase
    .from("exemption_request")
    .update(patch)
    .eq("id", input.requestId);

  if (requestError) {
    return { error: requestError.message };
  }

  await writeAuditLog(
    supabase,
    perm.userId,
    input.decision === "approved" ? "approve_exemption_request" : "reject_exemption_request",
    input.requestId,
    `${request.applicant_user_id}|${request.exemption_category}|${request.exemption_type}`
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
  if (!hasPermission(perm.role, perm.permissions, "edit_data")) return { error: "无权限" };

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
  if (!hasPermission(perm.role, perm.permissions, "edit_data")) return { error: "无权限" };

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
  newPermissions: Permissions
): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: target, error: targetError } = await adminSupabase
    .from("profiles")
    .select("role, team_id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetError) return { error: targetError.message };
  if (!target) return { error: "用户不存在" };

  const decision = resolvePermissionUpdate({
    actorRole: perm.role,
    actorBusinessRole: perm.businessRole,
    actorId: perm.userId,
    actorTeamId: perm.teamId,
    targetId: targetUserId,
    targetRole: target.role as UserRole,
    targetTeamId: target.team_id ?? null,
    newPermissions,
  });
  if (decision.error) return { error: decision.error };

  const { data: updatedProfile, error } = await adminSupabase
    .from("profiles")
    .update({ permissions: decision.permissions })
    .eq("id", targetUserId)
    .select("id")
    .single();

  if (error) return { error: error.message };
  if (!isProfileWriteApplied(updatedProfile)) return { error: "权限更新未生效，请刷新后重试" };

  await writeAuditLog(supabase, perm.userId, "update_permissions", targetUserId, JSON.stringify(newPermissions));

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
    .select("id, role, name, permissions, team_id, group_id")
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
    targetId: targetUserId,
    targetRole: target.role as UserRole,
    targetTeamId: target.team_id ?? null,
    newTeamId,
  });

  if (decision.error) return { error: decision.error };
  if (!decision.shouldApply) return {};

  const oldTeamId = target.team_id ?? null;
  const { data: updatedProfile, error } = await adminSupabase
    .from("profiles")
    .update(buildMemberTeamTransferPatch(newTeamId))
    .eq("id", targetUserId)
    .select("id")
    .single();

  if (error) return { error: error.message };
  if (!isProfileWriteApplied(updatedProfile)) return { error: "团队调配未生效，请刷新后重试" };

  const teamNames = await getTeamNameMap(adminSupabase, [oldTeamId, newTeamId]);
  const oldTeamName = formatTeamName(oldTeamId, teamNames);
  const newTeamName = formatTeamName(newTeamId, teamNames);

  await adminSupabase.from("member_change_log").insert({
    user_id: targetUserId,
    team_id: newTeamId,
    action_type: "transfer_team",
    operator_id: perm.userId,
  }).then(() => {}, () => {});

  await writeAuditLog(
    supabase,
    perm.userId,
    "transfer_team",
    targetUserId,
    `将 ${target.name} 从 ${oldTeamName} 调配至 ${newTeamName}`,
  );

  revalidatePath("/admin");
  return {};
}

export async function removeMemberFromTeam(
  targetUserId: string,
): Promise<{ error?: string }> {
  return updateMemberTeam(targetUserId, null);
}

export async function removeMember(targetUserId: string): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };
  if (targetUserId === perm.userId) return { error: "不能移除自己" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: profileRows, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, role, name, permissions, team_id")
    .in("id", [perm.userId, targetUserId]);
  if (profileError) return { error: profileError.message };

  const actor = profileRows?.find((profile) => profile.id === perm.userId);
  const target = profileRows?.find((profile) => profile.id === targetUserId);
  if (!target) return { error: "用户不存在" };
  if (!canRemoveMemberTarget({
    actorRole: perm.role,
    actorId: perm.userId,
    actorPermissions: perm.permissions,
    actorTeamId: actor?.team_id ?? null,
    targetId: targetUserId,
    targetRole: target.role as UserRole,
    targetPermissions: (target.permissions ?? {}) as Permissions,
    targetTeamId: target.team_id ?? null,
  })) {
    return { error: perm.role === "admin" ? "负责人只能移除本团队组员" : "不能移除该用户" };
  }

  const { error: banError } = await adminSupabase.auth.admin.updateUserById(targetUserId, {
    ban_duration: "876000h",
  });
  if (banError) return { error: banError.message };

  const { data: updatedProfile, error } = await adminSupabase
    .from("profiles")
    .update({ role: "member", permissions: {} })
    .eq("id", targetUserId)
    .select("id")
    .single();

  if (error) return { error: error.message };
  if (!isProfileWriteApplied(updatedProfile)) return { error: "成员移除未生效，请刷新后重试" };

  const teamId = await getProfileTeamId(supabase, targetUserId);
  await adminSupabase.from("member_change_log").insert({
    user_id: targetUserId,
    team_id: teamId,
    action_type: "remove",
    operator_id: perm.userId,
  }).then(() => {}, () => {});

  await writeAuditLog(supabase, perm.userId, "remove_member", targetUserId, `移除成员: ${target.name}`);

  revalidatePath("/admin");
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
    .select("id, role, name, permissions, team_id")
    .in("id", [perm.userId, targetUserId]);
  if (profileError) return { error: profileError.message };

  const actor = profileRows?.find((profile) => profile.id === perm.userId);
  const target = profileRows?.find((profile) => profile.id === targetUserId);
  if (!target) return { error: "用户不存在" };
  if (!canRemoveMemberTarget({
    actorRole: perm.role,
    actorId: perm.userId,
    actorPermissions: perm.permissions,
    actorTeamId: actor?.team_id ?? null,
    targetId: targetUserId,
    targetRole: target.role as UserRole,
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
    .select("id, role, name, permissions, team_id")
    .in("id", [perm.userId, targetUserId]);
  if (profileError) return { error: profileError.message };

  const actor = profileRows?.find((profile) => profile.id === perm.userId);
  const target = profileRows?.find((profile) => profile.id === targetUserId);
  if (!target) return { error: "用户不存在" };
  if (target.role === "owner") return { error: "不能修改其他创始人" };

  if (
    !canChangeMemberRole({
      actorRole: perm.role,
      actorId: perm.userId,
      actorPermissions: perm.permissions,
      actorTeamId: actor?.team_id ?? null,
      targetId: targetUserId,
      targetRole: target.role as UserRole,
      targetPermissions: (target.permissions ?? {}) as Permissions,
      targetTeamId: target.team_id ?? null,
      newRole,
    })
  ) {
    return { error: perm.role === "owner" ? "不能修改该用户角色" : "负责人只能调整本团队组员和组长" };
  }

  const updateData: { role: string; permissions?: Record<string, never> } = { role: newRole };
  if (newRole === "member") updateData.permissions = {};

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

  // Check if team has groups
  const { data: groups, error: groupsError } = await adminSupabase
    .from("groups")
    .select("id")
    .eq("team_id", teamId)
    .limit(1);
  if (groupsError) return { error: groupsError.message };
  if (groups && groups.length > 0) return { error: "该团队下还有分组，无法删除" };

  const { data: team } = await adminSupabase.from("teams").select("name").eq("id", teamId).single();

  const { error } = await adminSupabase.from("teams").delete().eq("id", teamId);
  if (error) return { error: error.message };

  const supabase = await createClient();
  await writeAuditLog(supabase, perm.userId, "delete_team", teamId, team?.name ?? teamId);

  revalidatePath("/admin");
  revalidatePath("/register");
  return {};
}

export async function createGroup(input: {
  teamId: string;
  name: string;
  leaderUserId: string;
}): Promise<{ error?: string; group?: { id: string; name: string; team_id: string | null; leader_user_id: string | null } }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };

  const normalizedName = input.name.trim();
  if (!normalizedName) return { error: "请输入组名" };
  if (!input.teamId || !input.leaderUserId) return { error: "请选择团队和组长" };

  try {
    const { adminSupabase, profiles, groups, access } = await loadTeamManagementContext(perm);
    if (!access.canEditGroups || !canAccessTeam(access, input.teamId)) return { error: "无权限" };

    const leader = profiles.find((profile) => profile.id === input.leaderUserId);
    if (!leader || !canUseLeaderCandidate(access, leader, input.teamId)) return { error: "组长必须是本团队非负责人的管理员" };

    if (groups.some((group) => group.team_id === input.teamId && group.name === normalizedName)) {
      return { error: "该团队下已有同名组" };
    }

    const { data: createdGroup, error } = await adminSupabase
      .from("groups")
      .insert({
        team_id: input.teamId,
        name: normalizedName,
        leader_user_id: input.leaderUserId,
      })
      .select("id, name, team_id, leader_user_id")
      .single();
    if (error) return { error: error.message };

    const supabase = await createClient();
    await writeAuditLog(supabase, perm.userId, "create_group", input.teamId, `${normalizedName}|leader=${leader.name}`);
    revalidatePath("/admin");

    return {
      group: createdGroup
        ? {
            id: createdGroup.id,
            name: createdGroup.name,
            team_id: createdGroup.team_id ?? null,
            leader_user_id: createdGroup.leader_user_id ?? null,
          }
        : undefined,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "创建组失败" };
  }
}

export async function updateGroup(input: {
  groupId: string;
  name: string;
  leaderUserId: string;
}): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };

  const normalizedName = input.name.trim();
  if (!input.groupId || !normalizedName || !input.leaderUserId) return { error: "请完整填写组信息" };

  try {
    const { adminSupabase, profiles, groups, access } = await loadTeamManagementContext(perm);
    const group = groups.find((item) => item.id === input.groupId);
    if (!group) return { error: "分组不存在" };
    if (!canManageGroup(access, group)) return { error: "无权限" };
    if (!group.team_id) return { error: "分组缺少团队归属" };

    const leader = profiles.find((profile) => profile.id === input.leaderUserId);
    if (!leader || !canUseLeaderCandidate(access, leader, group.team_id)) return { error: "组长必须是本团队非负责人的管理员" };
    if (groups.some((item) => item.id !== group.id && item.team_id === group.team_id && item.name === normalizedName)) {
      return { error: "该团队下已有同名组" };
    }

    const { error } = await adminSupabase
      .from("groups")
      .update({ name: normalizedName, leader_user_id: input.leaderUserId })
      .eq("id", input.groupId);
    if (error) return { error: error.message };

    const supabase = await createClient();
    await writeAuditLog(supabase, perm.userId, "update_group", input.groupId, `${normalizedName}|leader=${leader.name}`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "更新组失败" };
  }

  revalidatePath("/admin");
  return {};
}

export async function assignMembersToGroup(input: {
  groupId: string;
  memberIds: string[];
}): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };

  const memberIds = Array.from(new Set(input.memberIds.filter(Boolean)));
  if (!input.groupId || memberIds.length === 0) return { error: "请选择组员" };

  try {
    const { adminSupabase, profiles, groups, access } = await loadTeamManagementContext(perm);
    const group = groups.find((item) => item.id === input.groupId);
    if (!group) return { error: "分组不存在" };
    if (!canManageGroup(access, group)) return { error: "无权限" };

    const members = memberIds.map((memberId) => profiles.find((profile) => profile.id === memberId));
    if (members.some((member) => !member || !canAssignMemberToGroup(access, member, group))) {
      return { error: "只能分配本团队普通成员" };
    }

    const { error } = await adminSupabase
      .from("profiles")
      .update({ group_id: group.id })
      .in("id", memberIds);
    if (error) return { error: error.message };

    const supabase = await createClient();
    await writeAuditLog(supabase, perm.userId, "assign_group_members", group.id, `count=${memberIds.length}`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "分配组员失败" };
  }

  revalidatePath("/admin");
  return {};
}

export async function removeMemberFromGroup(memberId: string): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!memberId) return { error: "请选择成员" };

  try {
    const { adminSupabase, profiles, access } = await loadTeamManagementContext(perm);
    const member = profiles.find((profile) => profile.id === memberId);
    if (!member) return { error: "成员不存在" };
    if (!canAssignMemberToGroup(access, member, null)) return { error: "无权限" };

    const { error } = await adminSupabase
      .from("profiles")
      .update({ group_id: null })
      .eq("id", memberId);
    if (error) return { error: error.message };

    const supabase = await createClient();
    await writeAuditLog(supabase, perm.userId, "remove_group_member", memberId, member.name);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "移除组员失败" };
  }

  revalidatePath("/admin");
  return {};
}
