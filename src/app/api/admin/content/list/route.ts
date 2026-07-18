import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { loadAdminContentFullData, type AdminContentPageData } from "@/lib/loaders/admin-content-page";
import { getTeamOptions } from "@/lib/teams";
import { createAdminClient } from "@/lib/supabase/admin";

function parseView(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") ?? "pending";
  return view === "all" || view === "pending" ? view : null;
}

function parseMode(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") ?? "full";
  return mode === "full" ? mode : null;
}

function nowMs() {
  return performance.now();
}

function formatServerTiming(parts: Array<{ name: string; duration: number }>) {
  return parts.map((part) => `${part.name};dur=${part.duration.toFixed(1)}`).join(", ");
}

const ADMIN_CONTENT_LIST_CACHE_TTL_MS = 60_000;
const adminContentListCache = new Map<string, { expiresAt: number; payload: AdminContentPageData }>();

function buildAdminContentCacheKey(input: {
  view: "pending" | "all";
  perspective: "company" | "team";
  teamId: string | null;
  userId: string;
  scopeKind: string;
  visibleUserIds: string[];
}) {
  return [
    input.view,
    input.perspective,
    input.teamId ?? "",
    input.userId,
    input.scopeKind,
    [...input.visibleUserIds].sort().join(","),
  ].join("|");
}

export async function buildAdminContentListResponse(
  request: NextRequest,
  deps: {
    requireAdminActor: typeof requireAdminActor;
    getTeamOptions: typeof getTeamOptions;
    getCurrentPermissionContext: typeof buildPermissionContextForActor;
    createAdminClient: typeof createAdminClient;
    loadAdminContentFullData: typeof loadAdminContentFullData;
  } = {
    requireAdminActor,
    getTeamOptions,
    getCurrentPermissionContext: buildPermissionContextForActor,
    createAdminClient,
    loadAdminContentFullData,
  },
) {
  const totalStart = nowMs();
  const mode = parseMode(request);
  if (!mode) {
    return NextResponse.json({ error: "mode 只能是 full，首屏必须走服务端首屏入口" }, { status: 400 });
  }

  const view = parseView(request);
  if (!view) {
    return NextResponse.json({ error: "view 只能是 pending 或 all" }, { status: 400 });
  }

  const authStart = nowMs();
  const auth = await deps.requireAdminActor();
  const authMs = nowMs() - authStart;
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!canAccessAdminPath("/admin/content", auth.actor.businessRole, auth.actor.permissions)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const teams = auth.actor.businessRole === "owner" ? await deps.getTeamOptions() : [];
  const scope = resolveAdminDataPerspective({
    requestedPerspective: request.nextUrl.searchParams.get("scope"),
    requestedTeamId: request.nextUrl.searchParams.get("teamId"),
    canUseCompanyPerspective: auth.actor.businessRole === "owner",
    availableTeamIds: teams.map((team) => team.id),
    fallbackTeamId: auth.actor.teamId ?? null,
  });

  const contextStart = nowMs();
  const permissionContext = await deps.getCurrentPermissionContext(auth.actor, {
    perspective: scope.perspective,
    teamId: scope.teamId,
  });
  const contextMs = nowMs() - contextStart;
  if (!permissionContext) {
    return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  }

  const cacheKey = buildAdminContentCacheKey({
    view,
    perspective: scope.perspective,
    teamId: scope.teamId,
    userId: permissionContext.permissionInfo.userId,
    scopeKind: permissionContext.scope.kind,
    visibleUserIds: permissionContext.scope.visibleUserIds,
  });
  const cached = adminContentListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const totalMs = nowMs() - totalStart;
    return NextResponse.json(cached.payload, {
      headers: {
        "Cache-Control": "private, max-age=60",
        "Server-Timing": formatServerTiming([
          { name: "auth", duration: authMs },
          { name: "context", duration: contextMs },
          { name: "data", duration: 0 },
          { name: "total", duration: totalMs },
        ]),
      },
    });
  }

  const dataStart = nowMs();
  const data = await deps.loadAdminContentFullData({
    supabase: deps.createAdminClient(),
    view,
    perspective: scope.perspective,
    teamId: scope.teamId,
    permissionInfo: permissionContext.permissionInfo,
    scope: permissionContext.scope,
  });
  const dataMs = nowMs() - dataStart;
  const totalMs = nowMs() - totalStart;
  adminContentListCache.set(cacheKey, {
    expiresAt: Date.now() + ADMIN_CONTENT_LIST_CACHE_TTL_MS,
    payload: data,
  });

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "private, max-age=60",
      "Server-Timing": formatServerTiming([
        { name: "auth", duration: authMs },
        { name: "context", duration: contextMs },
        { name: "data", duration: dataMs },
        { name: "total", duration: totalMs },
      ]),
    },
  });
}

export async function GET(request: NextRequest) {
  return buildAdminContentListResponse(request);
}

export const __internal = {
  resetAdminContentListCache() {
    adminContentListCache.clear();
  },
};
