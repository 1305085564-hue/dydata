import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/ai-assistant/_shared";
import { aggregateDashboardAlerts } from "@/lib/alert-sources/aggregator";
import type { Alert, DashboardAlertScope } from "@/lib/alert-sources/types";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ alertId: string }>;
};

function formatSource(source: Alert["source"]) {
  switch (source) {
    case "submission":
      return "填报系统";
    case "playback":
      return "播放数据";
    case "violation":
      return "违规复核";
    case "conversion":
      return "导粉转化";
    case "upload":
      return "数据上传";
    case "task":
      return "AI 任务";
    default:
      return "系统告警";
  }
}

function formatSeverity(severity: Alert["severity"]) {
  if (severity === "critical") return "严重";
  if (severity === "warning") return "预警";
  return "提示";
}

function formatEntities(alert: Alert) {
  if (alert.affectedEntities.length === 0) {
    return "系统级告警";
  }

  return alert.affectedEntities
    .map((entity) => `${entity.name} (id: ${entity.id})`)
    .join("，");
}

function toDashboardScope(rawScope: Awaited<ReturnType<typeof buildDataAccessScope>>): DashboardAlertScope | null {
  if (!rawScope || (rawScope.businessRole !== "owner" && rawScope.businessRole !== "team_admin")) {
    return null;
  }

  if (rawScope.businessRole === "team_admin" && !rawScope.teamId) {
    return null;
  }

  return {
    actorUserId: rawScope.userId,
    businessRole: rawScope.businessRole,
    teamId: rawScope.teamId,
    visibleUserIds: rawScope.visibleUserIds,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminActor({ requiredPermission: "view_analytics" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { alertId } = await context.params;
  const scope = toDashboardScope(await buildDataAccessScope(createAdminClient(), auth.actor.userId));
  if (!scope) {
    return NextResponse.json({ error: "仅 owner 和负责人可查看 AI 告警上下文" }, { status: 403 });
  }

  const result = await aggregateDashboardAlerts({
    supabase: createAdminClient(),
    scope,
    now: new Date(),
  });

  const alert = result.alerts.find((item) => item.id === alertId);
  if (!alert) {
    return NextResponse.json({ error: "告警不存在或已消失" }, { status: 404 });
  }

  const contextPrefix = [
    "# 当前正在咨询的告警",
    `类型：${formatSource(alert.source)}-${alert.title}`,
    `级别：${formatSeverity(alert.severity)}`,
    `涉及：${formatEntities(alert)}`,
    `详情：${alert.detail ?? "无"}`,
    "",
    "# 用户的问题：",
    "",
  ].join("\n");

  return NextResponse.json({
    alert,
    contextPrefix,
  });
}
