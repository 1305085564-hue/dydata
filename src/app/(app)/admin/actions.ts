"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import {
  buildExemptionFields,
  formatExemptionDetail,
  type ExemptionFormValues,
} from "@/lib/豁免";
import {
  buildGrantDraft,
  buildRequestDraft,
  buildReviewPatch,
  normalizeGrantMode,
  type AnyGrantMode,
  type GrantMode,
  type ReviewDecision,
} from "@/lib/豁免流程";
import type { Permissions } from "@/types";

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
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data: profile } = await supabase.from("profiles").select("team_id").eq("id", userId).single();
  return profile?.team_id ?? null;
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

async function applyGrantToProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    userId: string;
    teamId: string | null;
    mode: AnyGrantMode;
    reason?: string | null;
    requestId: string | null;
    today?: string;
    startDate?: string | null;
    endDate?: string | null;
  }
) {
  const draft = buildGrantDraft({
    ...input,
    today: input.today ?? new Date().toISOString().slice(0, 10),
  });

  await deactivateExistingGrants(supabase, input.userId);

  // exemption_grant 表可能未建，insert 失败不阻断（profiles 才是关键）
  await supabase.from("exemption_grant").insert(draft.grant).then(() => {}, () => {});

  const { error: profileError } = await syncProfileExemptionProjection(supabase, input.userId, draft.profile);
  if (profileError) {
    return { error: profileError.message };
  }

  return { error: undefined };
}

export async function generateInviteCode(
  adminId: string,
  count: number = 1,
  expiresInDays: number | null = null
): Promise<{ codes?: string[]; error?: string }> {
  const supabase = await createClient();

  const codes: string[] = [];
  const rows = [];
  for (let i = 0; i < Math.min(count, 20); i++) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    codes.push(code);
    rows.push({
      code,
      created_by: adminId,
      expires_at: expiresInDays
        ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
        : null,
    });
  }

  const { error } = await supabase.from("invite_codes").insert(rows);

  if (error) {
    return { error: error.message };
  }

  return { codes };
}

export async function updateExemption(values: ExemptionFormValues): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };

  const supabase = await createClient();

  try {
    if (values.mode === "none") {
      const { error: profileError } = await syncProfileExemptionProjection(supabase, values.userId, {
        status: "active",
        exempt_type: null,
        exempt_start_date: null,
        exempt_end_date: null,
        exempt_reason: null,
      });

      if (profileError) {
        return { error: profileError.message };
      }

      await deactivateExistingGrants(supabase, values.userId);
      await writeAuditLog(supabase, perm.userId, "clear_exempt", values.userId, "清除豁免");
      revalidatePath("/admin");
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
      requestId: null,
      today: new Date().toISOString().slice(0, 10),
      startDate: values.mode === "range" ? values.startDate ?? null : values.date ?? null,
      endDate: values.mode === "range" ? values.endDate ?? null : values.date ?? null,
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
  revalidatePath("/dashboard");
  return {};
}

export async function clearExemption(userId: string): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };

  const supabase = await createClient();

  await deactivateExistingGrants(supabase, userId);

  const { error } = await syncProfileExemptionProjection(supabase, userId, {
    status: "active",
    exempt_type: null,
    exempt_start_date: null,
    exempt_end_date: null,
    exempt_reason: null,
  });

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, perm.userId, "clear_exempt", userId, "清除豁免");

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return {};
}

