import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  canViewViolationDashboard,
  getAuthenticatedContext,
  getUserProfile,
  jsonForbidden,
  jsonServerError,
  jsonUnauthorized,
} from "@/lib/violations/api";
import { loadViolationDashboardSummary } from "@/lib/violations/read-model";

type MinimalDashboardSupabase = {
  from: (table: string) => unknown;
};

type DashboardSummaryDeps = {
  getAuthenticatedContext: () => Promise<{ supabase?: MinimalDashboardSupabase; user: { id: string } | null }>;
  createAdminClient: () => MinimalDashboardSupabase;
  getUserProfile?: (supabase: MinimalDashboardSupabase, userId: string) => Promise<{
    role: "owner" | "admin" | "admin" | "member";
    permissions: Record<string, boolean>;
  } | null>;
};

const defaultDeps: DashboardSummaryDeps = {
  getAuthenticatedContext: getAuthenticatedContext as DashboardSummaryDeps["getAuthenticatedContext"],
  createAdminClient: createAdminClient as unknown as DashboardSummaryDeps["createAdminClient"],
  getUserProfile: getUserProfile as unknown as DashboardSummaryDeps["getUserProfile"],
};

export async function buildDashboardSummaryResponse(deps: DashboardSummaryDeps = defaultDeps) {
  const { supabase: userSupabase, user } = await deps.getAuthenticatedContext();
  if (!user) return jsonUnauthorized();
  const getUserProfileForRequest = deps.getUserProfile ?? defaultDeps.getUserProfile!;
  const profile = await getUserProfileForRequest(
    (userSupabase ?? deps.createAdminClient()) as MinimalDashboardSupabase,
    user.id,
  );
  if (!profile || !canViewViolationDashboard(profile as never)) {
    return jsonForbidden("缺少违规案例或转化数据查看权限");
  }

  const supabase = deps.createAdminClient();
  const { data, errorMessage } = await loadViolationDashboardSummary({ supabase });
  if (errorMessage || !data) {
    return jsonServerError("获取 Dashboard 数据失败");
  }

  return NextResponse.json({
    data,
  });
}

export async function GET() {
  return buildDashboardSummaryResponse();
}
