import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { requireAdminActor, toObject, toTrimmedString } from "@/app/api/admin/ai-assistant/_shared";
import { assertToolIsWhitelisted, shouldRequireConfirmation, type AdminAiToolName } from "@/lib/admin-ai/core";
import { executeAdminTool } from "@/lib/admin-tools";

type ActionType = "query" | "modify" | "delete" | "retry_task" | "config_change" | "diagnosis";
type ActionCategory = "user_management" | "data_correction" | "task_management" | "config" | "diagnosis";
type AdminActorResult = Awaited<ReturnType<typeof requireAdminActor>>;

type ExecuteToolBody = {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  confirmationToken?: string;
};

type PendingActionRow = {
  id: string;
  admin_id: string;
  tool_name: string;
  tool_params: Record<string, unknown> | null;
  requires_confirmation: boolean;
  result: string;
};

type RouteDeps = {
  requireAdminActor: typeof requireAdminActor;
  executeAdminTool: typeof executeAdminTool;
  shouldRequireConfirmation: typeof shouldRequireConfirmation;
};

const TOOL_META: Record<
  AdminAiToolName,
  { actionType: ActionType; actionCategory: ActionCategory; targetType: string; description: string }
> = {
  getUserInfo: { actionType: "query", actionCategory: "user_management", targetType: "user", description: "查看成员信息" },
  getAnomalousData: { actionType: "query", actionCategory: "data_correction", targetType: "metrics", description: "查看异常数据" },
  getTaskStatus: { actionType: "query", actionCategory: "task_management", targetType: "task", description: "查看任务状态" },
  kickUser: { actionType: "delete", actionCategory: "user_management", targetType: "user", description: "移出成员" },
  changeUserRole: { actionType: "modify", actionCategory: "user_management", targetType: "user", description: "修改成员角色" },
  updateUserPermissions: { actionType: "modify", actionCategory: "user_management", targetType: "user", description: "修改成员权限" },
  deleteMetrics: { actionType: "delete", actionCategory: "data_correction", targetType: "video_metrics", description: "删除错误数据" },
  fillMissingData: { actionType: "modify", actionCategory: "data_correction", targetType: "video_metrics", description: "补填数据" },
  grantExemption: { actionType: "modify", actionCategory: "data_correction", targetType: "exemption", description: "设置豁免" },
  retryContentBreakdown: { actionType: "retry_task", actionCategory: "task_management", targetType: "task", description: "重跑内容拆解" },
  retryDailyReview: { actionType: "retry_task", actionCategory: "task_management", targetType: "task", description: "重跑次日复盘" },
  clearCache: { actionType: "config_change", actionCategory: "config", targetType: "cache", description: "清理缓存" },
  diagnoseIssue: { actionType: "diagnosis", actionCategory: "diagnosis", targetType: "issue", description: "诊断问题" },
};

function isAuthError(result: AdminActorResult): result is Extract<AdminActorResult, { error: string; status: 401 | 403 }> {
  return "error" in result;
}

function buildTargetId(params: Record<string, unknown>) {
  const keys = ["userId", "metricsId", "contentItemId", "taskType", "date"] as const;
  for (const key of keys) {
    const value = toTrimmedString(params[key]);
    if (value) return value;
  }
  return null;
}

function buildRiskContext(params: Record<string, unknown>) {
  const rawCacheType = toTrimmedString(params.cacheType);
  const cacheType =
    rawCacheType && ["all", "user_metrics", "leaderboard", "analytics"].includes(rawCacheType)
      ? (rawCacheType as "all" | "user_metrics" | "leaderboard" | "analytics")
      : undefined;

  return {
    batch: Array.isArray(params.userIds) || Array.isArray(params.videoIds),
    cacheType,
  };
}

async function insertActionLog(input: {
  auth: Extract<AdminActorResult, { supabase: AdminActorResult["supabase"]; actor: AdminActorResult["actor"] }>;
  toolName: AdminAiToolName;
  toolArgs: Record<string, unknown>;
  requiresConfirmation: boolean;
  result: "pending_confirm" | "success" | "failed";
  backupSql?: string | null;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  errorMessage?: string | null;
  executedAt?: string | null;
  confirmedAt?: string | null;
}) {
  const meta = TOOL_META[input.toolName];
  const conversationId = randomUUID();
  return input.auth.supabase
    .from("admin_actions")
    .insert({
      conversation_id: conversationId,
      admin_id: input.auth.actor.userId,
      action_type: meta.actionType,
      action_category: meta.actionCategory,
      target_type: meta.targetType,
      target_id: buildTargetId(input.toolArgs),
      description: meta.description,
      ai_reasoning: "manual_execute_tool",
      tool_name: input.toolName,
      tool_params: input.toolArgs,
      requires_confirmation: input.requiresConfirmation,
      result: input.result,
      backup_sql: input.backupSql ?? null,
      before_snapshot: input.beforeSnapshot ?? null,
      after_snapshot: input.afterSnapshot ?? null,
      error_message: input.errorMessage ?? null,
      confirmed_by: input.confirmedAt ? input.auth.actor.userId : null,
      confirmed_at: input.confirmedAt ?? null,
      executed_at: input.executedAt ?? null,
    })
    .select("id")
    .single<{ id: string }>();
}

