import { NextResponse } from "next/server";

import { resolvePermissionCore } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDouyinSync } from "@/lib/douyin/sync";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import type { MutationObservation } from "@/lib/observed-mutation";

type RouteContext = { params: Promise<{ bindingId: string }> };

export const dynamic = "force-dynamic";

async function handlePost(_request: Request, context: RouteContext, observation?: MutationObservation) {
  observation?.mark("auth");
  const core = await resolvePermissionCore();
  if (!core) return appendObservedMutationResult(NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401 }), observation);
  const { bindingId } = await context.params;
  const admin = createAdminClient();
  const binding = await admin.from("douyin_account_bindings").select("id, account_id").eq("id", bindingId).maybeSingle();
  if (binding.error) return appendObservedMutationResult(NextResponse.json({ error: { code: "BINDING_LOAD_FAILED", message: "加载抖音绑定失败" } }, { status: 500 }), observation);
  if (!binding.data) return appendObservedMutationResult(NextResponse.json({ error: { code: "BINDING_NOT_FOUND", message: "抖音绑定不存在" } }, { status: 404 }), observation);
  const account = await admin.from("accounts").select("profile_id").eq("id", binding.data.account_id).maybeSingle();
  if (account.error) return appendObservedMutationResult(NextResponse.json({ error: { code: "ACCOUNT_LOAD_FAILED", message: "加载业务账号失败" } }, { status: 500 }), observation);
  if (!account.data || !core.scope.visibleUserIds.includes(account.data.profile_id)) return appendObservedMutationResult(NextResponse.json({ error: { code: "FORBIDDEN", message: "无权同步该抖音账号" } }, { status: 403 }), observation);

  try {
    observation?.mark("write-request");
    const summary = await runDouyinSync(bindingId, "manual", admin);
    return appendObservedMutationResult(NextResponse.json({ data: summary }, { status: 202 }), observation);
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "DOUYIN_SYNC_FAILED";
    return appendObservedMutationResult(NextResponse.json({ error: { code, message: "抖音同步失败，请稍后重试" } }, { status: 409 }), observation);
  }
}

export async function POST(request: Request, context: RouteContext) {
  return observeMutationRequest("/api/douyin/accounts/[bindingId]/sync", request, async (observation) => handlePost(request, context, observation));
}
