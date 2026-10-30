import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { resolveVideoReviewReadOnlyScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAuthorContentWorks } from "@/lib/loaders/author-content-works";
import { AppError, toErrorResponse } from "@/lib/errors";
import { createRequestContext } from "@/lib/request-context";
import { observeRequest } from "@/lib/observability";
import { withTimeout } from "@/lib/timeout";
import { queryProfiles } from "@/lib/collaboration/data/reports";
import type { AuthorWorksQueryParams } from "@/lib/content/author-works-domain";

const dependencies = {
  requireAdminActor, buildPermissionContext: buildPermissionContextForActor,
  resolveReadScope: resolveVideoReviewReadOnlyScope, createClient: createAdminClient, loadWorks: loadAuthorContentWorks,
};
export async function buildAuthorWorksResponse(request: NextRequest, deps = dependencies) {
  const context = createRequestContext({ request, route: "/api/admin/content/author", operation: "read" });
  try {
    const auth = await deps.requireAdminActor();
    if ("error" in auth) throw new AppError({ message: "作者作品鉴权失败", code: auth.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" });
    if (!canAccessAdminPath("/admin/content", auth.actor.role, auth.actor.permissions)) throw new AppError({ message: "作者作品加载失败", code: "FORBIDDEN" });
    const q = request.nextUrl.searchParams;
    const userId = q.get("userId") ?? "";
    const timeRange = q.get("timeRange") ?? "30d";
    const sortField = q.get("sortField") ?? "published_at";
    const sortDir = q.get("sortDir") ?? "desc";
    const pageSize = Number(q.get("pageSize") ?? 100);
    const page = Number(q.get("page") ?? 1);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) ||
      !["30d", "thisMonth", "lastMonth", "all"].includes(timeRange) ||
      !["published_at", "play_count"].includes(sortField) || !["desc", "asc"].includes(sortDir) ||
      (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) || !Number.isInteger(page) || page < 1 || page > 10000) {
      throw new AppError({ message: "作者作品加载失败", code: "INVALID_INPUT", publicMessage: "作者或筛选参数不正确" });
    }
    const permissionContext = await deps.buildPermissionContext(auth.actor, { perspective: "team", teamId: auth.actor.teamId ?? null });
    if (!permissionContext) throw new AppError({ message: "作者作品加载失败", code: "FORBIDDEN" });
    const client = deps.createClient();
    const scope = await deps.resolveReadScope(client, permissionContext.scope);
    if (!scope.visibleUserIds.includes(userId)) throw new AppError({ message: "作者作品加载失败", code: "FORBIDDEN" });
    const result = await withTimeout(async () => {
      const profile = await queryProfiles<{ name: string | null; work_peer_group_id?: string | null; work_operator_group_id?: string | null }>(
        fields => client.from("profiles").select(fields).eq("id", userId).maybeSingle(),
      );
      if (profile.error) throw new AppError({ message: "作者作品加载失败", code: "DEPENDENCY_FAILED" });
      if (!profile.data) throw new AppError({ message: "作者作品加载失败", code: "NOT_FOUND" });
      const groupIds = [profile.data.work_peer_group_id, profile.data.work_operator_group_id].filter((id): id is string => Boolean(id));
      const roles: ("writer" | "talent" | "operator")[] = [];
      if (groupIds.length) {
        const groups = await client.from("work_groups").select("kind").in("id", groupIds);
        if (groups.error) throw new AppError({ message: "作者作品加载失败", code: "DEPENDENCY_FAILED" });
        for (const group of groups.data ?? []) {
          if (["writer", "talent", "operator"].includes(group.kind) && !roles.includes(group.kind)) roles.push(group.kind);
        }
      }
      return deps.loadWorks({ supabase: client, scope, permissionInfo: permissionContext.permissionInfo,
        perspective: "team", teamId: scope.teamId, author: { userId, name: profile.data.name ?? "未命名成员", roles },
        params: { userId, timeRange, sortField, sortDir, pageSize, page } as AuthorWorksQueryParams });
    }, { timeoutMs: 25000, operation: "load_author_content_works" });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error, context);
  }
}
export async function GET(request: NextRequest) {
  const context = createRequestContext({ request, route: "/api/admin/content/author", operation: "read" });
  return observeRequest(context, () => buildAuthorWorksResponse(request));
}
