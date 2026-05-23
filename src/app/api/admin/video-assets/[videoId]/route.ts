import { NextRequest, NextResponse } from "next/server";

import { requireScopedAdminVideo, type ScopedAdminVideoAccess } from "@/lib/admin-scoped-video";
import { buildVideoAssetRecord } from "@/lib/video-asset-library";
import type { VideoAssetLevel } from "@/types";

type PatchBody = {
  asset_level?: VideoAssetLevel | null;
  asset_note?: string | null;
};

function normalizeAssetLevel(value: unknown): VideoAssetLevel | null | undefined {
  if (value === null) return null;
  return value === "S" || value === "A" || value === "B" || value === "C" ? value : undefined;
}

function normalizeAssetNote(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

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
  request: NextRequest,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/videos" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const hasLevel = Object.prototype.hasOwnProperty.call(body, "asset_level");
  const hasNote = Object.prototype.hasOwnProperty.call(body, "asset_note");
  if (!hasLevel && !hasNote) {
    return NextResponse.json({ error: "至少传 asset_level 或 asset_note 其中一个字段" }, { status: 400 });
  }

  const assetLevel = hasLevel ? normalizeAssetLevel(body.asset_level) : undefined;
  if (hasLevel && assetLevel === undefined) {
    return NextResponse.json({ error: "asset_level 只能是 S/A/B/C 或 null" }, { status: 400 });
  }

  const assetNote = hasNote ? normalizeAssetNote(body.asset_note) : undefined;
  if (hasNote && assetNote === undefined) {
    return NextResponse.json({ error: "asset_note 只能是字符串或 null" }, { status: 400 });
  }

  const { error } = await access.supabase
    .from("videos")
    .update({
      ...(hasLevel ? { asset_level: assetLevel } : {}),
      ...(hasNote ? { asset_note: assetNote } : {}),
      asset_reviewed_by: access.actor.userId,
      asset_reviewed_at: new Date().toISOString(),
    })
    .eq("id", videoId);

  if (error) {
    return NextResponse.json({ error: error.message || "更新素材资料失败" }, { status: 500 });
  }

  const refreshed = await requireScopedAdminVideo({ videoId, pathname: "/admin/videos" });
  if ("error" in refreshed) {
    return NextResponse.json({ error: refreshed.error }, { status: refreshed.status });
  }

  return NextResponse.json({
    ok: true,
    video_id: videoId,
    asset: await buildAssetResponse(refreshed),
  });
}
