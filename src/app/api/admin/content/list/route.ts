import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/ai-assistant/_shared";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { loadAdminContentPageData } from "@/lib/loaders/admin-content-page";
import { createAdminClient } from "@/lib/supabase/admin";

function parseView(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") ?? "pending";
  return view === "all" || view === "pending" ? view : null;
}

export async function GET(request: NextRequest) {
  const view = parseView(request);
  if (!view) {
    return NextResponse.json({ error: "view 只能是 pending 或 all" }, { status: 400 });
  }

  const auth = await requireAdminActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!canAccessAdminPath("/admin/content", auth.actor.businessRole, auth.actor.permissions)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const data = await loadAdminContentPageData({ supabase, view });

  return NextResponse.json(data);
}
