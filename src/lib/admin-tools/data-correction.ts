import { createAdminClient } from "@/lib/supabase/admin";
import type { ToolExecutionResult } from "./types";
import { toOptionalString, toDateString, toStringArray } from "./utils";

export async function deleteMetrics(params: Record<string, unknown>, dryRun: boolean): Promise<ToolExecutionResult> {
  const metricsId = toOptionalString(params.metricsId);
  if (!metricsId) return { success: false, error: "缺少 metricsId" };

  const service = createAdminClient();
  const { data: before } = await service
    .from("daily_reports")
    .select("id, user_id, report_date, title, play_count")
    .eq("id", metricsId)
    .single();

  if (!before) return { success: false, error: "数据不存在" };

  const backupSql = `INSERT INTO daily_reports_backup SELECT * FROM daily_reports WHERE id='${metricsId}';`;
  if (dryRun) return { success: true, backupSql, beforeSnapshot: before, affectedData: { metricsId } };

  const { error } = await service.from("daily_reports").delete().eq("id", metricsId);
  if (error) return { success: false, error: error.message, backupSql, beforeSnapshot: before };

  return {
    success: true,
    data: { metricsId },
    backupSql,
    beforeSnapshot: before,
    afterSnapshot: { deleted: true },
  };
}

export async function fillMissingData(params: Record<string, unknown>): Promise<ToolExecutionResult> {
  const userId = toOptionalString(params.userId);
  const date = toDateString(params.date);
  const metrics = (params.metrics ?? {}) as Record<string, unknown>;

  if (!userId || !date) return { success: false, error: "缺少 userId 或 date" };

  const service = createAdminClient();
  const [{ data: profile }, { data: account }] = await Promise.all([
    service.from("profiles").select("name").eq("id", userId).single(),
    service.from("accounts").select("id").eq("profile_id", userId).order("created_at", { ascending: true }).limit(1),
  ]);

  const accountId = account?.[0]?.id;
  if (!accountId) return { success: false, error: "该用户没有绑定账号，无法补填" };

  const { error } = await service.from("daily_reports").insert({
    user_id: userId,
    account_id: accountId,
    submitter: profile?.name ?? "管理员补填",
    title: "管理员补填",
    report_date: date,
    play_count: Number(metrics.total_views ?? 0),
    completion_rate: "0",
    avg_play_duration: "0",
    bounce_rate_2s: "0",
    completion_rate_5s: "0",
    likes: Number(metrics.total_likes ?? 0),
    comments: 0,
    shares: 0,
    favorites: 0,
    follower_gain: Number(metrics.fans_count ?? 0),
    follower_convert: 0,
    content: "管理员补填",
    published_at: null,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data: { userId, date } };
}

export async function grantExemption(params: Record<string, unknown>, dryRun: boolean): Promise<ToolExecutionResult> {
  const userIds = toStringArray(params.userIds);
  const userId = toOptionalString(params.userId);
  const targets = userIds.length ? userIds : userId ? [userId] : [];
  const date = toDateString(params.date) || new Date().toISOString().slice(0, 10);
  const reason = toOptionalString(params.reason) ?? "管理员手动标记";

  if (!targets.length) return { success: false, error: "缺少 userId/userIds" };

  const service = createAdminClient();
  const { data: before } = await service.from("profiles").select("id, status, exempt_type, exempt_start_date, exempt_end_date").in("id", targets);

  const backupSql = `INSERT INTO profiles_backup SELECT * FROM profiles WHERE id IN (${targets.map((id) => `'${id}'`).join(",")});`;
  if (dryRun) {
    return {
      success: true,
      backupSql,
      beforeSnapshot: { profiles: before ?? [] },
      affectedData: { userCount: targets.length, date, reason },
    };
  }

  const { error } = await service
    .from("profiles")
    .update({
      status: "exempt",
      exempt_type: "temporary",
      exempt_start_date: date,
      exempt_end_date: date,
      exempt_reason: reason,
      exemption_category: "waive",
    })
    .in("id", targets);

  if (error) return { success: false, error: error.message, backupSql, beforeSnapshot: { profiles: before ?? [] } };

  await service
    .from("exemption_grant")
    .insert(
      targets.map((id) => ({
        user_id: id,
        exemption_type: "single_day",
        grant_mode: "yesterday",
        start_date: date,
        end_date: date,
        reason,
        status: "active",
      })),
    )
    .then(() => {}, () => {});

  const { data: after } = await service.from("profiles").select("id, status, exempt_start_date, exempt_end_date").in("id", targets);

  return {
    success: true,
    data: { userIds: targets, date },
    backupSql,
    beforeSnapshot: { profiles: before ?? [] },
    afterSnapshot: { profiles: after ?? [] },
  };
}
