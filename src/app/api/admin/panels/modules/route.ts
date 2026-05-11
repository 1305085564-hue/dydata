import { NextRequest, NextResponse } from "next/server";

import { loadAdminModulesData } from "@/lib/loaders/admin-modules";
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
    const data = await loadAdminModulesData({
      supabase,
      searchDate: searchParams.get("date") ?? undefined,
    });

    if (!data) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载权限模块失败" },
      { status: 500 },
    );
  }
}
