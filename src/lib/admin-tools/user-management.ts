import { createAdminClient } from "@/lib/supabase/admin";
import type { ToolExecutionResult, ToolContext } from "./types";
import { toOptionalString, toSafeString } from "./utils";

export async function kickUser(params: Record<string, unknown>, dryRun: boolean): Promise<ToolExecutionResult> {
  const userId = toOptionalString(params.userId);
  if (!userId) return { success: false, error: "缺少 userId" };

  const service = createAdminClient();
  const [{ data: profile }, { data: reports }, { data: exemptions }] = await Promise.all([
    service.from("profiles").select("id, name, role, permissions, status").eq("id", userId).single(),
    service.from("daily_reports").select("id").eq("user_id", userId),
    service.from("exemption_grant").select("id").eq("user_id", userId),
  ]);

  if (!profile) return { success: false, error: "用户不存在" };

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

  const { error } = await service.from("profiles").update({ role: "member", permissions: {} }).eq("id", userId);
  if (error) return { success: false, error: error.message, backupSql, beforeSnapshot: profile, affectedData };

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
  if (context.actorRole !== "owner") {
    return { success: false, error: "仅 owner 可修改用户角色" };
  }

  const userId = toOptionalString(params.userId);
  const newRole = toSafeString(params.newRole);
  if (!userId || !["member", "admin"].includes(newRole)) {
    return { success: false, error: "newRole 仅支持 member/admin" };
  }

  const service = createAdminClient();
  const { data: before } = await service.from("profiles").select("id, role, permissions").eq("id", userId).single();
  if (!before) return { success: false, error: "用户不存在" };

  const backupSql = `UPDATE profiles SET role='${before.role}' WHERE id='${userId}';`;
  if (dryRun) return { success: true, backupSql, beforeSnapshot: before, affectedData: { userId, newRole } };

  const payload = newRole === "member" ? { role: newRole, permissions: {} } : { role: newRole };
  const { error } = await service.from("profiles").update(payload).eq("id", userId);
  if (error) return { success: false, error: error.message, backupSql, beforeSnapshot: before };

  const { data: after } = await service.from("profiles").select("id, role, permissions").eq("id", userId).single();
  return { success: true, data: { userId, newRole }, backupSql, beforeSnapshot: before, afterSnapshot: after };
}

export async function updateUserPermissions(params: Record<string, unknown>, dryRun: boolean): Promise<ToolExecutionResult> {
  const userId = toOptionalString(params.userId);
  const permissions = params.permissions as Record<string, boolean> | undefined;
  if (!userId || !permissions || typeof permissions !== "object") {
    return { success: false, error: "参数无效" };
  }

  const service = createAdminClient();
  const { data: before } = await service.from("profiles").select("id, permissions").eq("id", userId).single();
  if (!before) return { success: false, error: "用户不存在" };

  const backupSql = `UPDATE profiles SET permissions='${JSON.stringify(before.permissions ?? {})}'::jsonb WHERE id='${userId}';`;
  if (dryRun) return { success: true, backupSql, beforeSnapshot: before, affectedData: { userId, permissions } };

  const { error } = await service.from("profiles").update({ permissions }).eq("id", userId);
  if (error) return { success: false, error: error.message, backupSql, beforeSnapshot: before };

  const { data: after } = await service.from("profiles").select("id, permissions").eq("id", userId).single();
  return { success: true, data: { userId }, backupSql, beforeSnapshot: before, afterSnapshot: after };
}
