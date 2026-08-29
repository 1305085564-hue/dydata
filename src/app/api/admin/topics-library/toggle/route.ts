import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { toggleTopicLibrary, type TopicLibraryToggleAction } from "@/lib/topics/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const subTopicId = typeof (body as { subTopicId?: unknown }).subTopicId === "string"
    ? (body as { subTopicId: string }).subTopicId
    : "";
  const action = (body as { action?: unknown }).action;
  if (!subTopicId) {
    return NextResponse.json({ error: "缺少选题 ID" }, { status: 400 });
  }
  if (action !== "remove" && action !== "restore") {
    return NextResponse.json({ error: "action 只能是 remove 或 restore" }, { status: 400 });
  }

  const result = await toggleTopicLibrary(createAdminClient(), {
    subTopicId,
    action: action as TopicLibraryToggleAction,
    adminId: auth.actor.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, topic: result.value });
}
