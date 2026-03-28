import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ToolExecutionResult } from "./types";
import { toOptionalString, toSafeString, toDateString } from "./utils";

export async function getUserInfo(params: Record<string, unknown>): Promise<ToolExecutionResult> {
  const supabase = await createClient();

  const userId = toOptionalString(params.userId);
  const email = toOptionalString(params.email);
  const name = toOptionalString(params.name);

  if (!userId && !email && !name) {
    return { success: false, error: "查询用户必须提供 userId/email/name 之一" };
  }

  let query = supabase.from("profiles").select("id, name, role, status, permissions");
  if (userId) query = query.eq("id", userId);
  if (!userId && email) query = query.eq("email", email);
  if (!userId && !email && name) query = query.ilike("name", `%${name}%`);

  const { data: profiles, error } = await query.limit(1);
  if (error || !profiles?.length) {
    return { success: false, error: error?.message || "未找到用户" };
  }

  const profile = profiles[0];

  const [{ data: recentMetrics }, { data: exemptions }] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("id, report_date, play_count, likes, comments, shares, favorites, follower_gain")
      .eq("user_id", profile.id)
      .order("report_date", { ascending: false })
      .limit(10),
    supabase
      .from("exemption_grant")
      .select("id, status, exemption_type, start_date, end_date, reason")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return {
    success: true,
    data: {
      user: profile,
      recentMetrics: recentMetrics ?? [],
      exemptions: exemptions ?? [],
    },
  };
}

export async function getAnomalousData(params: Record<string, unknown>): Promise<ToolExecutionResult> {
  const supabase = await createClient();
  const type = toSafeString(params.type);
  const start = toDateString((params.dateRange as Record<string, unknown> | undefined)?.start);
  const end = toDateString((params.dateRange as Record<string, unknown> | undefined)?.end);

  if (type === "no_submission") {
    const date = end || new Date().toISOString().slice(0, 10);
    const [{ data: profiles }, { data: reports }] = await Promise.all([
      supabase.from("profiles").select("id, name, status").eq("role", "member"),
      supabase.from("daily_reports").select("user_id").eq("report_date", date),
    ]);

    const submitted = new Set((reports ?? []).map((item) => item.user_id));
    const anomalies = (profiles ?? [])
      .filter((profile) => (profile.status ?? "active") === "active" && !submitted.has(profile.id))
      .map((profile) => ({
        date,
        userId: profile.id,
        userName: profile.name,
        issue: "未提交日报",
        severity: "medium",
      }));

    return { success: true, data: { anomalies } };
  }

  if (type === "consecutive_exemption") {
    const { data: grants } = await supabase
      .from("exemption_grant")
      .select("user_id, start_date, end_date, status")
      .eq("status", "active");

    const anomalies = (grants ?? []).map((grant: { user_id: string; start_date: string; end_date: string }) => ({
      date: grant.start_date,
      userId: grant.user_id,
      issue: `连续豁免区间 ${grant.start_date} - ${grant.end_date}`,
      severity: "high",
    }));

    return { success: true, data: { anomalies } };
  }

  if (type === "abnormal_spike") {
    let query = supabase
      .from("daily_reports")
      .select("id, user_id, report_date, play_count")
      .order("report_date", { ascending: false })
      .limit(500);

    if (start) query = query.gte("report_date", start);
    if (end) query = query.lte("report_date", end);

    const { data: rows } = await query;
    const grouped = new Map<string, Array<{ report_date: string; play_count: number }>>();

    for (const row of rows ?? []) {
      const list = grouped.get(row.user_id) ?? [];
      list.push({ report_date: row.report_date, play_count: row.play_count ?? 0 });
      grouped.set(row.user_id, list);
    }

    const anomalies: Array<Record<string, unknown>> = [];
    for (const [userId, list] of grouped.entries()) {
      const avg = list.reduce((acc, item) => acc + item.play_count, 0) / Math.max(list.length, 1);
      for (const item of list) {
        if (avg > 0 && item.play_count >= avg * 3) {
          anomalies.push({
            date: item.report_date,
            userId,
            issue: `播放异常上升，当前 ${item.play_count}，均值 ${Math.round(avg)}`,
            severity: "high",
          });
        }
      }
    }

    return { success: true, data: { anomalies } };
  }

  return { success: false, error: "不支持的异常类型" };
}

export async function getTaskStatus(params: Record<string, unknown>): Promise<ToolExecutionResult> {
  const service = createAdminClient();
  const taskType = toSafeString(params.taskType);

  if (taskType === "daily_review") {
    const userId = toOptionalString(params.userId);
    const range = params.dateRange as Record<string, unknown> | undefined;
    const start = toDateString(range?.start);
    const end = toDateString(range?.end);

    let query = service
      .from("ai_insight_result")
      .select("id, result_status, created_at, rendered_text, result_json")
      .eq("insight_type", "next_day_review")
      .order("created_at", { ascending: false })
      .limit(100);

    if (start) query = query.gte("created_at", `${start}T00:00:00.000Z`);
    if (end) query = query.lte("created_at", `${end}T23:59:59.999Z`);

    const { data: rows } = await query;

    const tasks = (rows ?? [])
      .filter((row) => {
        if (!userId) return true;
        const resultJson = (row.result_json ?? {}) as Record<string, unknown>;
        return resultJson.user_id === userId;
      })
      .map((row) => ({
        id: row.id,
        status: row.result_status === "success" ? "completed" : row.result_status === "failed" ? "failed" : "processing",
        createdAt: row.created_at,
        error: row.result_status === "failed" ? row.rendered_text : null,
      }));

    return { success: true, data: { tasks } };
  }

  if (taskType === "content_breakdown") {
    const contentItemId = toOptionalString(params.contentItemId);
    if (!contentItemId) return { success: false, error: "缺少 contentItemId" };

    const { data: segments } = await service
      .from("video_content_segments")
      .select("id, created_at")
      .eq("video_id", contentItemId)
      .order("created_at", { ascending: false })
      .limit(1);

    const hasSegments = Boolean(segments?.length);
    return {
      success: true,
      data: {
        tasks: [
          {
            id: contentItemId,
            status: hasSegments ? "completed" : "pending",
            createdAt: segments?.[0]?.created_at ?? null,
          },
        ],
      },
    };
  }

  return { success: false, error: "不支持的任务类型" };
}
