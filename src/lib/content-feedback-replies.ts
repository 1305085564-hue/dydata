import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContentFeedbackCard, ContentFeedbackReplyStatus } from "@/types";

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
    throw new Error(error?.message || "更新反馈卡回传状态失败");
  }

  return updated as unknown as ContentFeedbackCard;
}
