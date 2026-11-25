import { NextResponse, type NextRequest } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { UUID_PATTERN } from "@/app/api/production/_shared";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { resolveCollaborationScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMonthParams } from "@/lib/collaboration/domain/report-rules";
import { loadCollaborationWorkbenchData, type CollaborationDataTab } from "@/lib/collaboration/data/workbench-loader";
import { readEvaluationStandards } from "@/lib/evaluation-standards-store";

const tabs = new Set<CollaborationDataTab>(["talents", "operators", "writers", "editors", "teams", "person-context"]);

export async function GET(request: NextRequest) {
  const parsed = parseMonthParams(request.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const tab = request.nextUrl.searchParams.get("tab") as CollaborationDataTab | null;
  if (!tab || !tabs.has(tab)) return NextResponse.json({ error: "tab 参数不正确" }, { status: 400 });
  const personId = request.nextUrl.searchParams.get("personId")?.trim() || null;
  if (tab === "person-context" && (!personId || !UUID_PATTERN.test(personId))) {
    return NextResponse.json({ error: "personId 必须是合法 UUID" }, { status: 400 });
  }

  const auth = await requireAdminActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const context = auth.context ?? await buildPermissionContextForActor(auth.actor);
  if (!context) return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });
  if (!canAccessAdminPath("/admin/collaboration", context.permissionInfo.role, context.permissionInfo.permissions)) {
    return NextResponse.json({ error: "当前账号无权查看协作工作台" }, { status: 403 });
  }

  try {
    const supabase = createAdminClient();
    const resolution = await resolveCollaborationScope(supabase, context.scope);
    if (tab === "person-context" && !resolution.visibleUserIds.includes(personId!)) {
      return NextResponse.json({ error: "不能查看当前权限范围外的成员" }, { status: 403 });
    }
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";
    const scopeKey = JSON.stringify([
      context.scope.userId,
      context.scope.role,
      context.scope.companyRole,
      context.scope.kind,
      context.scope.teamId,
      resolution.visibleUserIds.slice().sort(),
      context.permissionInfo.permissions,
    ]);
    const standards = await readEvaluationStandards(context.scope.teamId);
    const data = await loadCollaborationWorkbenchData({
      supabase,
      range: parsed.range,
      tab,
      visibleUserIds: resolution.visibleUserIds,
      activeVisibleUserIds: context.scope.activeVisibleUserIds,
      restrictToSelf: resolution.restrictToSelf,
      userId: context.scope.userId,
      teamId: context.scope.teamId,
      scopeKey,
      standards,
      canLoadWriterCandidates: context.permissionInfo.companyRole === "company_owner" || context.permissionInfo.companyRole === "admin",
      actor: { userId: auth.actor.userId, companyRole: context.permissionInfo.companyRole },
      personId,
      fresh,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "这个月的数据没加载出来" }, { status: 500 });
  }
}
