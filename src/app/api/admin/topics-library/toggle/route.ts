import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { toggleTopicLibrary, type TopicLibraryToggleAction } from "@/lib/topics/library";
import { isUuidLike } from "@/lib/topics/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToggleRouteDependencies = {
  requireActor?: typeof requireAdminActor;
  createAdmin?: typeof createAdminClient;
  toggle?: typeof toggleTopicLibrary;
  buildScope?: typeof buildDataAccessScope;
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

  const admin = (dependencies.createAdmin ?? createAdminClient)();
  const scope = await (dependencies.buildScope ?? buildDataAccessScope)(admin, auth.actor.userId);
  if (!scope) return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  const { data: target, error: targetError } = await admin
    .from("sub_topics")
    .select("created_by")
    .eq("id", subTopicId)
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: "查询选题失败" }, { status: 500 });
  if (!target) return NextResponse.json({ error: "选题不存在" }, { status: 404 });
  const creatorId = (target as { created_by: string }).created_by;
  const activeVisibleUserIds = scope.activeVisibleUserIds ?? scope.visibleUserIds;
  if (!activeVisibleUserIds.includes(creatorId)) {
    return NextResponse.json({ error: "无权管理当前范围外的选题" }, { status: 403 });
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
