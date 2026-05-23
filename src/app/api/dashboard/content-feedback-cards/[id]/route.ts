import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildContentFeedbackCardView, CONTENT_FEEDBACK_CARD_SELECT } from "@/lib/content-feedback-cards";
import type { ContentFeedbackCard } from "@/types";

type PatchBody = {
  action?: "viewed";
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  if (body.action !== "viewed") {
    return NextResponse.json({ error: "action 只能是 viewed" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: current, error } = await supabase
    .from("content_feedback_cards")
    .select(CONTENT_FEEDBACK_CARD_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !current) {
    return NextResponse.json({ error: error?.message || "反馈卡不存在" }, { status: 404 });
  }

  const card = current as ContentFeedbackCard;
  if (card.target_user_id !== user.id) {
    return NextResponse.json({ error: "无权限查看这张反馈卡" }, { status: 403 });
  }

  if (card.card_status !== "sent" && card.card_status !== "viewed") {
    return NextResponse.json({ error: "反馈卡还未下发" }, { status: 409 });
  }

  if (card.card_status === "viewed") {
    return NextResponse.json({
      ok: true,
      feedback_card: {
        ...buildContentFeedbackCardView(card.video_id, card),
        confirmed: card.confirmed_payload,
      },
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from("content_feedback_cards")
    .update({
      card_status: "viewed",
      viewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(CONTENT_FEEDBACK_CARD_SELECT)
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message || "更新已读状态失败" }, { status: 500 });
  }

  const nextCard = updated as ContentFeedbackCard;
  return NextResponse.json({
    ok: true,
    feedback_card: {
      ...buildContentFeedbackCardView(nextCard.video_id, nextCard),
      confirmed: nextCard.confirmed_payload,
    },
  });
}
