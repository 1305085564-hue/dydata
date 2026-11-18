import type { SupabaseClient } from "@supabase/supabase-js";

import { buildSubmissionRecordId } from "./stability";
import { validateVideoSubmitPayload } from "./validation";

/**
 * 补交申请暂存的数据对应哪一条作品：与提交接口同一套校验 + 稳定作品 ID。
 * 暂存数据缺失或已无法通过校验时返回 null（不猜，不清）。
 */
export function resolveAppealPayloadRecordId(submissionPayload: unknown): string | null {
  if (!submissionPayload || typeof submissionPayload !== "object") return null;
  const result = validateVideoSubmitPayload(submissionPayload);
  if (!result.ok) return null;
  return buildSubmissionRecordId(result.normalized);
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
  submittedRecordId: string;
}): Promise<"cleared" | "skipped" | "failed"> {
  const { appeal } = input;
  try {
    if (!appeal || resolveAppealPayloadRecordId(appeal.submission_payload) !== input.submittedRecordId) return "skipped";
    const { error } = await input.admin
      .from("fulfillment_appeals")
      .update({ submission_payload: null })
      .eq("id", appeal.id)
      .eq("status", "approved");
    if (error) throw error;
    return "cleared";
  } catch (error) {
    console.error(`[video-submit] appeal ${appeal?.id} 已凭资格提交，但清空暂存失败`, error);
    return "failed";
  }
}
