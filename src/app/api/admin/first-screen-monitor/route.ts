import { NextRequest, NextResponse } from "next/server";

import { ADMIN_FIRST_SCREEN_BUDGETS } from "@/lib/admin-first-screen-contract";
import { buildFirstScreenAlertText } from "@/lib/admin-first-screen-observability";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MONITORED_ROUTES = [
  { route: "/admin/content", thresholdMs: ADMIN_FIRST_SCREEN_BUDGETS.content.warnTotalMs },
  { route: "/admin/videos", thresholdMs: ADMIN_FIRST_SCREEN_BUDGETS.videos.warnTotalMs },
  { route: "/api/admin/panels/analytics", thresholdMs: ADMIN_FIRST_SCREEN_BUDGETS.analytics.warnTotalMs },
  { route: "/api/admin/sidebar-badges", thresholdMs: ADMIN_FIRST_SCREEN_BUDGETS.sidebarBadges.warnTotalMs },
] as const;

async function sendFeishuAlert(text: string) {
  const webhook = process.env.FEISHU_WEBHOOK_URL;
  if (!webhook) {
    throw new Error("FEISHU_WEBHOOK_URL not configured");
  }

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msg_type: "text",
      content: { text },
    }),
  });

  if (!response.ok) {
    throw new Error(`Feishu webhook failed: ${await response.text()}`);
  }
}

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

  const supabase = deps.createAdminClient();
  const alerts: Array<Record<string, unknown>> = [];

  for (const item of MONITORED_ROUTES) {
    const { data, error } = await supabase.rpc("admin_first_screen_perf_regressions", {
      p_route: item.route,
      p_threshold_ms: item.thresholdMs,
      p_window_minutes: 30,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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

    await deps.sendFeishuAlert(buildFirstScreenAlertText(alert));
  }

  return NextResponse.json({
    ok: true,
    checkedRoutes: MONITORED_ROUTES.length,
    coveredRoutes: MONITORED_ROUTES.map((item) => item.route),
    alerts,
  });
}

export async function GET(request: NextRequest) {
  return buildFirstScreenMonitorResponse(request);
}
