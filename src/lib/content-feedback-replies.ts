import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContentFeedbackCard, ContentFeedbackReplyStatus } from "@/types";

export class FeedbackReplyFailure extends Error {
  readonly status: number;

  constructor(message: string, status: number, cause: unknown) {
    super(message, { cause });
    this.name = "FeedbackReplyFailure";
    this.status = status;
  }
}

const SAFE_FEEDBACK_REPLY_FAILURES = new Map<string, { message: string; status: number }>([
  ["回复状态不正确", { message: "回复状态不正确", status: 400 }],
  ["回复内容不能为空", { message: "回复内容不能为空", status: 400 }],
  ["反馈卡不存在", { message: "反馈卡不存在", status: 404 }],
  ["无权限回复这张反馈卡", { message: "无权限回复这张反馈卡", status: 403 }],
  ["反馈卡还未下发，暂不能回传复盘", { message: "反馈卡还未下发，暂不能回传复盘", status: 409 }],
]);

export function buildFeedbackReplyMutation(input: {
  currentStatus: ContentFeedbackCard["card_status"];
  currentViewedAt: string | null;
  replyStatus: ContentFeedbackReplyStatus;
  replyText: string;
  actorUserId: string;
  now: string;
}) {
  return {
    card_status: input.currentStatus === "sent" ? "viewed" : input.currentStatus,
    viewed_at: input.currentViewedAt ?? input.now,
    employee_reply_status: input.replyStatus,
    employee_reply_text: input.replyText,
    employee_replied_at: input.now,
    employee_replied_by: input.actorUserId,
  };
}

export async function submitFeedbackReply(params: {
  supabase: Pick<SupabaseClient, "rpc">;
  cardId: string;
  actorUserId: string;
  replyStatus: ContentFeedbackReplyStatus;
  replyText: string;
}): Promise<ContentFeedbackCard> {
  const { supabase, cardId, actorUserId, replyStatus, replyText } = params;
  const { data, error } = await supabase.rpc("submit_feedback_card_reply", {
    p_card_id: cardId,
    p_actor_user_id: actorUserId,
    p_reply_status: replyStatus,
    p_reply_text: replyText,
  });

  const updated = Array.isArray(data) ? data[0] : data;
  if (error || !updated) {
    const safeFailure = error?.message ? SAFE_FEEDBACK_REPLY_FAILURES.get(error.message) : null;
    throw new FeedbackReplyFailure(
      safeFailure?.message ?? "提交员工复盘失败",
      safeFailure?.status ?? 500,
      error,
    );
  }

  return updated as unknown as ContentFeedbackCard;
}
