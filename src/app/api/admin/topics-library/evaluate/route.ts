import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureInternalLibraryEntry } from "@/lib/topics/library";
import { isUuidLike } from "@/lib/topics/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EvaluateRouteDependencies = {
  requireActor?: typeof requireAdminActor;
  createAdmin?: typeof createAdminClient;
  ensureEntry?: typeof ensureInternalLibraryEntry;
};

export async function handleTopicsLibraryEvaluate(
  request: NextRequest,
  dependencies: EvaluateRouteDependencies = {},
) {
  const auth = await (dependencies.requireActor ?? requireAdminActor)({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const videoId = typeof (body as { videoId?: unknown } | null)?.videoId === "string"
    ? (body as { videoId: string }).videoId
    : "";
  if (!isUuidLike(videoId)) {
    return NextResponse.json({ error: "视频 ID 格式不正确" }, { status: 400 });
  }

  try {
    if (!auth.actor.teamId) return NextResponse.json({ error: "无权限" }, { status: 403 });
    const admin = (dependencies.createAdmin ?? createAdminClient)();
    const { data: video, error: videoError } = await admin
      .from("videos")
      .select("user_id")
      .eq("id", videoId)
      .maybeSingle();
    if (videoError) return NextResponse.json({ error: "查询视频失败" }, { status: 500 });
    if (!video) return NextResponse.json({ error: "视频不存在" }, { status: 404 });
    const { data: owner, error: ownerError } = await admin
      .from("profiles")
      .select("team_id")
      .eq("id", (video as { user_id: string }).user_id)
      .maybeSingle();
    if (ownerError) return NextResponse.json({ error: "查询视频所属团队失败" }, { status: 500 });
    if (!owner || (owner as { team_id?: string | null }).team_id !== auth.actor.teamId) {
      return NextResponse.json({ error: "无权评估其他团队的视频" }, { status: 403 });
    }
    const result = await (dependencies.ensureEntry ?? ensureInternalLibraryEntry)(admin, videoId, auth.actor.teamId);
    return NextResponse.json({ ok: true, entry: result });
  } catch (error) {
    console.error("[topics-library] evaluate failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "评估入库失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleTopicsLibraryEvaluate(request);
}
