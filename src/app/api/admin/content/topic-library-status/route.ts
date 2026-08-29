import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVideoTopicLibraryStatuses } from "@/lib/topics/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_VIDEO_IDS = 400;

export async function GET(request: NextRequest) {
  const auth = await requireAdminActor({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rawIds = request.nextUrl.searchParams.get("videoIds") ?? "";
  const videoIds = rawIds.split(",").map((id) => id.trim()).filter(Boolean);
  if (!videoIds.length) {
    return NextResponse.json({ statuses: {} });
  }
  if (videoIds.length > MAX_VIDEO_IDS) {
    return NextResponse.json({ error: "单次最多查询 400 个视频" }, { status: 400 });
  }

  try {
    const adminSupabase = createAdminClient();
    const videoRows: Array<{ id: string; topic_id: string | null }> = [];
    for (let index = 0; index < videoIds.length; index += 150) {
      const batch = videoIds.slice(index, index + 150);
      const { data, error } = await adminSupabase
        .from("videos")
        .select("id, topic_id")
        .in("id", batch);
      if (error) throw new Error(error.message);
      if (data?.length) videoRows.push(...(data as Array<{ id: string; topic_id: string | null }>));
    }
    const statuses = await resolveVideoTopicLibraryStatuses(adminSupabase, videoRows);
    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("[topics-library] status resolve failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "加载选题库状态失败" }, { status: 500 });
  }
}
