import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import {
  clearAdminContentListCache,
  loadAdminContentListData,
  type AdminContentPageData,
} from "@/lib/loaders/admin-content-page";
import { getTeamOptions } from "@/lib/teams";
import { createAdminClient } from "@/lib/supabase/admin";

function parseView(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") ?? "all";
  return view === "all" || view === "trash" ? view : null;
}

/** fresh=1：写操作（回收站/补录/选题库）后的首次取数，跳过服务端与浏览器缓存 */
function parseFresh(request: NextRequest) {
  return request.nextUrl.searchParams.get("fresh") === "1";
}

function nowMs() {
  return performance.now();
}

function formatServerTiming(parts: Array<{ name: string; duration: number }>) {
  return parts.map((part) => `${part.name};dur=${part.duration.toFixed(1)}`).join(", ");
}

export function clearAdminContentListRouteCache() {
  clearAdminContentListCache();
}

export async function buildAdminContentListResponse(
  request: NextRequest,
  deps: {
    requireAdminActor: typeof requireAdminActor;
    getTeamOptions: typeof getTeamOptions;
    getCurrentPermissionContext: typeof buildPermissionContextForActor;
    createAdminClient: typeof createAdminClient;
    loadAdminContentListData: typeof loadAdminContentListData;
  } = {
    requireAdminActor,
    getTeamOptions,
    getCurrentPermissionContext: buildPermissionContextForActor,
    createAdminClient,
    loadAdminContentListData,
  },
) {
  const totalStart = nowMs();
  const view = parseView(request);
  if (!view) {
    return NextResponse.json({ error: "view 只能是 all 或 trash" }, { status: 400 });
  }

  const authStart = nowMs();
  const auth = await deps.requireAdminActor();
  const authMs = nowMs() - authStart;
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!canAccessAdminPath("/admin/content", auth.actor.role, auth.actor.permissions)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  if (view === "trash" && auth.actor.permissions.manage_videos !== true) {
    return NextResponse.json({ error: "无回收站查看权限" }, { status: 403 });
  }

  const canUseGroupPerspective = auth.actor.groupMode === true;
  const teams = canUseGroupPerspective
    ? await deps.getTeamOptions()
    : auth.actor.teamId
      ? [{ id: auth.actor.teamId }]
      : [];
  const scope = resolveAdminDataPerspective({
    requestedPerspective: request.nextUrl.searchParams.get("scope"),
    requestedTeamId: request.nextUrl.searchParams.get("teamId"),
    canUseCompanyPerspective: canUseGroupPerspective,
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

  const fresh = parseFresh(request);
  const dataStart = nowMs();
  const data: AdminContentPageData = await deps.loadAdminContentListData({
    supabase: deps.createAdminClient(),
    view,
    perspective: scope.perspective,
    teamId: scope.teamId,
    permissionInfo: permissionContext.permissionInfo,
    scope: permissionContext.scope,
    fresh,
  });
  const dataMs = nowMs() - dataStart;
  const totalMs = nowMs() - totalStart;

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": fresh ? "no-store" : "private, max-age=60",
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
  resetAdminContentListCache: clearAdminContentListRouteCache,
};
