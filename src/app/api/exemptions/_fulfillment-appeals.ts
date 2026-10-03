import type { SupabaseClient } from "@supabase/supabase-js";

type AppealRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  record_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  handler_id: string | null;
  handled_at: string | null;
  created_at: string;
  decision_reason?: string | null;
  submission_payload?: Record<string, unknown> | null;
};

function attachmentUrls(payload: Record<string, unknown> | null | undefined) {
  const assets = Array.isArray(payload?.assets) ? payload.assets : [];
  return assets
    .map((asset) => asset && typeof asset === "object" ? (asset as { url?: unknown }).url : null)
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    .map((url) => url.trim());
}

function appealType(payload: Record<string, unknown> | null | undefined) {
  const mode = payload?.mode;
  return mode === "edit" || mode === "abnormal" ? "视频" : "日报";
}

export async function loadFulfillmentAppealRows(input: {
  supabase: SupabaseClient;
  statuses: Array<AppealRow["status"]>;
  limit: number;
  visibleUserIds: string[] | null;
}) {
  // 旧的豁免路由单测只替身了豁免查询客户端；没有补交表替身时保持兼容，生产客户端始终具备 from。
  if (typeof (input.supabase as { from?: unknown }).from !== "function") return { rows: [] };
  let query = input.supabase
    .from("fulfillment_appeals")
    .select("id, user_id, account_id, record_date, reason, status, handler_id, handled_at, created_at, decision_reason, submission_payload")
    .in("status", input.statuses)
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (input.visibleUserIds !== null) query = query.in("user_id", input.visibleUserIds);

  const appealsResult = await query;
  if (appealsResult.error) return { error: appealsResult.error };
  const appeals = (appealsResult.data ?? []) as AppealRow[];
  if (appeals.length === 0) return { rows: [] };

  const userIds = Array.from(new Set(appeals.flatMap((row) => [row.user_id, row.handler_id]).filter((id): id is string => Boolean(id))));
  const accountIds = Array.from(new Set(appeals.map((row) => row.account_id).filter((id): id is string => Boolean(id))));
  const [profilesResult, accountsResult, absenceResult] = await Promise.all([
    input.supabase.from("profiles").select("id, name").in("id", userIds),
    accountIds.length > 0 ? input.supabase.from("accounts").select("id, name").in("id", accountIds) : Promise.resolve({ data: [], error: null }),
    input.supabase.from("fulfillment_records").select("user_id, record_date").in("user_id", Array.from(new Set(appeals.map((row) => row.user_id)))).eq("status", "absent"),
  ]);
  if (profilesResult.error || accountsResult.error || absenceResult.error) {
    return { error: profilesResult.error ?? accountsResult.error ?? absenceResult.error };
  }

  const profiles = profilesResult.data ?? [];
  const accountRows = accountsResult.data ?? [];
  const nameOf = (id: string) => profiles.find((row) => row.id === id)?.name ?? null;
  const accountNameOf = (id: string) => accountRows.find((row) => row.id === id)?.name ?? null;
  const absentKeys = new Set((absenceResult.data ?? []).map((row) => `${row.user_id}:${row.record_date}`));

  return {
    rows: appeals.map((row) => ({
      id: row.id,
      request_id: row.id,
      appeal_id: row.id,
      applicant_user_id: row.user_id,
      applicant_name: nameOf(row.user_id),
      team_id: null,
      team_name: null,
      exemption_type: "fulfillment_appeal",
      exemption_category: null,
      start_date: row.record_date,
      end_date: row.record_date,
      reason: row.reason,
      request_status: row.status,
      reviewed_by: row.handler_id,
      reviewed_by_name: row.handler_id ? nameOf(row.handler_id) : null,
      reviewed_at: row.handled_at,
      created_at: row.created_at,
      feedback: row.decision_reason ?? null,
      account_id: row.account_id,
      account_name: row.account_id ? accountNameOf(row.account_id) : null,
      appeal_type: appealType(row.submission_payload),
      business_date: row.record_date,
      attachment_urls: attachmentUrls(row.submission_payload),
      attachments: attachmentUrls(row.submission_payload),
      absence_days: absentKeys.has(`${row.user_id}:${row.record_date}`) ? 1 : 0,
      rejection_reason: row.status === "rejected" ? row.decision_reason ?? null : null,
      source: "fulfillment_appeal" as const,
    })),
  };
}
