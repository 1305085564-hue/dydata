import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVideoTopicLibraryStatuses } from "@/lib/topics/library";
import { parseTopicLibraryStatusVideoIds } from "./input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdminActor({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rawIds = request.nextUrl.searchParams.get("videoIds") ?? "";
  return resolveStatusesResponse(rawIds ? rawIds.split(",") : []);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求正文不是有效 JSON" }, { status: 400 });
  }

  return resolveStatusesResponse(payload);
}

async function resolveStatusesResponse(input: unknown) {
  const parsed = Array.isArray(input)
    ? parseTopicLibraryStatusVideoIds({ videoIds: input })
    : parseTopicLibraryStatusVideoIds(input);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { videoIds } = parsed;
  if (!videoIds.length) {
    return NextResponse.json({ statuses: {} });
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
