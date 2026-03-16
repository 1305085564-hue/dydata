"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
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
  }).then(() => {}, () => {}); // 静默失败，不影响主流程
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

export async function toggleExempt(userId: string, currentStatus: string): Promise<{ error?: string }> {
  const perm = await getUserPermissions();
  if (!perm) return { error: "未登录" };
  if (!hasPermission(perm.role, perm.permissions, "manage_members")) return { error: "无权限" };

  const supabase = await createClient();
  const newStatus = currentStatus === "exempt" ? "active" : "exempt";

  const { error } = await supabase
    .from("profiles")
    .update({ status: newStatus })
    .eq("id", userId);

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, perm.userId, "toggle_exempt", userId, `${currentStatus} → ${newStatus}`);

  revalidatePath("/admin");
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
