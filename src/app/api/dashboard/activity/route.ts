import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toStringErrorResponse } from "@/lib/errors";
import { loadDashboardActivityData } from "@/lib/loaders/dashboard-activity";
import { measureAsync } from "@/lib/perf";

type DashboardActivityDeps = {
  createClient: typeof createClient;
  loadDashboardActivityData: typeof loadDashboardActivityData;
};

export const defaultDashboardActivityDeps: DashboardActivityDeps = {
  createClient,
  loadDashboardActivityData,
};

export async function buildDashboardActivityResponse(
  request: NextRequest,
  deps: DashboardActivityDeps = defaultDashboardActivityDeps,
) {
  const supabase = await deps.createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "30", 10);

  try {
    const activity = await measureAsync("dashboard.activity", () =>
      deps.loadDashboardActivityData({ supabase, userId: user.id, page, pageSize }),
    );
    return NextResponse.json(activity);
  } catch (error) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/dashboard/activity",
      operation: "load-dashboard-activity",
      request,
      status: 500,
      message: "加载填报记录失败",
      error,
    });
  }
}

export async function GET(request: NextRequest) {
  return buildDashboardActivityResponse(request, defaultDashboardActivityDeps);
}
