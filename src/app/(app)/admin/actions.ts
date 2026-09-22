"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { hasExemptionManagementPermission } from "@/lib/exemption-permissions";
import { getTeamMeta, getTeamOptions } from "@/lib/teams";
import { getUserPermissions } from "@/lib/permissions";
import { canManageTeamStructure } from "@/lib/team-management";
import {
  buildRequestDraft,
  isMissingExemptionRequestCategoryError,
  stripExemptionCategoryFromRequestDraft,
  type GrantMode,
  type ReviewDecision,
} from "@/lib/豁免流程";

import {
  reviewExemptionRequestAtomically,
} from "@/lib/exemption-review";
import {
  buildOrphanRejectionAuditEntry,
  isMissingReviewNoteColumnError,
  ORPHAN_EXEMPTION_REVIEW_NOTE,
  resolveOrphanMutationPreflight,
} from "@/lib/exemption-orphan";
import {
  auditAppliedButNotLoggedMessage,
  auditRollbackIncompleteMessage,
  auditRollbackMessage,
  writeAuditLog,
} from "@/lib/audit-log";
import type { Permissions, UserRole } from "@/types";
import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import { buildCompanyRoleProfilePatch, resolveProfileCompanyRole } from "@/lib/company-permissions";
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
  resolveMemberTeamTransfer,
} from "./权限管理";

const SAFE_EXEMPTION_REQUEST_INPUT_ERRORS = new Set([
  "多日豁免必须填写开始和结束日期",
  "开始日期不能晚于结束日期",
  "豁免至少选择1天",
  "永久豁免必须填写原因",
  "豁免理由不能超过 500 个字符",
]);

function hasActiveScopeAccess(
  scope: Awaited<ReturnType<typeof buildDataAccessScope>> | null,
  userId: string,
) {
  if (!scope) return false;
  const activeVisibleUserIds = scope.activeVisibleUserIds ?? scope.visibleUserIds;
  return activeVisibleUserIds.includes(userId);
}

function resolveTargetRuntimeRole(profile: { role?: unknown; company_role?: unknown }): UserRole | null {
  const resolution = resolveProfileCompanyRole(profile.role, profile.company_role);
  if (resolution.conflict || !resolution.companyRole) return null;
  return resolution.companyRole === "company_owner" ? "owner" : resolution.companyRole;
}

type AdminWriteSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * 管理写操作的审计统一出口：一律走 `src/lib/audit-log.ts` 落 `audit_logs`
 * （`admin_actions` 只归 AI 工具，不在这里写）。
 *
 * 与「岗位管理按团队」用同一套失败策略，不再像旧实现那样用空成功/失败回调把审计错误吞掉：
 * - 能回滚的写操作：先回滚，再按 `auditRollback*` 报失败；
 * - 回不去的写操作：按 `auditAppliedButNotLogged*` 承认「已生效」，让操作人去找留痕。
 */
