import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDouyinSync } from "@/lib/douyin/sync";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: { code: "UNAUTHORIZED_CRON", message: "未授权" } }, { status: 401 });
  const admin = createAdminClient();
  const bindings = await admin.from("douyin_account_bindings").select("id").eq("status", "active").order("last_sync_at", { ascending: true, nullsFirst: true }).limit(20);
  if (bindings.error) return NextResponse.json({ error: { code: "BINDING_LOAD_FAILED", message: "加载抖音绑定失败" } }, { status: 500 });

  const results: Array<{ bindingId: string; ok: boolean; error?: string }> = [];
  for (const binding of bindings.data ?? []) {
    try {
      await runDouyinSync(binding.id, "cron", admin);
      results.push({ bindingId: binding.id, ok: true });
    } catch (error) {
      results.push({ bindingId: binding.id, ok: false, error: error instanceof Error ? error.message.split(":")[0] : "DOUYIN_SYNC_FAILED" });
    }
  }
  return NextResponse.json({ data: { attempted: results.length, succeeded: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length, results } });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
