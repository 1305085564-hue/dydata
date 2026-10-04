import type { SupabaseClient } from "@supabase/supabase-js";

import { UUID_PATTERN } from "@/app/api/production/_shared";
import { filterActiveMemberships, loadWithMembershipFallback } from "@/lib/member-lifecycle";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import type { AttributionPayload, AttributionReport } from "../domain/types";
import { STATS_START_DATE } from "../domain/types";
import { unique } from "../domain/report-rules";

export function parseAttributionPayload(value: unknown):
  | { ok: true; data: AttributionPayload }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "请求体不正确" };
  }
  const body = value as Record<string, unknown>;
  const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
  if (!UUID_PATTERN.test(reportId)) return { ok: false, error: "reportId 必须是合法 UUID" };

  const fields = ["scriptAuthorUserId", "videoEditorUserId", "operatorUserId"] as const;
  const normalized: Record<(typeof fields)[number], string | null> = {
    scriptAuthorUserId: null,
    videoEditorUserId: null,
    operatorUserId: null,
  };
  for (const field of fields) {
    if (!(field in body)) return { ok: false, error: `${field} 为必填字段` };
    if (body[field] === null) {
      normalized[field] = null;
      continue;
    }
    const userId = typeof body[field] === "string" ? body[field].trim() : "";
    if (!UUID_PATTERN.test(userId)) return { ok: false, error: `${field} 必须是合法 UUID 或 null` };
    normalized[field] = userId;
  }

  return { ok: true, data: { reportId, ...normalized } };
}

export async function loadAttributionReport(supabase: SupabaseClient, reportId: string) {
  const result = await supabase
    .from("daily_reports")
    .select("id, user_id, account_id, report_date")
    .eq("id", reportId)
    .gte("report_date", STATS_START_DATE)
    .eq("is_void", false)
    .maybeSingle();
  assertSupabaseQuerySucceeded(result.error, "加载待补录日报失败");
  return (result.data as AttributionReport | null) ?? null;
}

export async function assertProfilesExist(supabase: SupabaseClient, userIds: string[]) {
  const ids = unique(userIds);
  if (ids.length === 0) return true;
  const result = await loadWithMembershipFallback({
    loadWithMembership: async () => supabase.from("profiles").select("id, membership_status").in("id", ids),
    loadWithoutMembership: async () => supabase.from("profiles").select("id").in("id", ids),
  });
  assertSupabaseQuerySucceeded(result.error, "校验归属成员失败");
  const rows = (result.data ?? []) as Array<{ id: string; membership_status?: string | null }>;
  return unique(filterActiveMemberships(rows).map((row) => row.id)).length === ids.length;
}

export async function updateAttributionAtomically(
  supabase: Pick<SupabaseClient, "rpc">,
  payload: AttributionPayload,
) {
  const result = await supabase.rpc("update_collaboration_attribution", {
    p_report_id: payload.reportId,
    p_script_author_user_id: payload.scriptAuthorUserId,
    p_video_editor_user_id: payload.videoEditorUserId,
    p_operator_user_id: payload.operatorUserId,
  });
  assertSupabaseQuerySucceeded(result.error, "更新协作归属失败");
  const data = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  return { videoUpdated: data.videoUpdated === true };
}
