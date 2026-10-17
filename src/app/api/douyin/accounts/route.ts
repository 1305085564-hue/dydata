import { NextResponse } from "next/server";

import { resolvePermissionCore } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const core = await resolvePermissionCore();
  if (!core) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401 });

  const admin = createAdminClient();
  const accounts = await admin
    .from("accounts")
    .select("id, profile_id, name")
    .in("profile_id", core.scope.visibleUserIds)
    .order("name", { ascending: true });
  if (accounts.error) return NextResponse.json({ error: { code: "ACCOUNT_LOAD_FAILED", message: "加载业务账号失败" } }, { status: 500 });

  const accountIds = (accounts.data ?? []).map((account) => account.id);
  const bindings = accountIds.length === 0
    ? { data: [], error: null }
    : await admin
      .from("douyin_account_bindings")
      .select("id, account_id, platform_account_id, display_name, avatar_url, scopes, access_token_expires_at, refresh_token_expires_at, status, last_sync_at, last_error_code, last_error_summary")
      .in("account_id", accountIds);
  if (bindings.error) return NextResponse.json({ error: { code: "BINDING_LOAD_FAILED", message: "加载抖音绑定状态失败" } }, { status: 500 });

  const byAccountId = new Map((bindings.data ?? []).map((binding) => [binding.account_id, binding]));
  return NextResponse.json({
    data: (accounts.data ?? []).map((account) => ({
      accountId: account.id,
      accountName: account.name,
      profileId: account.profile_id,
      binding: byAccountId.get(account.id) ?? null,
    })),
  });
}
