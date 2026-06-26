import { NextRequest, NextResponse } from "next/server";

import { requireAdminActor, toObject, toTrimmedString } from "@/app/api/admin/auth-helper";
import { assertToolIsWhitelisted, shouldRequireConfirmation, type AdminAiToolName } from "@/lib/admin-ai/core";
import { aggregateDashboardAlerts } from "@/lib/alert-sources/aggregator";
import type { Alert, DashboardAlertScope, SuggestedAction } from "@/lib/alert-sources/types";
import { executeAdminTool } from "@/lib/admin-tools";
import { buildDataAccessScope, type DataAccessScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminActorResult = Awaited<ReturnType<typeof requireAdminActor>>;

type RouteContext = {
  params: Promise<{ alertId: string }>;
};

type ExecuteRequestBody = {
  toolName: string;
  toolArgs?: Record<string, unknown>;
};

type RouteDeps = {
  requireAdminActor: typeof requireAdminActor;
  createAdminClient: typeof createAdminClient;
  buildDataAccessScope: typeof buildDataAccessScope;
  aggregateDashboardAlerts: typeof aggregateDashboardAlerts;
  executeAdminTool: typeof executeAdminTool;
  shouldRequireConfirmation: typeof shouldRequireConfirmation;
};

function isAuthError(result: AdminActorResult): result is Extract<AdminActorResult, { error: string; status: 401 | 403 }> {
  return "error" in result;
}

function toDashboardScope(scope: DataAccessScope): DashboardAlertScope | null {
  if (scope.businessRole !== "owner" && scope.businessRole !== "team_admin") {
    return null;
  }

  return {
    actorUserId: scope.userId,
    businessRole: scope.businessRole,
    teamId: scope.teamId,
    visibleUserIds: scope.visibleUserIds,
  };
}

async function resolveScope(
  auth: Extract<AdminActorResult, { actor: { userId: string } }>,
  deps: RouteDeps,
): Promise<{ supabase: ReturnType<typeof createAdminClient>; scope: DashboardAlertScope } | null> {
  const supabase = deps.createAdminClient();
  const rawScope = await deps.buildDataAccessScope(supabase, auth.actor.userId);
  if (!rawScope) {
    return null;
  }

  const scope = toDashboardScope(rawScope);
  if (!scope) {
    return null;
  }

  if (scope.businessRole === "team_admin" && !scope.teamId) {
    return null;
  }

  return { supabase, scope };
}

function isExecuteAction(action: SuggestedAction): action is SuggestedAction & {
  type: "execute_tool";
  toolName: string;
  toolArgs?: Record<string, unknown>;
} {
  return action.type === "execute_tool" && typeof action.toolName === "string" && action.toolName.trim().length > 0;
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = normalizeValue(record[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function areToolArgsEqual(left: Record<string, unknown> | undefined, right: Record<string, unknown> | undefined) {
  return JSON.stringify(normalizeValue(left ?? {})) === JSON.stringify(normalizeValue(right ?? {}));
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

function findMatchedAction(alert: Alert, body: ExecuteRequestBody) {
  const executeActions = alert.suggestedActions.filter(isExecuteAction);
  const candidates = executeActions.filter((action) => action.toolName === body.toolName);

  if (candidates.length === 0) {
    return { error: "该告警不允许执行这个工具", status: 400 as const };
  }

  if (!body.toolArgs) {
    if (candidates.length > 1) {
      return { error: "同一工具存在多个候选动作，请传入准确 toolArgs", status: 400 as const };
    }
    return { action: candidates[0] };
  }

  const exactMatches = candidates.filter((action) => areToolArgsEqual(action.toolArgs, body.toolArgs));
  if (exactMatches.length !== 1) {
    return { error: "toolArgs 与告警登记不一致", status: 400 as const };
  }

  return { action: exactMatches[0] };
}

export async function buildExecuteDashboardAlertResponse(
  input: { alertId: string; body: ExecuteRequestBody },
  deps: RouteDeps = {
    requireAdminActor,
    createAdminClient,
    buildDataAccessScope,
    aggregateDashboardAlerts,
    executeAdminTool,
    shouldRequireConfirmation,
  },
) {
  const auth = await deps.requireAdminActor({ requiredPermission: "view_analytics" });
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const toolName = toTrimmedString(input.body.toolName);
  if (!toolName) {
    return NextResponse.json({ error: "缺少 toolName" }, { status: 400 });
  }

  const resolved = await resolveScope(auth, deps);
  if (!resolved) {
    return NextResponse.json({ error: "仅 owner 和负责人可执行告警工具" }, { status: 403 });
  }

  try {
    const result = await deps.aggregateDashboardAlerts({
      supabase: resolved.supabase,
      scope: resolved.scope,
      now: new Date(),
    });

    const alert = result.alerts.find((item) => item.id === input.alertId);
    if (!alert) {
      return NextResponse.json({ error: "告警不存在或已消失" }, { status: 404 });
    }

    const matchedAction = findMatchedAction(alert, {
      toolName,
      toolArgs: input.body.toolArgs,
    });
    if ("error" in matchedAction) {
      return NextResponse.json({ error: matchedAction.error }, { status: matchedAction.status });
    }

    const registeredToolName = matchedAction.action.toolName;
    try {
      assertToolIsWhitelisted(registeredToolName);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未注册工具，禁止执行";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const safeToolName = registeredToolName as AdminAiToolName;
    const safeToolArgs = matchedAction.action.toolArgs ?? {};

    if (deps.shouldRequireConfirmation(safeToolName, buildRiskContext(safeToolArgs))) {
      return NextResponse.json(
        {
          success: false,
          error: "该工具需要确认，不能直接一键执行，请走 AI 对话确认流程",
        },
        { status: 409 },
      );
    }

    const toolResult = await deps.executeAdminTool({
      toolName: safeToolName,
      params: safeToolArgs,
      context: {
        actorId: auth.actor.userId,
        actorRole: auth.actor.role,
        actorBusinessRole: auth.actor.businessRole,
        actorPermissions: auth.actor.permissions,
      },
    });

    if (!toolResult.success) {
      return NextResponse.json({
        success: false,
        error: toolResult.error ?? "执行失败",
      });
    }

    return NextResponse.json({
      success: true,
      result: toolResult.data ?? toolResult.affectedData ?? null,
    });
  } catch (error) {
    console.error("[dashboard-alerts][execute] 执行异常", error);
    const message = error instanceof Error ? error.message : "执行失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  let body: Record<string, unknown>;
  try {
    body = toObject(await request.json());
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const { alertId } = await context.params;
  return buildExecuteDashboardAlertResponse({
    alertId,
    body: {
      toolName: toTrimmedString(body.toolName),
      toolArgs: toObject(body.toolArgs),
    },
  });
}
