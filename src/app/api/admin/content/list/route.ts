import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { loadAdminContentListData, type AdminContentPageData } from "@/lib/loaders/admin-content-page";
import { getTeamOptions } from "@/lib/teams";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRequestContext } from "@/lib/request-context";
import { observeRequest } from "@/lib/observability";
import { resolveVideoReviewReadOnlyScope } from "@/lib/data-access-scope";
import { parseContentListQuery } from "@/lib/content/domain/content-list-query";

function parseView(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") ?? "all";
  return view === "all" || view === "trash" ? view : null;
}

/** fresh=1：写操作后回到第一页；列表响应始终禁止浏览器缓存 */
function parseFresh(request: NextRequest) {
  return request.nextUrl.searchParams.get("fresh") === "1";
}

function nowMs() {
  return performance.now();
}

function formatServerTiming(parts: Array<{ name: string; duration: number }>) {
  return parts.map((part) => `${part.name};dur=${part.duration.toFixed(1)}`).join(", ");
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

  const teams = auth.actor.teamId ? [{ id: auth.actor.teamId }] : [];
  const scope = resolveAdminDataPerspective({
    requestedPerspective: request.nextUrl.searchParams.get("scope"),
    requestedTeamId: request.nextUrl.searchParams.get("teamId"),
    canUseCompanyPerspective: false,
    availableTeamIds: teams.map((team) => team.id),
    fallbackTeamId: auth.actor.teamId ?? null,
  });

  const contextStart = nowMs();
  const permissionContext = auth.context && scope.perspective === "company" && scope.teamId === null
    ? auth.context
    : await deps.getCurrentPermissionContext(auth.actor, {
        perspective: scope.perspective,
        teamId: scope.teamId,
      });
  const contextMs = nowMs() - contextStart;
  if (!permissionContext) {
    return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  }

  const fresh = parseFresh(request);
  const parsedQuery = parseContentListQuery(request.nextUrl.searchParams);
  const query = {
    ...parsedQuery,
    page: fresh ? 1 : parsedQuery.page,
    cursor: fresh ? null : parsedQuery.cursor,
    perspective: scope.perspective,
    teamId: scope.teamId,
  };
  const readOnlyScope = await resolveVideoReviewReadOnlyScope(
    deps.createAdminClient(),
    permissionContext.scope,
  );
  const dataStart = nowMs();
  let data: AdminContentPageData;
  try {
    data = await deps.loadAdminContentListData({
      supabase: deps.createAdminClient(),
      view,
      perspective: scope.perspective,
      teamId: scope.teamId,
      permissionInfo: permissionContext.permissionInfo,
      scope: readOnlyScope,
      query,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CONTENT_LIST_CURSOR_STALE") {
      return NextResponse.json({ error: "列表数据已更新，请从第一页重新加载", staleCursor: true }, { status: 409 });
    }
    throw error;
  }
  const dataMs = nowMs() - dataStart;
  const serializationStart = nowMs();
  const responseBody = JSON.stringify(data);
  const serializationMs = nowMs() - serializationStart;
  const totalMs = nowMs() - totalStart;

  return new NextResponse(responseBody, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Server-Timing": formatServerTiming([
        { name: "auth", duration: authMs },
        { name: "context", duration: contextMs },
        ...(data.diagnostics?.rpcDurationMs !== undefined ? [{ name: "rpc", duration: data.diagnostics.rpcDurationMs }] : []),
        { name: "serialize", duration: serializationMs },
        { name: "data", duration: dataMs },
        { name: "total", duration: totalMs },
      ]),
      "X-Content-Rows-Read": String(data.diagnostics?.rowsRead ?? 0),
      "X-Content-Snapshot-Rows-Read": String(data.diagnostics?.snapshotRowsRead ?? 0),
      "X-Content-Returned-Rows": String(data.diagnostics?.returnedRows ?? data.videos.length),
    },
  });
}

export async function GET(request: NextRequest) {
  const context = createRequestContext({
    request,
    route: "/api/admin/content/list",
    operation: "read",
  });
  return observeRequest(context, () => buildAdminContentListResponse(request));
}
