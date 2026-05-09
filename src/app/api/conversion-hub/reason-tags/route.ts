import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedContext,
  jsonServerError,
  jsonUnauthorized,
} from "@/lib/violations/api";

export async function GET() {
  const { user } = await getAuthenticatedContext();
  if (!user) return jsonUnauthorized();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("violation_reason_tags")
    .select("id, name, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return jsonServerError("获取原因标签失败");

  return NextResponse.json({ data: data ?? [] });
}
