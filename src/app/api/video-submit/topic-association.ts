import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * V3 日报提交与选题关联：
 * - 只要求选题真实存在且仍在选题库（in_library），允许多人同时写同一题；
 * - 不再要求提交者必须先「认领/进入脚本」，排他认领已废除；
 * - 伪造不存在的选题 ID、关联已移出选题都会被拒绝。
 */
export async function validateTopicForSubmission(
  supabase: SupabaseClient,
  topicId: string | null,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!topicId) return { ok: true };

  const { data: topic, error } = await supabase
    .from("sub_topics")
    .select("id, library_status")
    .eq("id", topicId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, message: error.message };
  if (!topic) return { ok: false, status: 404, message: "所选选题不存在" };
  if ((topic as { library_status?: string }).library_status === "removed") {
    return { ok: false, status: 409, message: "该选题已被移出选题库，不能关联提交" };
  }
  return { ok: true };
}

/** 提交成功后结束该用户对该选题的正在写状态（幂等；失败由调用方记录，不阻断提交结果）。 */
export async function completeWritingOnSubmission(
  supabase: SupabaseClient,
  userId: string,
  topicId: string | null,
  videoId: string,
): Promise<{ ended: boolean }> {
  if (!topicId) return { ended: false };
  const { data, error } = await supabase
    .from("sub_topic_claims")
    .update({ status: "completed", ended_at: new Date().toISOString(), completed_video_id: videoId })
    .eq("sub_topic_id", topicId)
    .eq("user_id", userId)
    .eq("status", "writing")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`结束写作状态失败：${error.message}`);
  return { ended: Boolean(data) };
}
