import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_FIRST_SCREEN_BUDGETS, formatServerTiming } from "@/lib/admin-first-screen-contract";
import { recordFirstScreenObservation } from "@/lib/admin-first-screen-observability";

import { jsonBadRequest, requireAdminServiceClient, unwrapRpc } from "../cockpit/_shared";

type SidebarBadgesDeps = {
  requireAdminServiceClient: typeof requireAdminServiceClient;
  recordObservation: typeof recordFirstScreenObservation;
};

type SidebarBadgesPayload = {
  cockpit: number;
  videos: number;
  content: number;
  conversion_hub: number;
  ai_channels: number;
};

const SIDEBAR_BADGES_CACHE_TTL_MS = 60_000;
const SIDEBAR_BADGES_RPC = "admin_sidebar_badges_summary";
const sidebarBadgesCache = new Map<string, { expiresAt: number; payload: SidebarBadgesPayload }>();

function nowMs() {
  return performance.now();
}

function getCacheKey(input: {
  date: string;
  userId: string;
  scopeKind: string;
  visibleUserIds: string[];
}) {
  return [
    input.date,
    input.userId,
    input.scopeKind,
    [...input.visibleUserIds].sort().join(","),
  ].join("|");
}

function parseDate(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("date");
  if (!value) return new Date().toISOString().slice(0, 10);
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export async function buildSidebarBadgesResponse(
  request: NextRequest,
  deps: SidebarBadgesDeps = {
    requireAdminServiceClient,
    recordObservation: recordFirstScreenObservation,
  },
) {
  const totalStart = nowMs();
  const date = parseDate(request);
  if (!date) return jsonBadRequest("date 必须是 YYYY-MM-DD");

  const authStart = nowMs();
  const auth = await deps.requireAdminServiceClient();
  const authMs = nowMs() - authStart;
  if ("response" in auth) return auth.response;

  const cacheKey = getCacheKey({
    date,
    userId: auth.scope.userId,
    scopeKind: auth.scope.kind,
    visibleUserIds: auth.scope.visibleUserIds,
  });
  const cached = sidebarBadgesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const totalMs = nowMs() - totalStart;
    const metrics = {
      auth: authMs,
      context: 0,
      data: 0,
      total: totalMs,
    };

    void deps.recordObservation({
      route: "/api/admin/sidebar-badges",
      statusCode: 200,
      metrics,
      actorUserId: auth.scope.userId,
      scopeKind: auth.scope.kind,
      metadata: { date, cache: "hit" },
    });

    return NextResponse.json(cached.payload, {
      headers: {
        "Cache-Control": "private, max-age=60",
        "Server-Timing": formatServerTiming(metrics),
      },
    });
  }

  const dataStart = nowMs();
  const result = await auth.supabase.rpc(SIDEBAR_BADGES_RPC, {
    p_target_date: date,
    p_visible_user_ids: auth.scope.visibleUserIds,
  });
  const dataMs = nowMs() - dataStart;
  const unwrapped = unwrapRpc<SidebarBadgesPayload>(result, "获取侧边栏徽标失败");
  if ("response" in unwrapped) return unwrapped.response;

  const payload = {
    cockpit: Number(unwrapped.data?.cockpit ?? 0),
    videos: Number(unwrapped.data?.videos ?? 0),
    content: Number(unwrapped.data?.content ?? 0),
    conversion_hub: Number(unwrapped.data?.conversion_hub ?? 0),
    ai_channels: Number(unwrapped.data?.ai_channels ?? 0),
  };

  sidebarBadgesCache.set(cacheKey, {
    expiresAt: Date.now() + SIDEBAR_BADGES_CACHE_TTL_MS,
    payload,
  });

  const totalMs = nowMs() - totalStart;
  const metrics = {
    auth: authMs,
    context: 0,
    data: dataMs,
    total: totalMs,
  };

  void deps.recordObservation({
    route: "/api/admin/sidebar-badges",
    statusCode: 200,
    metrics,
    actorUserId: auth.scope.userId,
    scopeKind: auth.scope.kind,
    metadata: { date, cache: "miss" },
  });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=60",
      "Server-Timing": formatServerTiming(metrics),
      "X-First-Screen-Budget-Ms": String(ADMIN_FIRST_SCREEN_BUDGETS.sidebarBadges.warnTotalMs),
    },
  });
}

export async function GET(request: NextRequest) {
  return buildSidebarBadgesResponse(request);
}
