import { NextRequest, NextResponse } from "next/server";

import type { AnalyticsRangePreset } from "@/lib/analytics-access";
import { loadAnalyticsPageData } from "@/lib/loaders/analytics-page";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  try {
    const data = await loadAnalyticsPageData({
      supabase,
      userId: user.id,
      preset: (searchParams.get("preset") ?? "30d") as AnalyticsRangePreset,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载经营分析失败" },
      { status: 500 },
    );
  }
}
