import { NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";

const SNAPSHOT_SELECT =
  "play_count, bounce_rate_2s, completion_rate_5s, completion_rate, avg_play_duration, follower_gain";

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

  // 找同账号"上一条已下发"的反馈卡（sent 或 viewed）
  // 先取该账号发布时间早于当前视频的所有视频 id
  const { data: olderVideos } = await supabase
    .from("videos")
    .select("id, published_at")
    .eq("lifecycle_state", "active")
    .eq("account_id", video.account_id)
    .neq("id", videoId)
    .lt("published_at", video.published_at)
    .order("published_at", { ascending: false });

  const olderVideoIds = (olderVideos ?? []).map((v: { id: string }) => v.id);
  if (olderVideoIds.length === 0) {
    return NextResponse.json({ has_previous: false });
  }

  // 找其中已下发的反馈卡（最近一条）
  const { data: prevCard } = await supabase
    .from("content_feedback_cards")
    .select("id, video_id, card_status, sent_at, confirmed_payload")
    .in("video_id", olderVideoIds)
    .in("card_status", ["sent", "viewed"])
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!prevCard) {
    return NextResponse.json({ has_previous: false });
  }

  type CardRow = {
    id: string;
    video_id: string;
    card_status: string;
    sent_at: string | null;
    confirmed_payload: Record<string, unknown> | null;
  };
  const card = prevCard as CardRow;

  // 取那条视频的 24h 快照关键指标
  const { data: snap } = await supabase
    .from("video_metrics_snapshots")
    .select(SNAPSHOT_SELECT)
    .eq("video_id", card.video_id)
    .eq("snapshot_type", "24h")
    .maybeSingle();

  const one_line =
    (card.confirmed_payload?.summary as { one_line?: string } | undefined)?.one_line ?? null;

  return NextResponse.json({
    has_previous: true,
    previous: {
      card_id: card.id,
      one_line,
      sent_at: card.sent_at,
      metrics: snap ?? null,
    },
  });
}
