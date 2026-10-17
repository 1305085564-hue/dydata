import { NextResponse } from "next/server";

import { resolvePermissionCore } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ runId: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  const core = await resolvePermissionCore();
  if (!core) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401 });
  const { runId } = await context.params;
  const admin = createAdminClient();
  const result = await admin.from("douyin_sync_runs").select("id, binding_id, trigger_type, status, discovered_count, matched_count, pending_count, failed_count, error_code, error_summary, started_at, finished_at, created_at, douyin_account_bindings!inner(account_id)").eq("id", runId).maybeSingle();
  if (result.error) return NextResponse.json({ error: { code: "SYNC_RUN_LOAD_FAILED", message: "加载同步批次失败" } }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: { code: "SYNC_RUN_NOT_FOUND", message: "同步批次不存在" } }, { status: 404 });
  const relation = Array.isArray(result.data.douyin_account_bindings) ? result.data.douyin_account_bindings[0] : result.data.douyin_account_bindings;
  const accountId = relation?.account_id;
  const account = accountId ? await admin.from("accounts").select("profile_id").eq("id", accountId).maybeSingle() : { data: null, error: null };
  if (account.error) return NextResponse.json({ error: { code: "ACCOUNT_LOAD_FAILED", message: "加载业务账号失败" } }, { status: 500 });
  if (!account.data || !core.scope.visibleUserIds.includes(account.data.profile_id)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "无权查看该同步批次" } }, { status: 403 });
  return NextResponse.json({ data: result.data });
}
