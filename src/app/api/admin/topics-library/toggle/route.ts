import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { toggleTopicLibrary, type TopicLibraryToggleAction } from "@/lib/topics/library";
import { isUuidLike } from "@/lib/topics/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToggleRouteDependencies = {
  requireActor?: typeof requireAdminActor;
  createAdmin?: typeof createAdminClient;
  toggle?: typeof toggleTopicLibrary;
};

export async function handleTopicsLibraryToggle(
  request: NextRequest,
  dependencies: ToggleRouteDependencies = {},
) {
  const auth = await (dependencies.requireActor ?? requireAdminActor)({ requiredPermission: "review_content" });
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
  if (!isUuidLike(subTopicId)) {
    return NextResponse.json({ error: "选题 ID 格式不正确" }, { status: 400 });
  }
  if (action !== "remove" && action !== "restore") {
    return NextResponse.json({ error: "action 只能是 remove 或 restore" }, { status: 400 });
  }

  if (!auth.actor.teamId) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const admin = (dependencies.createAdmin ?? createAdminClient)();
  const { data: target, error: targetError } = await admin
    .from("sub_topics")
    .select("created_by")
    .eq("id", subTopicId)
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: "查询选题失败" }, { status: 500 });
  if (!target) return NextResponse.json({ error: "选题不存在" }, { status: 404 });
  const { data: creator, error: creatorError } = await admin
    .from("profiles")
    .select("team_id")
    .eq("id", (target as { created_by: string }).created_by)
    .maybeSingle();
  if (creatorError) return NextResponse.json({ error: "查询选题所属团队失败" }, { status: 500 });
  if (!creator || (creator as { team_id?: string | null }).team_id !== auth.actor.teamId) {
    return NextResponse.json({ error: "无权管理其他团队的选题" }, { status: 403 });
  }

  const result = await (dependencies.toggle ?? toggleTopicLibrary)(admin, {
    subTopicId,
    action: action as TopicLibraryToggleAction,
    actorId: auth.actor.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, topic: result.value });
}

export async function POST(request: NextRequest) {
  return handleTopicsLibraryToggle(request);
}
