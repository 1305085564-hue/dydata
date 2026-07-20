import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildContentFeedbackCardView, CONTENT_FEEDBACK_CARD_SELECT } from "@/lib/content-feedback-cards";
import type { ContentFeedbackCard } from "@/types";
import { scopeFeedbackCardMutation } from "../access";

type PatchBody = {
  action?: "viewed";
};

export async function GET(
  _request: NextRequest,
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

  const supabase = createAdminClient();
  const { data: card, error: cardError } = await supabase
    .from("content_feedback_cards")
    .select(CONTENT_FEEDBACK_CARD_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (cardError || !card) {
    return NextResponse.json({ error: cardError?.message || "反馈卡不存在" }, { status: 404 });
  }

  const feedbackCard = card as ContentFeedbackCard;
  if (feedbackCard.target_user_id !== user.id) {
    return NextResponse.json({ error: "无权限查看这张反馈卡" }, { status: 403 });
  }

  const { data: videoRow, error: videoError } = await supabase
    .from("videos")
    .select("id, video_title, video_url, published_at, anomaly_status, lifecycle_state, account_id, accounts(id, name)")
    .eq("id", feedbackCard.video_id)
    .maybeSingle();

  if (videoError || !videoRow) {
    return NextResponse.json({ error: videoError?.message || "原作品已永久删除" }, { status: 404 });
  }

  const { data: snapshotRow } = await supabase
    .from("video_metrics_snapshots")
    .select("play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, likes, comments")
    .eq("video_id", feedbackCard.video_id)
    .eq("snapshot_type", "24h")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const accountRel = (videoRow as { accounts?: { id: string; name: string | null } | { id: string; name: string | null }[] | null }).accounts ?? null;
  const account = Array.isArray(accountRel) ? accountRel[0] ?? null : accountRel;

  const view = buildContentFeedbackCardView(feedbackCard.video_id, feedbackCard);

  return NextResponse.json({
    ok: true,
    item: {
      video: {
        id: videoRow.id,
        video_title: videoRow.video_title ?? null,
        video_url: videoRow.video_url ?? null,
        published_at: videoRow.published_at ?? null,
        anomaly_status: videoRow.anomaly_status,
        lifecycle_state: videoRow.lifecycle_state ?? "active",
        lifecycle_label: videoRow.lifecycle_state === "trashed" ? "原作品已进入回收站" : videoRow.lifecycle_state === "purged" ? "原作品已永久删除" : null,
        snapshot: snapshotRow
          ? {
              play_count: snapshotRow.play_count ?? null,
              bounce_rate_2s: snapshotRow.bounce_rate_2s ?? null,
              completion_rate_5s: snapshotRow.completion_rate_5s ?? null,
              completion_rate: snapshotRow.completion_rate ?? null,
              avg_play_duration: snapshotRow.avg_play_duration ?? null,
              likes: snapshotRow.likes ?? null,
              comments: snapshotRow.comments ?? null,
            }
          : null,
      },
      account: account
        ? {
            id: account.id,
            name: account.name ?? null,
          }
        : null,
      feedback_card: {
        card_id: view.card_id,
        workflow_status: view.workflow_status,
        workflow_label: view.workflow_label,
        confirmed: feedbackCard.confirmed_payload,
      },
    },
  });
}

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

  const updateQuery = supabase
    .from("content_feedback_cards")
    .update({
      card_status: "viewed",
      viewed_at: new Date().toISOString(),
    });
  const { data: updated, error: updateError } = await scopeFeedbackCardMutation(updateQuery, id, user.id)
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
