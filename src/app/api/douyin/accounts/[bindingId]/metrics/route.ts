import { NextResponse } from "next/server";

import { resolvePermissionCore } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ bindingId: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  const core = await resolvePermissionCore();
  if (!core) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401 });
  const { bindingId } = await context.params;
  const daysParam = Number(new URL(request.url).searchParams.get("days") ?? "30");
  const days = daysParam === 7 || daysParam === 15 || daysParam === 30 ? daysParam : 30;
  const admin = createAdminClient();
  const binding = await admin.from("douyin_account_bindings").select("account_id").eq("id", bindingId).maybeSingle();
  if (binding.error) return NextResponse.json({ error: { code: "BINDING_LOAD_FAILED", message: "加载抖音绑定失败" } }, { status: 500 });
  if (!binding.data) return NextResponse.json({ error: { code: "BINDING_NOT_FOUND", message: "抖音绑定不存在" } }, { status: 404 });
  const account = await admin.from("accounts").select("profile_id").eq("id", binding.data.account_id).maybeSingle();
  if (account.error) return NextResponse.json({ error: { code: "ACCOUNT_LOAD_FAILED", message: "加载业务账号失败" } }, { status: 500 });
  if (!account.data || !core.scope.visibleUserIds.includes(account.data.profile_id)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "无权查看该趋势" } }, { status: 403 });
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - days + 1);
  const metrics = await admin.from("douyin_account_metrics").select("metric_date, new_fans, total_fans, new_likes, new_play, profile_uv, new_issue, total_issue").eq("binding_id", bindingId).gte("metric_date", from.toISOString().slice(0, 10)).order("metric_date", { ascending: true });
  if (metrics.error) return NextResponse.json({ error: { code: "METRIC_LOAD_FAILED", message: "加载账号趋势失败" } }, { status: 500 });
  return NextResponse.json({ data: metrics.data ?? [] });
}
