import type { SupabaseClient } from "@supabase/supabase-js";

export type AppealRow = {
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
  review_mode?: "pre_submit" | "post_submit" | null;
  video_id?: string | null;
  daily_report_id?: string | null;
  trigger_reason?: "expired" | "manual_published_at" | null;
  ocr_published_at_text?: string | null;
  elapsed_hours?: number | null;
};

export function deriveResumePending(
  status: AppealRow["status"],
  submissionPayload: AppealRow["submission_payload"],
  reviewMode: AppealRow["review_mode"] = "pre_submit",
): boolean | null {
  if (reviewMode === "post_submit") return null;
  return status === "approved" ? submissionPayload != null : null;
}

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

const APPEAL_SELECT_EXTENDED =
  "id, user_id, account_id, record_date, reason, status, handler_id, handled_at, created_at, decision_reason, submission_payload, review_mode, video_id, daily_report_id, trigger_reason, ocr_published_at_text, elapsed_hours";
const APPEAL_SELECT_LEGACY =
  "id, user_id, account_id, record_date, reason, status, handler_id, handled_at, created_at, decision_reason, submission_payload";

function readNumberField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function loadFulfillmentAppealRows(input: {
  supabase: SupabaseClient;
  statuses: Array<AppealRow["status"]>;
  limit: number;
  visibleUserIds: string[] | null;
  /** 排序列：待处理队列按申请时间（默认），已处理历史按审批处理时间 */
  orderBy?: "created_at" | "handled_at";
}) {
  // 旧的豁免路由单测只替身了豁免查询客户端；没有补交表替身时保持兼容，生产客户端始终具备 from。
  if (typeof (input.supabase as { from?: unknown }).from !== "function") return { rows: [] };
  const buildQuery = (selectFields: string) => {
    let query = input.supabase
      .from("fulfillment_appeals")
      .select(selectFields)
      .in("status", input.statuses)
      .order(input.orderBy ?? "created_at", { ascending: false, nullsFirst: false })
      .limit(input.limit);
    if (input.visibleUserIds !== null) query = query.in("user_id", input.visibleUserIds);
    return query;
  };

  let appealsResult = await buildQuery(APPEAL_SELECT_EXTENDED);
  if (appealsResult.error && /review_mode|video_id|daily_report_id|trigger_reason|ocr_published_at_text|elapsed_hours|schema cache|column .* does not exist/i.test(appealsResult.error.message ?? "")) {
    appealsResult = await buildQuery(APPEAL_SELECT_LEGACY);
  }
  if (appealsResult.error) return { error: appealsResult.error };
  const appeals = (appealsResult.data ?? []) as unknown as AppealRow[];
  if (appeals.length === 0) return { rows: [] };

  const userIds = Array.from(new Set(appeals.flatMap((row) => [row.user_id, row.handler_id]).filter((id): id is string => Boolean(id))));
  const accountIds = Array.from(new Set(appeals.map((row) => row.account_id).filter((id): id is string => Boolean(id))));
  const videoIds = Array.from(new Set(appeals.map((row) => row.video_id).filter((id): id is string => Boolean(id))));
  const [profilesResult, accountsResult, absenceResult, videosResult] = await Promise.all([
    input.supabase.from("profiles").select("id, name").in("id", userIds),
    accountIds.length > 0 ? input.supabase.from("accounts").select("id, name").in("id", accountIds) : Promise.resolve({ data: [], error: null }),
    input.supabase.from("fulfillment_records").select("user_id, record_date").in("user_id", Array.from(new Set(appeals.map((row) => row.user_id)))).eq("status", "absent"),
    videoIds.length > 0 ? input.supabase.from("videos").select("id, video_title, published_at, uploaded_at").in("id", videoIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error || accountsResult.error || absenceResult.error) {
    return { error: profilesResult.error ?? accountsResult.error ?? absenceResult.error };
  }

  const profiles = profilesResult.data ?? [];
  const accountRows = accountsResult.data ?? [];
  const videoRows = (videosResult.error ? [] : videosResult.data ?? []) as Array<{
    id: string;
    video_title: string | null;
    published_at: string | null;
    uploaded_at: string | null;
  }>;
  const nameOf = (id: string) => profiles.find((row) => row.id === id)?.name ?? null;
  const accountNameOf = (id: string) => accountRows.find((row) => row.id === id)?.name ?? null;
  const videoOf = (id: string | null | undefined) => (id ? videoRows.find((row) => row.id === id) ?? null : null);
  const absentKeys = new Set((absenceResult.data ?? []).map((row) => `${row.user_id}:${row.record_date}`));

  return {
    rows: appeals.map((row) => {
      const reviewMode: "pre_submit" | "post_submit" = row.review_mode === "post_submit" ? "post_submit" : "pre_submit";
      const payload = row.submission_payload ?? null;
      const linkedVideo = videoOf(row.video_id);
      const triggerReason = row.trigger_reason === "manual_published_at" || row.trigger_reason === "expired"
        ? row.trigger_reason
        : payload?.published_at_source === "manual"
          ? "manual_published_at"
          : payload?.mode === "create"
            ? "expired"
            : null;
      const ocrPublishedAtText = row.ocr_published_at_text
        ?? (typeof payload?.ocr_published_at_text === "string" ? payload.ocr_published_at_text : null);
      const payloadMetrics = payload?.metrics && typeof payload.metrics === "object"
        ? (payload.metrics as Record<string, unknown>)
        : null;
      const playCount = readNumberField(payload?.play_count) ?? readNumberField(payloadMetrics?.play_count);
      return {
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
        appeal_type: appealType(payload),
        business_date: row.record_date,
        attachment_urls: attachmentUrls(payload),
        attachments: attachmentUrls(payload),
        absence_days: absentKeys.has(`${row.user_id}:${row.record_date}`) ? 1 : 0,
        rejection_reason: row.status === "rejected" ? row.decision_reason ?? null : null,
        resumePending: deriveResumePending(row.status, payload, reviewMode),
        published_at_source: payload?.published_at_source === "manual" ? "manual" : payload?.published_at_source === "ocr" ? "ocr" : null,
        ocr_published_at_text: ocrPublishedAtText,
        appeal_trigger_reason: triggerReason,
        review_mode: reviewMode,
        video_id: row.video_id ?? (typeof payload?.video_id === "string" ? payload.video_id : null),
        daily_report_id: row.daily_report_id ?? (typeof payload?.daily_report_id === "string" ? payload.daily_report_id : null),
        video_title: linkedVideo?.video_title ?? (typeof payload?.video_title === "string" ? payload.video_title : null),
        play_count: playCount,
        published_at: linkedVideo?.published_at ?? (typeof payload?.published_at === "string" ? payload.published_at : null),
        uploaded_at: linkedVideo?.uploaded_at ?? (typeof payload?.uploaded_at === "string" ? payload.uploaded_at : null),
        elapsed_hours: readNumberField(row.elapsed_hours) ?? readNumberField(payload?.elapsed_hours),
        source: "fulfillment_appeal" as const,
      };
    }),
  };
}