async function loadPendingAction(
  auth: Extract<AdminActorResult, { supabase: AdminActorResult["supabase"]; actor: AdminActorResult["actor"] }>,
  confirmationToken: string,
) {
  const { data, error } = await auth.supabase
    .from("admin_actions")
    .select("id, admin_id, tool_name, tool_params, requires_confirmation, result")
    .eq("id", confirmationToken)
    .single<PendingActionRow>();

  if (error || !data) {
    return null;
  }

  if (auth.actor.businessRole !== "owner" && data.admin_id !== auth.actor.userId) {
    return null;
  }

  return data;
}

export async function buildExecuteToolResponse(
  input: ExecuteToolBody,
  deps: RouteDeps = {
    requireAdminActor,
    executeAdminTool,
    shouldRequireConfirmation,
  },
) {
  const auth = await deps.requireAdminActor();
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const confirmationToken = toTrimmedString(input.confirmationToken);
  if (confirmationToken) {
    const pendingAction = await loadPendingAction(auth, confirmationToken);
    if (!pendingAction) {
      return NextResponse.json({ error: "确认记录不存在" }, { status: 404 });
    }

    if (pendingAction.result !== "pending_confirm" || pendingAction.requires_confirmation !== true) {
      return NextResponse.json({ error: "当前确认记录不可执行" }, { status: 400 });
    }

    assertToolIsWhitelisted(pendingAction.tool_name);
    const toolName = pendingAction.tool_name as AdminAiToolName;
    const toolArgs = toObject(pendingAction.tool_params);
    const executedAt = new Date().toISOString();

    const runResult = await deps.executeAdminTool({
      toolName,
      params: toolArgs,
      context: {
        actorId: auth.actor.userId,
        actorRole: auth.actor.role,
        actorBusinessRole: auth.actor.businessRole,
        actorPermissions: auth.actor.permissions,
      },
    });

    const { error } = await auth.supabase
      .from("admin_actions")
      .update({
        result: runResult.success ? "success" : "failed",
        after_snapshot: runResult.afterSnapshot ?? null,
        error_message: runResult.success ? null : runResult.error ?? "执行失败",
        confirmed_by: auth.actor.userId,
        confirmed_at: executedAt,
        executed_at: executedAt,
      })
      .eq("id", confirmationToken);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: runResult.success,
      result: runResult.data ?? runResult.affectedData ?? null,
      error: runResult.success ? null : runResult.error ?? "执行失败",
    });
  }

  const rawToolName = toTrimmedString(input.toolName);
  if (!rawToolName) {
    return NextResponse.json({ error: "缺少 toolName" }, { status: 400 });
  }

  try {
    assertToolIsWhitelisted(rawToolName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "工具不在白名单内";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const toolName = rawToolName as AdminAiToolName;
  const toolArgs = toObject(input.toolArgs);
  const requiresConfirmation = deps.shouldRequireConfirmation(toolName, buildRiskContext(toolArgs));

  if (requiresConfirmation) {
    const dryRunResult = await deps.executeAdminTool({
      toolName,
      params: toolArgs,
      dryRun: true,
      context: {
        actorId: auth.actor.userId,
        actorRole: auth.actor.role,
        actorBusinessRole: auth.actor.businessRole,
        actorPermissions: auth.actor.permissions,
      },
    });

    if (!dryRunResult.success) {
      return NextResponse.json({
        success: false,
        result: null,
        error: dryRunResult.error ?? "预检查失败",
      });
    }

    const { data, error } = await insertActionLog({
      auth,
      toolName,
      toolArgs,
      requiresConfirmation: true,
      result: "pending_confirm",
      backupSql: dryRunResult.backupSql ?? null,
      beforeSnapshot: dryRunResult.beforeSnapshot ?? null,
      errorMessage: null,
    });

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "写入 admin_actions 失败" }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: false,
        result: {
          preview: dryRunResult.data ?? dryRunResult.affectedData ?? null,
          beforeSnapshot: dryRunResult.beforeSnapshot ?? null,
          backupSql: dryRunResult.backupSql ?? null,
        },
        error: "该工具需要二次确认",
        confirmationToken: data.id,
      },
      { status: 409 },
    );
  }

  const runResult = await deps.executeAdminTool({
    toolName,
    params: toolArgs,
    context: {
      actorId: auth.actor.userId,
      actorRole: auth.actor.role,
      actorBusinessRole: auth.actor.businessRole,
      actorPermissions: auth.actor.permissions,
    },
  });

  const executedAt = new Date().toISOString();
  const { error } = await insertActionLog({
    auth,
    toolName,
    toolArgs,
    requiresConfirmation: false,
    result: runResult.success ? "success" : "failed",
    backupSql: runResult.backupSql ?? null,
    beforeSnapshot: runResult.beforeSnapshot ?? null,
    afterSnapshot: runResult.afterSnapshot ?? null,
    errorMessage: runResult.success ? null : runResult.error ?? "执行失败",
    executedAt,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: runResult.success,
    result: runResult.data ?? runResult.affectedData ?? null,
    error: runResult.success ? null : runResult.error ?? "执行失败",
  });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = toObject(await request.json());
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  return buildExecuteToolResponse({
    toolName: toTrimmedString(body.toolName),
    toolArgs: toObject(body.toolArgs),
    confirmationToken: toTrimmedString(body.confirmationToken),
  });
}
