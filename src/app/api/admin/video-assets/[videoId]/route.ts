import { NextRequest, NextResponse } from "next/server";

import { requireScopedAdminVideo, type ScopedAdminVideoAccess } from "@/lib/admin-scoped-video";
import { buildVideoAssetRecord } from "@/lib/video-asset-library";

async function buildAssetResponse(access: ScopedAdminVideoAccess) {
  const videoId = access.video.id;
  const [{ data: snapshots }, { count: tagCount }, { count: segmentCount }] = await Promise.all([
    access.supabase
      .from("video_metrics_snapshots")
      .select("video_id")
      .eq("video_id", videoId)
      .eq("snapshot_type", "24h"),
    access.supabase
      .from("video_tags")
      .select("id", { count: "exact", head: true })
      .eq("video_id", videoId),
    access.supabase
      .from("video_content_segments")
      .select("id", { count: "exact", head: true })
      .eq("video_id", videoId),
  ]);

  return buildVideoAssetRecord({
    videoId,
    videoTitle: access.video.video_title,
    content: access.video.content,
    hasSnapshot24h: (snapshots ?? []).length > 0,
    tagCount: Number(tagCount ?? 0),
    segmentCount: Number(segmentCount ?? 0),
    assetLevel: access.video.asset_level ?? null,
    assetNote: access.video.asset_note ?? null,
    assetReviewedAt: access.video.asset_reviewed_at ?? null,
    assetReviewedBy: access.video.asset_reviewed_by ?? null,
  });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/videos" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  return NextResponse.json({
    video_id: videoId,
    asset: await buildAssetResponse(access),
  });
}

export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  await context.params;
  return NextResponse.json({ error: "素材评级和备注已下线，请使用视频复盘抽屉" }, { status: 410 });
}
