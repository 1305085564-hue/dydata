import { NextRequest, NextResponse } from "next/server";

import { requireAdminActor } from "../../_shared";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: Params) {
  const auth = await requireAdminActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, actor } = auth;
  const { id } = await context.params;

  let query = supabase
    .from("admin_actions")
    .select(
      "id, admin_id, action_type, action_category, target_type, target_id, description, ai_reasoning, tool_name, tool_params, backup_sql, before_snapshot, after_snapshot, result, error_message, created_at",
    )
    .eq("id", id);

  if (actor.role === "admin") {
    query = query.eq("admin_id", actor.userId);
  }

  const { data: action, error } = await query.single();

  if (error || !action) {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  }

  const { data: profile } = await supabase.from("profiles").select("id, name").eq("id", action.admin_id).single();

  return NextResponse.json({
    action: {
      id: action.id,
      adminId: action.admin_id,
      adminName: profile?.name ?? "未知管理员",
      actionType: action.action_type,
      actionCategory: action.action_category,
      targetType: action.target_type,
      targetId: action.target_id,
      description: action.description,
      aiReasoning: action.ai_reasoning,
      toolName: action.tool_name,
      toolParams: action.tool_params,
      backupSql: action.backup_sql,
      beforeSnapshot: action.before_snapshot,
      afterSnapshot: action.after_snapshot,
      result: action.result,
      errorMessage: action.error_message,
      createdAt: action.created_at,
    },
  });
}
