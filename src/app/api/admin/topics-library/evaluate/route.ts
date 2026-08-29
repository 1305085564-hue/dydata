import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureInternalLibraryEntry } from "@/lib/topics/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const videoId = typeof (body as { videoId?: unknown } | null)?.videoId === "string"
    ? (body as { videoId: string }).videoId
    : "";
  if (!videoId) {
    return NextResponse.json({ error: "缺少视频 ID" }, { status: 400 });
  }

  try {
    const result = await ensureInternalLibraryEntry(createAdminClient(), videoId);
    return NextResponse.json({ ok: true, entry: result });
  } catch (error) {
    console.error("[topics-library] evaluate failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "评估入库失败" }, { status: 500 });
  }
}
