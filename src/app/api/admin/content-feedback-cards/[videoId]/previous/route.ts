import { NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";

const SNAPSHOT_SELECT =
  "play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, follower_gain";

type OlderVideoRow = {
  id: string;
  published_at: string | null;
};

type PreviousCardRow = {
  id: string;
  video_id: string;
  card_status: "draft" | "confirmed" | "sent" | "viewed";
  draft_generated_at: string | null;
  confirmed_at: string | null;
  sent_at: string | null;
  draft_payload: Record<string, unknown> | null;
  confirmed_payload: Record<string, unknown> | null;
};

type PreviousFeedbackSource = "draft" | "sent";

function readFeedbackText(
  payload: Record<string, unknown> | null,
  key: "one_line" | "message_for_member",
) {
  if (!payload) return null;
  if (key === "one_line") {
    const summary = payload.summary as { one_line?: unknown } | undefined;
    return typeof summary?.one_line === "string" ? summary.one_line : null;
  }

  const actions = payload.actions as { message_for_member?: unknown } | undefined;
  return typeof actions?.message_for_member === "string" ? actions.message_for_member : null;
}

export function selectPreviousFeedbackCard(
  olderVideos: OlderVideoRow[],
  cards: PreviousCardRow[],
) {
  const cardByVideoId = new Map(cards.map((card) => [card.video_id, card]));

  for (const video of olderVideos) {
    const card = cardByVideoId.get(video.id);
    if (!card) continue;
    const source: PreviousFeedbackSource =
      card.card_status === "sent" || card.card_status === "viewed" ? "sent" : "draft";
    const payload = card.card_status === "confirmed" || source === "sent"
      ? card.confirmed_payload ?? card.draft_payload
      : card.draft_payload ?? card.confirmed_payload;

    return {
      card,
      source,
      payload,
      recorded_at: source === "sent" ? card.sent_at : card.draft_generated_at ?? card.confirmed_at,
    };
  }

  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const supabase = access.supabase;
  const { video } = access;

  if (!video.user_id || !video.published_at) {
    return NextResponse.json({ has_previous: false });
  }

  // 找同账号上一条有记录的反馈卡：草稿用于当前复制外发流程，历史下发卡继续可复测。
  const { data: olderVideos } = await supabase
    .from("videos")
    .select("id, published_at")
    .eq("lifecycle_state", "active")
    .eq("account_id", video.account_id)
    .neq("id", videoId)
    .lt("published_at", video.published_at)
    .order("published_at", { ascending: false });

  const olderVideoRows = (olderVideos ?? []) as OlderVideoRow[];
  const olderVideoIds = olderVideoRows.map((v) => v.id);
  if (olderVideoIds.length === 0) {
    return NextResponse.json({ has_previous: false });
  }

  const { data: cards } = await supabase
    .from("content_feedback_cards")
    .select("id, video_id, card_status, draft_generated_at, confirmed_at, sent_at, draft_payload, confirmed_payload")
    .in("video_id", olderVideoIds)
    .in("card_status", ["draft", "confirmed", "sent", "viewed"]);

  const previous = selectPreviousFeedbackCard(olderVideoRows, (cards ?? []) as PreviousCardRow[]);
  if (!previous) {
    return NextResponse.json({ has_previous: false });
  }

  // 取那条视频的 24h 快照关键指标
  const { data: snap } = await supabase
    .from("video_metrics_snapshots")
    .select(SNAPSHOT_SELECT)
    .eq("video_id", previous.card.video_id)
    .eq("snapshot_type", "24h")
    .maybeSingle();

  return NextResponse.json({
    has_previous: true,
    previous: {
      card_id: previous.card.id,
      source: previous.source,
      recorded_at: previous.recorded_at,
      sent_at: previous.card.sent_at,
      one_line: readFeedbackText(previous.payload, "one_line"),
      message_for_member: readFeedbackText(previous.payload, "message_for_member"),
      metrics: snap ?? null,
    },
  });
}
