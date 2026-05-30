import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedContext,
  jsonServerError,
  jsonUnauthorized,
} from "@/lib/violations/api";
import { loadViolationDashboardSummary } from "@/lib/violations/read-model";

type MinimalDashboardSupabase = {
  from: (table: string) => unknown;
};

type DashboardSummaryDeps = {
  getAuthenticatedContext: () => Promise<{ user: { id: string } | null }>;
  createAdminClient: () => MinimalDashboardSupabase;
};

const defaultDeps: DashboardSummaryDeps = {
  getAuthenticatedContext: getAuthenticatedContext as DashboardSummaryDeps["getAuthenticatedContext"],
  createAdminClient: createAdminClient as unknown as DashboardSummaryDeps["createAdminClient"],
};

export async function buildDashboardSummaryResponse(deps: DashboardSummaryDeps = defaultDeps) {
  const { user } = await deps.getAuthenticatedContext();
  if (!user) return jsonUnauthorized();

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
