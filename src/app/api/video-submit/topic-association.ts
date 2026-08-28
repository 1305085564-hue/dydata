export type SubmissionTopicClaimLike = { status?: unknown } | null;

export function validateTopicClaimForSubmission(
  topicId: string | null,
  claim: SubmissionTopicClaimLike,
):
  | { ok: true }
  | { ok: false; status: 403; message: string } {
  if (!topicId || claim?.status === "scripting") return { ok: true };
  return {
    ok: false,
    status: 403,
    message: "该选题未处于当前用户的脚本中，不能关联提交",
  };
}
