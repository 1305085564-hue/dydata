import { NextRequest, NextResponse } from "next/server";

import { loadGrowthPageData, type GrowthPageLoadMode } from "@/lib/loaders/growth-page";
import { createClient } from "@/lib/supabase/server";

function resolveMode(searchParams: URLSearchParams): GrowthPageLoadMode | null {
  const mode = searchParams.get("mode");
  if (mode === "full") return "full";
  if (mode === "initial") return "initial";
  return null;
}

export async function GET(request: NextRequest) {
  const mode = resolveMode(request.nextUrl.searchParams);
  if (!mode) {
    return NextResponse.json({ error: "mode 仅支持 initial 或 full" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const data = await loadGrowthPageData({
    supabase,
    userId: user.id,
    userEmail: user.email,
    mode,
  });

  return NextResponse.json(data);
}
