import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { loadAdminAdvicePageData } from "@/lib/loaders/admin-advice-page";

export async function GET() {
  const permission = await getUserPermissions();

  if (!permission) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!hasPermission(permission.businessRole, permission.permissions, "view_analytics")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const supabase = await createClient();
  const data = await loadAdminAdvicePageData({ supabase });

  return NextResponse.json({
    advice: data.advice,
  });
}
