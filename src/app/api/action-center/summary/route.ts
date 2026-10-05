import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/current-user-context";
import {
  buildPermissionContextFromPermissionInfo,
} from "@/lib/current-permission-context";
import { isCompanyOwnerActor } from "@/lib/exemption-orphan";
import { hasExemptionManagementPermission } from "@/lib/exemption-permissions";
import { getUserPermissions } from "@/lib/permissions";
import { toErrorResponse } from "@/lib/errors";
import { createRequestContext } from "@/lib/request-context";
import { withTimeout } from "@/lib/timeout";

import { loadActionCenterSummary } from "@/lib/action-center/server";

export const dynamic = "force-dynamic";

type ActionCenterSummaryDeps = {
  getCurrentUserContext: typeof getCurrentUserContext;
  getUserPermissions: typeof getUserPermissions;
  buildPermissionContextFromPermissionInfo: typeof buildPermissionContextFromPermissionInfo;
  loadActionCenterSummary: typeof loadActionCenterSummary;
  withTimeout: typeof withTimeout;
};

const defaultDeps: ActionCenterSummaryDeps = {
  getCurrentUserContext,
  getUserPermissions,
  buildPermissionContextFromPermissionInfo,
  loadActionCenterSummary,
  withTimeout,
};

const ACTION_CENTER_SUMMARY_TIMEOUT_MS = 4_000;

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

    const summary = await deps.withTimeout(
      () => deps.loadActionCenterSummary({
        userId: user.id,
        scope: permissionContext.scope,
        canManageExemptions: hasExemptionManagementPermission(permissionInfo.permissions),
        canViewOrphanDetails: isCompanyOwnerActor({
          companyRole: permissionInfo.companyRole,
          role: permissionInfo.role,
        }),
      }),
      {
        timeoutMs: ACTION_CENTER_SUMMARY_TIMEOUT_MS,
        operation: "load action-center summary",
      },
    );

    return NextResponse.json(summary, {
      headers: summaryHeaders(request.nextUrl.searchParams.get("refresh") === "1"),
    });
  } catch (error) {
    console.error("[action-center/summary] failed", error);
    const context = createRequestContext({
      request,
      actorId: user.id,
      route: "/api/action-center/summary",
      operation: "load_action_center_summary",
    });
    const response = toErrorResponse(error, context);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export async function GET(request: NextRequest) {
  return buildActionCenterSummaryResponse(request);
}