async function recordAdminAudit(entry: {
  supabase: AdminWriteSupabase;
  userId: string;
  action: string;
  target: string;
  detail?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await writeAuditLog(entry.supabase, {
    userId: entry.userId,
    action: entry.action,
    target: entry.target,
    detail: entry.detail ?? null,
  });
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

/** 审计失败且这次写操作回不去：明确承认「已生效」，不伪装成功也不伪装失败。 */
function auditNotLogged(what: string): { error: string } {
  return { error: auditAppliedButNotLoggedMessage(what) };
}

type OrphanMutationContext = {
  perm: NonNullable<Awaited<ReturnType<typeof getUserPermissions>>>;
  supabase: Awaited<ReturnType<typeof createClient>>;
  adminSupabase: ReturnType<typeof createAdminClient>;
  scope: NonNullable<Awaited<ReturnType<typeof buildDataAccessScope>>>;
  request: {
    id: string;
    applicant_user_id: string | null;
    team_id: string | null;
    request_status: string | null;
  };
  applicant: {
    id: string;
    team_id: string | null;
    membership_status: string | null;
  } | null;
};

async function loadOrphanMutationContext(
  requestId: string,
): Promise<{ context: OrphanMutationContext } | { error: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (perm.companyRole !== "company_owner") {
    return { error: "无权限" };
  }

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const scope = await buildDataAccessScope(adminSupabase, perm.userId, {
    profile: {
      id: perm.userId,
      role: perm.companyRole ?? perm.role,
      permissions: perm.permissions,
      data_scope: perm.dataScope,
      team_id: perm.teamId ?? null,
      company_role: perm.companyRole,
      group_mode: perm.groupMode,
      group_mode_token_hash: perm.groupModeTokenHash,
      membership_status: perm.membershipStatus,
    },
  });
  if (!scope) return { error: "用户信息不存在" };

  const requestResult = await adminSupabase
    .from("exemption_request")
    .select("id, applicant_user_id, team_id, request_status")
    .eq("id", requestId)
    .maybeSingle();
  if (requestResult.error) return { error: "读取归属异常申请失败" };
  if (!requestResult.data) return { error: "豁免申请不存在" };

  const applicantId = requestResult.data.applicant_user_id as string | null;
  const applicantResult = applicantId
    ? await adminSupabase
      .from("profiles")
      .select("id, team_id, membership_status")
      .eq("id", applicantId)
      .maybeSingle()
    : { data: null, error: null };
  if (applicantResult.error) return { error: "读取申请人状态失败" };

  return {
    context: {
      perm,
      supabase,
      adminSupabase,
      scope,
      request: requestResult.data as OrphanMutationContext["request"],
      applicant: (applicantResult.data as OrphanMutationContext["applicant"]) ?? null,
    },
  };
}

async function markOrphanRequestRejected(
  adminSupabase: ReturnType<typeof createAdminClient>,
  requestId: string,
  reviewerId: string,
) {
  const reviewedAt = new Date().toISOString();
  const commonPatch = {
    request_status: "rejected",
    reviewed_by: reviewerId,
    reviewed_at: reviewedAt,
  };

  const withNote = await adminSupabase
    .from("exemption_request")
    .update({ ...commonPatch, review_note: ORPHAN_EXEMPTION_REVIEW_NOTE } as Record<string, unknown>)
    .eq("id", requestId)
    .eq("request_status", "pending")
    .select("id")
    .maybeSingle();

  if (!withNote.error && withNote.data) {
    return { ok: true as const, storedReviewNote: true as const };
  }
  if (withNote.error && !isMissingReviewNoteColumnError(withNote.error)) {
    return { ok: false as const, error: "拒绝归属异常申请失败" };
  }

  const fallback = await adminSupabase
    .from("exemption_request")
    .update(commonPatch)
    .eq("id", requestId)
    .eq("request_status", "pending")
    .select("id")
    .maybeSingle();
  if (fallback.error) return { ok: false as const, error: "拒绝归属异常申请失败" };
  if (!fallback.data) return { ok: false as const, error: "该申请已处理" };
  return { ok: true as const, storedReviewNote: false as const };
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

  const audit = await recordAdminAudit({
    supabase,
    userId: perm.userId,
    action: "submit_exemption_request",
    target: perm.userId,
    detail: `${input.category}|${input.mode}|${input.reason ?? ""}`,
  });
  // 申请是一次 insert，但这里没有回取 id，按「已生效但未留痕」上报，不猜 id 去删。
  if (!audit.ok) return auditNotLogged("提交豁免申请");

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
  if (!hasExemptionManagementPermission(perm.permissions)) return { error: "无权限" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const scope = await buildDataAccessScope(adminSupabase, perm.userId, {
    profile: {
      id: perm.userId,
      role: perm.companyRole ?? perm.role,
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

  const audit = await recordAdminAudit({
    supabase,
    userId: perm.userId,
    action: input.decision === "approved" ? "approve_exemption_request" : "reject_exemption_request",
    target: input.requestId,
    detail: input.decision,
  });
  // 审批是原子事务（申请状态 + 成员豁免一次完成），回滚会造出第三种状态，故只如实报告。
  if (!audit.ok) return auditNotLogged("豁免审批");

  revalidatePath("/admin");
  revalidatePath("/dashboard");
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
  options?: { expectedCurrentTeamId?: string | null },
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
    groupMode: perm.groupMode,
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
      actor: {
        id: perm.userId,
        role: perm.role,
        companyRole: perm.companyRole,
        permissions: perm.permissions,
        teamId: perm.teamId,
        groupMode: perm.groupMode,
      },
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
    actor: {
      id: perm.userId,
      role: perm.role,
      companyRole: perm.companyRole,
      permissions: perm.permissions,
      teamId: perm.teamId,
      groupMode: perm.groupMode,
    },
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

function normalizeOrphanActionValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function assignOrphanExemptionMember(
  requestId: string,
  applicantUserId: string,
  newTeamId: string,
): Promise<{ error?: string }> {
  const normalizedRequestId = normalizeOrphanActionValue(requestId);
  const normalizedApplicantId = normalizeOrphanActionValue(applicantUserId);
  const normalizedTeamId = normalizeOrphanActionValue(newTeamId);
  if (!normalizedRequestId || !normalizedApplicantId || !normalizedTeamId) {
    return { error: "归属异常申请参数不完整" };
  }

  const loaded = await loadOrphanMutationContext(normalizedRequestId);
  if ("error" in loaded) return loaded;
  const { context } = loaded;
  const preflight = resolveOrphanMutationPreflight({
    action: "assign",
    request: context.request,
    applicant: context.applicant,
    actorScope: context.scope,
    requestedApplicantId: normalizedApplicantId,
  });
  if (!preflight.ok) return { error: preflight.error };

  if (context.scope.kind !== "all" && context.scope.teamId !== normalizedTeamId) {
    return { error: "不能将成员分配到当前管理范围外的团队" };
  }

  const teamResult = await context.adminSupabase
    .from("teams")
    .select("id")
    .eq("id", normalizedTeamId)
    .maybeSingle();
  if (teamResult.error) return { error: "读取目标团队失败" };
  if (!teamResult.data) return { error: "目标团队不存在" };

  // updateMemberTeam 内部会再次读取目标 profile；expectedCurrentTeamId
  // 防止页面打开后成员先被其他管理员归属，再被旧卡片覆盖。
  const assignment = await updateMemberTeam(normalizedApplicantId, normalizedTeamId, {
    expectedCurrentTeamId: null,
  });
  if (assignment.error) return assignment;

  // 旧申请不能继续占住 dashboard 的 pending 防重闸门；分配完成后结束
  // 旧快照申请，员工才可以用新团队快照重新提交。
  const rejection = await markOrphanRequestRejected(
    context.adminSupabase,
    context.request.id,
    context.perm.userId,
  );
  if (!rejection.ok) {
    return { error: "成员已分配，但原申请未能结束，请刷新后处理" };
  }

  const rejectionAudit = buildOrphanRejectionAuditEntry({
      requestId: context.request.id,
      applicantUserId: context.request.applicant_user_id,
      applicantMembershipStatus: context.applicant?.membership_status ?? null,
      snapshotTeamId: context.request.team_id,
  });
  const audit = await recordAdminAudit({
    supabase: context.supabase,
    userId: context.perm.userId,
    action: rejectionAudit.action,
    target: rejectionAudit.target,
    detail: rejectionAudit.detail,
  });
  // 组合写（成员归属 + 结束旧申请）已落地，回滚要再造一条申请，如实报告。
  if (!audit.ok) return auditNotLogged("归属分配");

  revalidatePath("/admin");
  revalidatePath("/admin/modules");
  revalidatePath("/dashboard");
  return {};
}

export async function rejectOrphanExemptionRequest(
  requestId: string,
  applicantUserId?: string,
): Promise<{ error?: string }> {
  const normalizedRequestId = normalizeOrphanActionValue(requestId);
  const normalizedApplicantId = normalizeOrphanActionValue(applicantUserId);
  if (!normalizedRequestId) return { error: "归属异常申请参数不完整" };

  const loaded = await loadOrphanMutationContext(normalizedRequestId);
  if ("error" in loaded) return loaded;
  const { context } = loaded;
  const preflight = resolveOrphanMutationPreflight({
    action: "reject",
    request: context.request,
    applicant: context.applicant,
    actorScope: context.scope,
    requestedApplicantId: normalizedApplicantId || undefined,
  });
  if (!preflight.ok) return { error: preflight.error };

  const result = await markOrphanRequestRejected(
    context.adminSupabase,
    context.request.id,
    context.perm.userId,
  );
  if (!result.ok) return { error: result.error };

  const rejectionAudit = buildOrphanRejectionAuditEntry({
      requestId: context.request.id,
      applicantUserId: context.request.applicant_user_id,
      applicantMembershipStatus: context.applicant?.membership_status ?? null,
      snapshotTeamId: context.request.team_id,
  });
  const audit = await recordAdminAudit({
    supabase: context.supabase,
    userId: context.perm.userId,
    action: rejectionAudit.action,
    target: rejectionAudit.target,
    detail: rejectionAudit.detail,
  });
  if (!audit.ok) return auditNotLogged("驳回归属异常申请");

  revalidatePath("/admin");
  revalidatePath("/admin/modules");
  revalidatePath("/dashboard");
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
    actor: {
      id: perm.userId,
      role: perm.role,
      companyRole: perm.companyRole,
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
    const audit = await recordAdminAudit({
      supabase,
      userId: perm.userId,
      action: "archive_member",
      target: targetUserId,
      detail: `归档成员：${result.target.name ?? targetUserId}；原因：${reason.trim()}`,
    });
    // 归档回滚只能用「恢复成员」，那是把成员重置为未分配团队/普通成员/空权限，
    // 不是原状态，因此不冒充回滚，按已生效上报。
    if (!audit.ok) return auditNotLogged("归档成员");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/modules");
  return {};
}

export async function restoreMember(targetUserId: string): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (perm.permissions.manage_members !== true) return { error: "无权限" };
  if (targetUserId === perm.userId) return { error: "不能恢复自己" };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const result = await restoreMemberWithClient({
    client: adminSupabase,
    actor: {
      id: perm.userId,
      role: perm.role,
      companyRole: perm.companyRole,
      permissions: perm.permissions,
      teamId: perm.teamId,
      groupMode: perm.groupMode,
    },
    targetId: targetUserId,
  });
  if (!result.ok) return { error: result.error };

  if (result.changed) {
    const audit = await recordAdminAudit({
      supabase,
      userId: perm.userId,
      action: "restore_member",
      target: targetUserId,
      detail: `恢复成员：${result.target.name ?? targetUserId}；恢复后未分配团队、普通成员、空权限`,
    });
    // 恢复的逆向操作是归档，需另填原因且会改归属，不作回滚，如实报告。
    if (!audit.ok) return auditNotLogged("恢复成员");
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
  if (profileError) return { error: profileError.message };

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
    groupMode: perm.groupMode,
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
  if (error) return { error: error.message };

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
  if (profileError) return { error: profileError.message };

  const actor = profileRows?.find((profile) => profile.id === perm.userId);
  const target = profileRows?.find((profile) => profile.id === targetUserId);
  if (!target) return { error: "用户不存在" };
  if (target.membership_status === "archived") return { error: "已归档账号不能修改角色，请先恢复账号" };
  const targetRole = resolveTargetRuntimeRole(target);
  if (!targetRole) return { error: "成员角色字段冲突或无效，拒绝操作" };
  if (targetRole === "owner") {
    return { error: "不能修改其他公司所有者" };
  }

  if (
    !canChangeMemberRole({
      actorRole: perm.role,
      actorCompanyRole: perm.companyRole,
      actorId: perm.userId,
      actorPermissions: perm.permissions,
      actorTeamId: actor?.team_id ?? null,
      groupMode: perm.groupMode,
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

  if (error) return { error: error.message };
  if (!isProfileWriteApplied(updatedProfile)) return { error: "角色更新未生效，请刷新后重试" };

  const { data: rereadProfile, error: rereadError } = await adminSupabase
    .from("profiles")
    .select("id, role, company_role")
    .eq("id", targetUserId)
    .single();
  if (rereadError || !rereadProfile) {
    return { error: rereadError?.message ?? "角色更新复读失败，请刷新后重试" };
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

export async function createTeam(teamName: string): Promise<{ error?: string; team?: { id: string; name: string } }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!canManageTeamStructure(perm.companyRole, perm.permissions, perm.groupMode)) return { error: "无权限" };

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
  const audit = await recordAdminAudit({
    supabase,
    userId: perm.userId,
    action: "create_team",
    target: normalizedName,
    detail: normalizedName,
  });
  if (!audit.ok) {
    // 建团队是一次插入，可回滚：审计没写成就把刚建的团队删掉，
    // 不留一个「没人知道是谁建的」团队。
    if (!createdTeam) return { error: auditRollbackIncompleteMessage("创建团队") };
    const rollback = await adminSupabase.from("teams").delete().eq("id", createdTeam.id);
    return { error: rollback.error ? auditRollbackIncompleteMessage("创建团队") : auditRollbackMessage("创建团队") };
  }

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
  if (!canManageTeamStructure(perm.companyRole, perm.permissions, perm.groupMode)) return { error: "无权限" };

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
  const audit = await recordAdminAudit({
    supabase,
    userId: perm.userId,
    action: "delete_team",
    target: teamId,
    detail: team?.name ?? teamId,
  });
  // 团队删了没法按原 id 复原（重建会换 id、也会打乱外部引用），如实报告已生效。
  if (!audit.ok) return auditNotLogged("删除团队");

  revalidatePath("/admin");
  revalidatePath("/register");
  return {};
}
