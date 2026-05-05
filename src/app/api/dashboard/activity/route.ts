import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadDashboardActivityData } from "@/lib/loaders/dashboard-activity";
import { measureAsync } from "@/lib/perf";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const activity = await measureAsync("dashboard.activity", () =>
      loadDashboardActivityData({ supabase, userId: user.id }),
    );
    return NextResponse.json(activity);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载填报记录失败" },
      { status: 500 },
    );
  }
}
