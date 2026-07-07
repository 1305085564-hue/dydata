import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { aggregateDashboardAlerts } from "@/lib/alert-sources/aggregator";
import type { AlertAggregationResult, DashboardAlertScope } from "@/lib/alert-sources/types";
import { buildDataAccessScope, type DataAccessScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminActorResult = Awaited<ReturnType<typeof requireAdminActor>>;

type RouteDeps = {
  requireAdminActor: typeof requireAdminActor;
  createAdminClient: typeof createAdminClient;
  buildDataAccessScope: typeof buildDataAccessScope;
  aggregateDashboardAlerts: typeof aggregateDashboardAlerts;
};

const DASHBOARD_ALERTS_CACHE_TTL_MS = 60_000;
const dashboardAlertsCache = new Map<string, { expiresAt: number; payload: Record<string, unknown> }>();

function buildDashboardAlertsCacheKey(input: {
  userId: string;
  businessRole: "owner" | "team_admin";
  teamId: string | null;
  visibleUserIds: string[];
}) {
  return [
    input.userId,
    input.businessRole,
    input.teamId ?? "",
    [...input.visibleUserIds].sort().join(","),
  ].join("|");
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

function isAuthError(result: AdminActorResult): result is Extract<AdminActorResult, { error: string; status: 401 | 403 }> {
  return "error" in result;
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

export async function buildDashboardAlertsResponse(
  deps: RouteDeps = {
    requireAdminActor,
    createAdminClient,
    buildDataAccessScope,
    aggregateDashboardAlerts,
  },
) {
  const auth = await deps.requireAdminActor({ requiredPermission: "view_analytics" });
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const resolved = await resolveScope(auth, deps);
  if (!resolved) {
    return NextResponse.json({ error: "仅 owner 和负责人可查看中控台聚合告警" }, { status: 403 });
  }

  const cacheKey = buildDashboardAlertsCacheKey({
    userId: resolved.scope.actorUserId,
    businessRole: resolved.scope.businessRole,
    teamId: resolved.scope.teamId,
    visibleUserIds: resolved.scope.visibleUserIds,
  });
  const cached = dashboardAlertsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const result: AlertAggregationResult = await deps.aggregateDashboardAlerts({
    supabase: resolved.supabase,
    scope: resolved.scope,
    now: new Date(),
  });

  const payload = {
    ...result,
    meta: {
      generatedAt: new Date().toISOString(),
      scope: resolved.scope.businessRole === "owner" ? "all" : "team",
      teamId: resolved.scope.teamId,
    },
  };
  dashboardAlertsCache.set(cacheKey, {
    expiresAt: Date.now() + DASHBOARD_ALERTS_CACHE_TTL_MS,
    payload,
  });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=60",
    },
  });
}

export async function GET() {
  return buildDashboardAlertsResponse();
}

export const __internal = {
  resetDashboardAlertsCache() {
    dashboardAlertsCache.clear();
  },
};
