import { NextRequest, NextResponse } from "next/server";

import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { loadAdminAdviceDetail } from "@/lib/loaders/admin-advice-page";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<unknown> },
) {
  const permission = await getUserPermissions();

  if (!permission) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!hasPermission(permission.businessRole, permission.permissions, "view_analytics")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = (await context.params) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "缺少建议ID" }, { status: 400 });
  }

  const supabase = await createClient();
  const data = await loadAdminAdviceDetail({ supabase, id });

  if (!data) {
    return NextResponse.json({ error: "建议不存在" }, { status: 404 });
  }

  return NextResponse.json({ item: data });
}
