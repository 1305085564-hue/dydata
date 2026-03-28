import { NextRequest, NextResponse } from "next/server";

import { executeAdminTool } from "@/lib/admin-tools";

import { requireAdminActor, toBoolean, toTrimmedString } from "../_shared";

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, actor } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const conversationId = toTrimmedString(body.conversationId);
  const actionId = toTrimmedString(body.actionId);
  const confirmed = toBoolean(body.confirmed);

  if (!conversationId || !actionId) {
    return NextResponse.json({ error: "缺少 conversationId 或 actionId" }, { status: 400 });
  }

  const { data: action, error } = await supabase
    .from("admin_actions")
    .select("id, admin_id, conversation_id, tool_name, tool_params, result, requires_confirmation")
    .eq("id", actionId)
    .eq("conversation_id", conversationId)
    .single();

  if (error || !action) {
    return NextResponse.json({ error: "操作记录不存在" }, { status: 404 });
  }

  if (action.admin_id !== actor.userId && actor.role !== "owner") {
    return NextResponse.json({ error: "无权限确认此操作" }, { status: 403 });
  }

  if (action.result !== "pending_confirm" || action.requires_confirmation !== true) {
    return NextResponse.json({ error: "当前操作不在待确认状态" }, { status: 400 });
  }

  if (!confirmed) {
    const { error: cancelError } = await supabase
      .from("admin_actions")
      .update({
        result: "cancelled",
        confirmed_by: actor.userId,
        confirmed_at: new Date().toISOString(),
        error_message: "管理员取消执行",
      })
      .eq("id", actionId);

    if (cancelError) {
      return NextResponse.json({ error: cancelError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      actionId,
      result: { cancelled: true },
    });
  }

  const runResult = await executeAdminTool({
    toolName: action.tool_name,
    params: (action.tool_params ?? {}) as Record<string, unknown>,
    context: {
      actorId: actor.userId,
      actorRole: actor.role,
      actorPermissions: actor.permissions,
    },
  });

  const { error: updateError } = await supabase
    .from("admin_actions")
    .update({
      result: runResult.success ? "success" : "failed",
      confirmed_by: actor.userId,
      confirmed_at: new Date().toISOString(),
      executed_at: new Date().toISOString(),
      after_snapshot: runResult.afterSnapshot ?? null,
      error_message: runResult.success ? null : runResult.error ?? "执行失败",
    })
    .eq("id", actionId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: runResult.success,
    actionId,
    result: {
      success: runResult.success,
      data: runResult.data ?? null,
      error: runResult.success ? null : runResult.error ?? "执行失败",
    },
  });
}
