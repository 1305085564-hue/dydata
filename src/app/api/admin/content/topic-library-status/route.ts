import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { buildDataAccessScope } from "@/lib/data-access-scope";
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
  return resolveStatusesResponse(rawIds ? rawIds.split(",") : [], auth.actor.userId);
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

  return resolveStatusesResponse(payload, auth.actor.userId);
}

async function resolveStatusesResponse(input: unknown, actorUserId: string) {
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
    const scope = await buildDataAccessScope(adminSupabase, actorUserId);
    if (!scope) return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });

    const videoRows: Array<{ id: string; topic_id: string | null }> = [];
    for (let index = 0; index < videoIds.length; index += 150) {
      const batch = videoIds.slice(index, index + 150);
      const { data, error } = await adminSupabase
        .from("videos")
        .select("id, topic_id, user_id, accounts!inner(profile_id)")
        .in("id", batch);
      if (error) throw new Error(error.message);
      if (data?.length) {
        for (const row of data as Array<{
          id: string;
          topic_id: string | null;
          user_id: string | null;
          accounts?: Array<{ profile_id: string | null }> | null;
        }>) {
          const ownerId = row.accounts?.[0]?.profile_id ?? row.user_id;
          if (scope.kind === "all" || (ownerId && scope.visibleUserIds.includes(ownerId))) {
            videoRows.push({ id: row.id, topic_id: row.topic_id });
          }
        }
      }
    }
    const statuses = await resolveVideoTopicLibraryStatuses(adminSupabase, videoRows);
    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("[topics-library] status resolve failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "加载选题库状态失败" }, { status: 500 });
  }
}