export async function submitExemptionRequest(input: {
  mode: GrantMode;
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
      reason: input.reason,
      today: new Date().toISOString().slice(0, 10),
      startDate: input.startDate,
      endDate: input.endDate,
    });

    const { error } = await supabase.from("exemption_request").insert(draft);
    if (error) {
      return { error: error.message };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "提交申请失败",
    };
  }

  await writeAuditLog(supabase, perm.userId, "submit_exemption_request", perm.userId, `${input.mode}|${input.reason ?? ""}`);
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

  const { data: request, error: fetchError } = await supabase
    .from("exemption_request")
    .select("id, applicant_user_id, exemption_type, start_date, end_date, reason, request_status")
    .eq("id", input.requestId)
    .single();

  if (fetchError || !request) return { error: "申请不存在" };
  if (request.request_status !== "pending") return { error: "该申请已处理" };

  const patch = buildReviewPatch({ reviewerId: perm.userId, decision: input.decision });

  const { error: requestError } = await supabase
    .from("exemption_request")
    .update(patch)
    .eq("id", input.requestId);

  if (requestError) {
    return { error: requestError.message };
  }

  if (input.decision === "approved") {
    const teamId = await getProfileTeamId(supabase, request.applicant_user_id);
    const result = await applyGrantToProfile(supabase, {
      userId: request.applicant_user_id,
      teamId,
      mode: normalizeGrantMode(request.exemption_type as AnyGrantMode),
      reason: request.reason,
      requestId: request.id,
      today: new Date().toISOString().slice(0, 10),
      startDate: request.start_date,
      endDate: request.end_date,
    });

    if (result.error) {
      return result;
    }
  }

  await writeAuditLog(
    supabase,
    perm.userId,
    input.decision === "approved" ? "approve_exemption_request" : "reject_exemption_request",
    input.requestId,
    `${request.applicant_user_id}|${request.exemption_type}`
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
  if (perm.role !== "owner") return { error: "仅创始人可操作" };

  const supabase = await createClient();

  if (targetUserId === perm.userId) return { error: "不能修改自己的权限" };

  const { data: target } = await supabase.from("profiles").select("role").eq("id", targetUserId).single();
  if (target?.role !== "admin") return { error: "只能修改管理员的权限" };

  const { error } = await supabase
    .from("profiles")
    .update({ permissions: newPermissions })
    .eq("id", targetUserId);

  if (error) return { error: error.message };

  await writeAuditLog(supabase, perm.userId, "update_permissions", targetUserId, JSON.stringify(newPermissions));

  revalidatePath("/admin");
  return {};
}

export async function removeMember(targetUserId: string): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (perm.role !== "owner") return { error: "仅创始人可操作" };
  if (targetUserId === perm.userId) return { error: "不能移除自己" };

  const supabase = await createClient();

  const { data: target } = await supabase.from("profiles").select("role, name, team_id").eq("id", targetUserId).single();
  if (!target) return { error: "用户不存在" };
  if (target.role === "owner") return { error: "不能移除创始人" };

  const { error } = await supabase
    .from("profiles")
    .update({ role: null, permissions: {} })
    .eq("id", targetUserId);

  if (error) return { error: error.message };

  const teamId = await getProfileTeamId(supabase, perm.userId);
  await supabase.from("member_change_log").insert({
    user_id: targetUserId,
    team_id: teamId,
    action_type: "remove",
    operator_id: perm.userId,
  }).then(() => {}, () => {});

  await writeAuditLog(supabase, perm.userId, "remove_member", targetUserId, `移除成员: ${target.name}`);

  revalidatePath("/admin");
  return {};
}

export async function changeRole(
  targetUserId: string,
  newRole: "member" | "admin"
): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (perm.role !== "owner") return { error: "仅创始人可操作" };

  if (targetUserId === perm.userId) return { error: "不能修改自己的角色" };

  if (newRole !== "member" && newRole !== "admin") return { error: "无效角色" };

  const supabase = await createClient();

  const { data: target } = await supabase.from("profiles").select("role, name").eq("id", targetUserId).single();
  if (!target) return { error: "用户不存在" };
  if (target.role === "owner") return { error: "不能修改其他创始人" };

  const updateData: { role: string; permissions?: Record<string, never> } = { role: newRole };
  if (newRole === "member") updateData.permissions = {};

  const { error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", targetUserId);

  if (error) return { error: error.message };

  await writeAuditLog(supabase, perm.userId, "change_role", targetUserId, `${target.name}: ${target.role} → ${newRole}`);

  revalidatePath("/admin");
  return {};
}
