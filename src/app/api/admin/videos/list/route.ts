import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/ai-assistant/_shared";
import { buildDataAccessScope, filterRowsByDataScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";

const VIDEO_SELECT =
  "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, created_at, accounts!inner(name, profile_id), profiles!inner(name)";

function parseView(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") ?? "pending";
  return view === "all" || view === "pending" ? view : null;
}

export async function GET(request: NextRequest) {
  const view = parseView(request);
  if (!view) {
    return NextResponse.json({ error: "view 只能是 pending 或 all" }, { status: 400 });
  }

  const auth = await requireAdminActor({ requiredPermission: "view_analytics" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createAdminClient();
  const scope = await buildDataAccessScope(supabase, auth.actor.userId);
  if (!scope) {
    return NextResponse.json({ error: "用户信息不存在" }, { status: 403 });
  }
  const [{ data: videos, error: videosError }, { data: snapshots }, { data: videoTags }] = await Promise.all([
    supabase
      .from("videos")
      .select(VIDEO_SELECT)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.from("video_metrics_snapshots").select("*"),
    supabase.from("video_tags").select("*"),
  ]);

  if (videosError) {
    return NextResponse.json({ error: videosError.message }, { status: 500 });
  }

  const taggedVideoIds = new Set((videoTags ?? []).map((tag) => tag.video_id as string));
  const allVideos = filterRowsByDataScope(scope, videos ?? [], (video) => {
    const accounts = video.accounts as { profile_id?: string | null } | Array<{ profile_id?: string | null }> | null;
    const account = Array.isArray(accounts) ? accounts[0] : accounts;
    return account?.profile_id ?? (video.user_id as string | null);
  });
  const filteredVideos = view === "pending"
    ? allVideos.filter((video) => {
        const hasTags = taggedVideoIds.has(video.id as string);
        return !hasTags || video.anomaly_status !== "正常";
      })
    : allVideos;

  const videoIds = new Set(filteredVideos.map((video) => video.id as string));

  return NextResponse.json({
    data: filteredVideos,
    snapshots: (snapshots ?? []).filter((snapshot) => videoIds.has(snapshot.video_id as string)),
    video_tags: (videoTags ?? []).filter((tag) => videoIds.has(tag.video_id as string)),
    view,
  });
}
