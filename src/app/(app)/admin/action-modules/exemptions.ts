import {
hasActiveScopeAccess,
normalizeOrphanActionValue,
type OrphanMutationContext
} from "@/lib/admin-actions-helpers";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import {
buildOrphanRejectionAuditEntry,
isMissingReviewNoteColumnError,
ORPHAN_EXEMPTION_REVIEW_NOTE,
resolveOrphanMutationPreflight,
} from "@/lib/exemption-orphan";
import { hasExemptionManagementPermission } from "@/lib/exemption-permissions";
import { reviewExemptionRequestAtomically } from "@/lib/exemption-review";
import { getUserPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ReviewDecision } from "@/lib/豁免流程";
import { revalidatePath } from "next/cache";
import { adminActionFailure,auditNotLogged,recordAdminAudit } from "./audit";
import { updateMemberTeam } from "./members";

export async function loadOrphanMutationContext(
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

export async function markOrphanRequestRejected(
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
    },
  });
  if (!scope) return { error: "用户信息不存在" };

  const { data: requestRow, error: requestError } = await adminSupabase
    .from("exemption_request")
    .select("id, applicant_user_id, request_status")
    .eq("id", input.requestId)
    .maybeSingle();
  if (requestError) return adminActionFailure("review-exemption-request", "加载豁免申请失败，请稍后重试", requestError);
  if (!requestRow) return { error: "豁免申请不存在" };
  if (!hasActiveScopeAccess(scope, requestRow.applicant_user_id)) {
    return { error: "不能操作已归档或当前管理范围外的成员" };
  }

  const result = await reviewExemptionRequestAtomically({
    supabase,
    requestId: input.requestId,
    decision: input.decision,
  });
  if (!result.ok) return adminActionFailure("review-exemption-request", result.message, result.cause);

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

  if (context.scope.teamId !== normalizedTeamId) {
    return { error: "不能将成员分配到当前管理范围外的团队" };
  }

  const teamResult = await context.adminSupabase
    .from("teams")
    .select("id")
    .eq("id", normalizedTeamId)
    .maybeSingle();
  if (teamResult.error) return { error: "读取目标团队失败" };
  if (!teamResult.data) return { error: "目标团队不存在" };

  // updateMemberTeam 内部会再次读取目标 profile；expectedCurrentTeamId 防止页面打开后成员先被其他管理员归属，再被旧卡片覆盖。
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
