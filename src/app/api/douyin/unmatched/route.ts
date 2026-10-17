import { NextResponse } from "next/server";

import { resolvePermissionCore } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const core = await resolvePermissionCore();
  if (!core) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401 });
  const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit") ?? "50"), 1), 100);
  const admin = createAdminClient();
  const bindings = await admin.from("douyin_account_bindings").select("id, account_id, display_name").limit(100);
  if (bindings.error) return NextResponse.json({ error: { code: "BINDING_LOAD_FAILED", message: "加载抖音绑定失败" } }, { status: 500 });
  const accountIds = (bindings.data ?? []).map((binding) => binding.account_id);
  const accounts = accountIds.length ? await admin.from("accounts").select("id, profile_id, name").in("id", accountIds) : { data: [], error: null };
  if (accounts.error) return NextResponse.json({ error: { code: "ACCOUNT_LOAD_FAILED", message: "加载业务账号失败" } }, { status: 500 });
  const visibleAccountIds = new Set((accounts.data ?? []).filter((account) => core.scope.visibleUserIds.includes(account.profile_id)).map((account) => account.id));
  const visibleBindingIds = new Set((bindings.data ?? []).filter((binding) => visibleAccountIds.has(binding.account_id)).map((binding) => binding.id));
  const rows = visibleBindingIds.size ? await admin.from("douyin_external_videos").select("id, binding_id, platform_video_id, title, share_url, platform_published_at, reconciliation_status, matched_video_id, first_seen_at, last_seen_at").in("binding_id", [...visibleBindingIds]).in("reconciliation_status", ["discovered", "pending_review"]).order("platform_published_at", { ascending: false, nullsFirst: false }).limit(limit) : { data: [], error: null };
  if (rows.error) return NextResponse.json({ error: { code: "UNMATCHED_LOAD_FAILED", message: "加载待关联作品失败" } }, { status: 500 });
  return NextResponse.json({ data: rows.data ?? [] });
}
