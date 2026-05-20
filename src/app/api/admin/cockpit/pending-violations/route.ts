import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { parseLimitParam, requireAdminServiceClient } from "../_shared";

export async function GET(request: NextRequest) {
  const auth = await requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const limit = parseLimitParam(request);
  let query = auth.supabase
    .from("violation_cases")
    .select("id, script_text, category, risk_level, created_at, submitted_by, profiles!submitted_by(name)")
    .eq("status", "submitted")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (auth.scope.kind !== "all") {
    query = query.in("submitted_by", auth.scope.visibleUserIds);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message || "获取待审违规失败" }, { status: 500 });

  return NextResponse.json({
    data: (data ?? []).map((row) => ({
      id: row.id,
      script_text: typeof row.script_text === "string" && row.script_text.length > 80 ? row.script_text.slice(0, 80) : row.script_text,
      category: row.category,
      risk_level: row.risk_level,
      created_at: row.created_at,
      submitted_by_name: (() => {
        const profiles = row.profiles as { name?: string | null } | Array<{ name?: string | null }> | null;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return profile?.name ?? "未命名成员";
      })(),
    })),
  });
}
