import { NextRequest, NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/ai-assistant/_shared";
import { canAccessAdminPath, type AnalyticsRangePreset } from "@/lib/analytics-access";
import { formatServerTiming } from "@/lib/admin-first-screen-contract";
import { recordFirstScreenObservation } from "@/lib/admin-first-screen-observability";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { AnalyticsRangeLimitError, loadAnalyticsPageData } from "@/lib/loaders/analytics-page";

function nowMs() {
  return performance.now();
}

function readPreset(request: NextRequest): AnalyticsRangePreset {
  const value = request.nextUrl.searchParams.get("preset");
  if (value === "7d" || value === "30d" || value === "month" || value === "custom") return value;
  return "30d";
}

export async function buildAnalyticsPanelResponse(
  request: NextRequest,
  deps: {
    requireAdminActor: typeof requireAdminActor;
    getCurrentPermissionContext: typeof buildPermissionContextForActor;
    loadAnalyticsPageData: typeof loadAnalyticsPageData;
    recordObservation: typeof recordFirstScreenObservation;
  } = {
    requireAdminActor,
    getCurrentPermissionContext: buildPermissionContextForActor,
    loadAnalyticsPageData,
    recordObservation: recordFirstScreenObservation,
  },
) {
  const totalStart = nowMs();

  const authStart = nowMs();
  const auth = await deps.requireAdminActor();
  const authMs = nowMs() - authStart;
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!canAccessAdminPath("/admin/analytics", auth.actor.businessRole, auth.actor.permissions)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const contextStart = nowMs();
  const permissionContext = await deps.getCurrentPermissionContext(auth.actor);
  const contextMs = nowMs() - contextStart;
  if (!permissionContext) {
    return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  }

  const preset = readPreset(request);
  const from = request.nextUrl.searchParams.get("from") ?? undefined;
  const to = request.nextUrl.searchParams.get("to") ?? undefined;
  const dataStart = nowMs();
  let data;
  try {
    data = await deps.loadAnalyticsPageData({
      userId: auth.actor.userId,
      preset,
      from,
      to,
      permissionInfo: permissionContext.permissionInfo,
      scope: permissionContext.scope,
    });
  } catch (error) {
    if (error instanceof AnalyticsRangeLimitError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  const dataMs = nowMs() - dataStart;
  const totalMs = nowMs() - totalStart;
  const metrics = {
    auth: authMs,
    context: contextMs,
    data: dataMs,
    total: totalMs,
  };

  void deps.recordObservation({
    route: "/api/admin/panels/analytics",
    statusCode: 200,
    metrics,
    actorUserId: auth.actor.userId,
    scopeKind: permissionContext.scope.kind,
    metadata: {
      preset,
      from: from ?? null,
      to: to ?? null,
    },
  });

  return NextResponse.json(data, {
    headers: {
      "Server-Timing": formatServerTiming(metrics),
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    return await buildAnalyticsPanelResponse(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载经营分析失败" },
      { status: 500 },
    );
  }
}
