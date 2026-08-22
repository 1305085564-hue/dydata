import { NextRequest, NextResponse } from "next/server";

import { ADMIN_FIRST_SCREEN_BUDGETS } from "@/lib/admin-first-screen-contract";
import { buildFirstScreenAlertText } from "@/lib/admin-first-screen-observability";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError, logApiRequest, resolveRequestId } from "@/lib/api-logger";
import { sendFeishuWebhook } from "@/lib/飞书webhook";

const MONITORED_ROUTES = [
  { route: "/admin", thresholdMs: ADMIN_FIRST_SCREEN_BUDGETS.cockpit.warnTotalMs },
  { route: "/admin/content", thresholdMs: ADMIN_FIRST_SCREEN_BUDGETS.content.warnTotalMs },
  { route: "/admin/videos", thresholdMs: ADMIN_FIRST_SCREEN_BUDGETS.videos.warnTotalMs },
  { route: "/api/admin/sidebar-badges", thresholdMs: ADMIN_FIRST_SCREEN_BUDGETS.sidebarBadges.warnTotalMs },
] as const;

type NotifyResult = { ok: true } | { ok: false; reason: string };

async function sendFeishuAlert(text: string): Promise<NotifyResult> {
  const result = await sendFeishuWebhook(
    { msg_type: "text", content: { text } },
    {},
  );

  // 只报失败原因，不透传 webhook 响应体，避免泄露内部信息
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * 返回状态约定：
 * - 200：全部监控项检查完成。通知是否失败看 body.notificationFailures / notified；
 * - 500：检查本身失败（RPC 查询出错），body.failedRoutes 只含路由名，
 *   绝不透传 Supabase 原始错误。
 * 某一项查询或通知失败都会继续检查其余项，不会中断整轮监控。
 */
export async function buildFirstScreenMonitorResponse(
  request: NextRequest,
  deps: {
    createAdminClient: typeof createAdminClient;
    sendFeishuAlert: typeof sendFeishuAlert;
  } = {
    createAdminClient,
    sendFeishuAlert,
  },
) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const requestId = resolveRequestId(request);
  const supabase = deps.createAdminClient();
  const alerts: Array<Record<string, unknown>> = [];
  const checkErrors: string[] = [];
  const notificationFailures: Array<{ route: string; reason: string }> = [];

  for (const item of MONITORED_ROUTES) {
    const { data, error } = await supabase.rpc("admin_first_screen_perf_regressions", {
      p_route: item.route,
      p_threshold_ms: item.thresholdMs,
      p_window_minutes: 30,
    });
    if (error) {
      checkErrors.push(item.route);
      logApiError(
        {
          requestId,
          route: "/api/admin/first-screen-monitor",
          method: request.method,
          detail: { outcome: "rpc_failed", monitoredRoute: item.route },
        },
        new Error("首屏监控 RPC 查询失败"),
      );
      continue;
    }

    const row = Array.isArray(data) ? data[0] as {
      route?: string;
      status_code?: number;
      latest_total_ms?: number;
      consecutive_hits?: number;
    } | undefined : undefined;

    if (!row) continue;
    const hits = Number(row.consecutive_hits ?? 0);
    if (hits < 3) continue;

    const alert = {
      route: item.route,
      statusCode: Number(row.status_code ?? 0),
      latestTotalMs: Number(row.latest_total_ms ?? 0),
      thresholdMs: item.thresholdMs,
      consecutiveHits: hits,
    };
    alerts.push(alert);

    const notified = await deps.sendFeishuAlert(buildFirstScreenAlertText(alert));
    if (!notified.ok) {
      notificationFailures.push({ route: item.route, reason: notified.reason });
    }
  }

  if (checkErrors.length > 0) {
    logApiRequest({
      requestId,
      route: "/api/admin/first-screen-monitor",
      method: request.method,
      status: 500,
      outcome: "check_failed",
      detail: {
        failedRoutes: checkErrors,
        checkedRoutes: MONITORED_ROUTES.length - checkErrors.length,
        notificationFailures: notificationFailures.length,
      },
    });
    return NextResponse.json(
      {
        error: "部分监控项检查失败",
        failedRoutes: checkErrors,
        alerts,
        notificationFailures,
        checkedRoutes: MONITORED_ROUTES.length - checkErrors.length,
      },
      { status: 500 },
    );
  }

  logApiRequest({
    requestId,
    route: "/api/admin/first-screen-monitor",
    method: request.method,
    status: 200,
    outcome: notificationFailures.length > 0 ? "checked_notify_failed" : "sent",
    detail: {
      checkedRoutes: MONITORED_ROUTES.length,
      alerts: alerts.length,
      notificationFailures: notificationFailures.length,
    },
  });

  return NextResponse.json({
    ok: true,
    checkedRoutes: MONITORED_ROUTES.length,
    coveredRoutes: MONITORED_ROUTES.map((item) => item.route),
    alerts,
    notificationFailures,
    notified: notificationFailures.length === 0,
  });
}

export async function GET(request: NextRequest) {
  return buildFirstScreenMonitorResponse(request);
}
