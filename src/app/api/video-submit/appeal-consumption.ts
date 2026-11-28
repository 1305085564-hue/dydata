import type { SupabaseClient } from "@supabase/supabase-js";

import { buildPublishedDayWindow } from "./create-conflict";
import { buildSubmissionRecordId, type NormalizedVideoSubmitPayload } from "./stability";
import { validateVideoSubmitPayload } from "./validation";

type StoredSubmission = NormalizedVideoSubmitPayload;

/** 补交申请暂存的数据解析成与提交接口同一套规范化结果；缺失或已无法通过校验时返回 null（不猜）。 */
function parseStoredSubmission(submissionPayload: unknown): StoredSubmission | null {
  if (!submissionPayload || typeof submissionPayload !== "object") return null;
  const result = validateVideoSubmitPayload(submissionPayload);
  return result.ok ? result.normalized : null;
}

/**
 * 补交资格是否覆盖本次提交的作品。
 * 作品身份用业务键：同账号 + 同标题 + 同发布日（上海自然日），与提交时的判重同一口径
 * （内容指纹含各项指标和截图，员工续交时改一个数字就变，不能拿来对账）；没有标题时退回内容指纹。
 * 暂存已清空（资格用过了）或无法解析时不覆盖，避免同账号同日的另一条超时作品借用同一份批准。
 */
export function appealCoversSubmission(
  submissionPayload: unknown,
  submitted: NormalizedVideoSubmitPayload,
): boolean {
  const stored = parseStoredSubmission(submissionPayload);
  if (!stored || stored.account_id !== submitted.account_id) return false;
  if (buildSubmissionRecordId(stored) === buildSubmissionRecordId(submitted)) return true;
  const title = stored.video_title?.trim();
  const storedDay = buildPublishedDayWindow(stored.published_at)?.start;
  return Boolean(title && storedDay)
    && title === submitted.video_title?.trim()
    && storedDay === buildPublishedDayWindow(submitted.published_at)?.start;
}

/** 找出能放行这条作品的已批准补交申请（同成员+账号+业务日，且申请的正是这条作品）。 */
export async function findApprovedAppealForSubmission(input: {
  supabase: SupabaseClient;
  userId: string;
  submitted: NormalizedVideoSubmitPayload;
}): Promise<{ appeal: { id: string; submission_payload: unknown } | null; failed: boolean }> {
  const { data, error } = await input.supabase
    .from("fulfillment_appeals")
    .select("id, submission_payload")
    .eq("user_id", input.userId)
    .eq("account_id", input.submitted.account_id)
    .eq("record_date", input.submitted.biz_date)
    .eq("status", "approved")
    .order("handled_at", { ascending: false });
  if (error) return { appeal: null, failed: true };
  const rows = (data ?? []) as Array<{ id: string; submission_payload: unknown }>;
  return { appeal: rows.find((row) => appealCoversSubmission(row.submission_payload, input.submitted)) ?? null, failed: false };
}

/**
 * 员工凭已批准的补交资格直接提交成功后，若这次提交的正是申请里暂存的那条作品，
 * 清空暂存数据：申请从"已批准·等成员补传"收口为"数据已提交"，不再提示去完成填报。
 * 不是同一条作品时不动，避免把别的作品的待续交数据清掉。
 * 员工没有补交申请表的更新权限，必须用服务端管理客户端写；失败只记日志，不影响本次提交结果。
 */
export async function consumeApprovedAppealPayload(input: {
  admin: SupabaseClient;
  appeal: { id: string; submission_payload: unknown } | null;
  submitted: NormalizedVideoSubmitPayload;
}): Promise<"cleared" | "skipped" | "failed"> {
  const { appeal } = input;
  try {
    if (!appeal || !appealCoversSubmission(appeal.submission_payload, input.submitted)) return "skipped";
    const { data, error } = await input.admin
      .from("fulfillment_appeals")
      .update({ submission_payload: null })
      .eq("id", appeal.id)
      .eq("status", "approved")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return "failed";
    return "cleared";
  } catch (error) {
    console.error(`[video-submit] appeal ${appeal?.id} 已凭资格提交，但清空暂存失败`, error);
    return "failed";
  }
}
