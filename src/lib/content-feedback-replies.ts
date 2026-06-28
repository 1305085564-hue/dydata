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
  supabase: Pick<SupabaseClient, "from">;
  cardId: string;
  actorUserId: string;
  replyStatus: ContentFeedbackReplyStatus;
  replyText: string;
  selectClause: string;
}): Promise<ContentFeedbackCard> {
  const { supabase, cardId, actorUserId, replyStatus, replyText, selectClause } = params;
  const { data: current, error } = await supabase
    .from("content_feedback_cards")
    .select(selectClause)
    .eq("id", cardId)
    .maybeSingle();

  if (error || !current) {
    throw new Error(error?.message || "反馈卡不存在");
  }

  const card = current as unknown as ContentFeedbackCard;
  if (card.target_user_id !== actorUserId) {
    throw new Error("无权限回复这张反馈卡");
  }
  if (card.card_status !== "sent" && card.card_status !== "viewed") {
    throw new Error("反馈卡还未下发，暂不能回传复盘");
  }

  const now = new Date().toISOString();
  const mutation = buildFeedbackReplyMutation({
    currentStatus: card.card_status,
    currentViewedAt: card.viewed_at,
    replyStatus,
    replyText,
    actorUserId,
    now,
  });

  const { error: replyInsertError } = await supabase
    .from("feedback_card_replies")
    .insert({
      feedback_card_id: cardId,
      reply_status: replyStatus,
      reply_text: replyText,
      replied_by: actorUserId,
    });

  if (replyInsertError) {
    throw new Error(replyInsertError.message || "记录员工回传失败");
  }

  const { data: updated, error: updateError } = await supabase
    .from("content_feedback_cards")
    .update(mutation)
    .eq("id", cardId)
    .select(selectClause)
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message || "更新反馈卡回传状态失败");
  }

  return updated as unknown as ContentFeedbackCard;
}
