import { NextResponse } from "next/server";

import { getWeekStartDate } from "@/app/(app)/violations/admin-components/data";
import { loadScriptsTab, type ScriptsTabData } from "@/lib/case-library/analytics";
import {
  getAuthenticatedContext,
  jsonServerError,
  jsonUnauthorized,
  requireViolationAdmin,
} from "@/lib/violations/api";

type MinimalAnalyticsSupabase = object;

type CaseLibraryAnalyticsRouteDeps = {
  getAuthenticatedContext: () => Promise<{
    supabase: MinimalAnalyticsSupabase;
    user: { id: string } | null;
  }>;
  requireViolationAdmin: (
    supabase: MinimalAnalyticsSupabase,
    user: { id: string },
  ) => Promise<
    | { ok: false; response: Response }
    | { ok: true; profile: unknown }
  >;
  getWeekStartDate: () => string;
  loadScriptsTab: (weekStart: string) => Promise<ScriptsTabData>;
};

const defaultDeps: CaseLibraryAnalyticsRouteDeps = {
  getAuthenticatedContext: getAuthenticatedContext as unknown as CaseLibraryAnalyticsRouteDeps["getAuthenticatedContext"],
  requireViolationAdmin: requireViolationAdmin as unknown as CaseLibraryAnalyticsRouteDeps["requireViolationAdmin"],
  getWeekStartDate,
  loadScriptsTab,
};

export async function buildCaseLibraryAnalyticsResponse(
  deps: CaseLibraryAnalyticsRouteDeps = defaultDeps,
) {
  const { supabase, user } = await deps.getAuthenticatedContext();
  if (!user) {
    return jsonUnauthorized();
  }

  const admin = await deps.requireViolationAdmin(supabase, user);
  if (!admin.ok) {
    return admin.response;
  }

  try {
    const data = await deps.loadScriptsTab(deps.getWeekStartDate());
    return NextResponse.json({ data });
  } catch {
    return jsonServerError("获取案例库 analytics 数据失败");
  }
}

export async function GET() {
  return buildCaseLibraryAnalyticsResponse();
}
