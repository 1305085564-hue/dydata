import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/current-user-context";
import {
  buildPermissionContextFromPermissionInfo,
} from "@/lib/current-permission-context";
import { isCompanyOwnerActor } from "@/lib/exemption-orphan";
import { hasExemptionManagementPermission } from "@/lib/exemption-permissions";
import { getUserPermissions } from "@/lib/permissions";

import { loadActionCenterSummary } from "@/lib/action-center/server";

export const dynamic = "force-dynamic";

type ActionCenterSummaryDeps = {
  getCurrentUserContext: typeof getCurrentUserContext;
  getUserPermissions: typeof getUserPermissions;
  buildPermissionContextFromPermissionInfo: typeof buildPermissionContextFromPermissionInfo;
  loadActionCenterSummary: typeof loadActionCenterSummary;
};

const defaultDeps: ActionCenterSummaryDeps = {
  getCurrentUserContext,
  getUserPermissions,
  buildPermissionContextFromPermissionInfo,
  loadActionCenterSummary,
};

function summaryHeaders(forceRefresh: boolean) {
  return {
    "Cache-Control": forceRefresh
      ? "private, no-store"
      : "private, max-age=5, stale-while-revalidate=15",
  };
}

export async function buildActionCenterSummaryResponse(
  request: NextRequest,
  deps: ActionCenterSummaryDeps = defaultDeps,
) {
  const { user, authError } = await deps.getCurrentUserContext();
  if (authError || !user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const permissionInfo = await deps.getUserPermissions();
    if (!permissionInfo) {
      return NextResponse.json({ error: "用户信息不存在" }, { status: 403 });
    }

    const permissionContext = await deps.buildPermissionContextFromPermissionInfo(permissionInfo);
    if (!permissionContext) {
      return NextResponse.json({ error: "用户信息不存在" }, { status: 403 });
    }

    const summary = await deps.loadActionCenterSummary({
      userId: user.id,
      scope: permissionContext.scope,
      canManageExemptions: hasExemptionManagementPermission(
        permissionInfo.role,
        permissionInfo.permissions,
      ),
      canViewOrphanDetails: isCompanyOwnerActor({
        companyRole: permissionInfo.companyRole,
        role: permissionInfo.role,
      }),
    });

    return NextResponse.json(summary, {
      headers: summaryHeaders(request.nextUrl.searchParams.get("refresh") === "1"),
    });
  } catch (error) {
    console.error("[action-center/summary] failed", error);
    return NextResponse.json(
      { error: "行动中枢暂时无法同步，请稍后重试" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function GET(request: NextRequest) {
  return buildActionCenterSummaryResponse(request);
}
