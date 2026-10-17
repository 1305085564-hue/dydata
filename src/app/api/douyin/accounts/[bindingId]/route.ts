import { NextResponse } from "next/server";

import { resolvePermissionCore } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredDouyinClient } from "@/lib/douyin/server";
import { decryptDouyinSecret, encryptDouyinSecret } from "@/lib/douyin/secrets";
import { getDouyinConfig } from "@/lib/douyin/config";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import type { MutationObservation } from "@/lib/observed-mutation";

type RouteContext = { params: Promise<{ bindingId: string }> };

export const dynamic = "force-dynamic";

async function loadBinding(bindingId: string) {
  const core = await resolvePermissionCore();
  if (!core) return { error: NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "未登录" } }, { status: 401 }) } as const;
  const admin = createAdminClient();
  const binding = await admin
    .from("douyin_account_bindings")
    .select("id, account_id, authorized_by, platform_account_id, display_name, avatar_url, scopes, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, refresh_token_expires_at, status")
    .eq("id", bindingId)
    .maybeSingle();
  if (binding.error) return { error: NextResponse.json({ error: { code: "BINDING_LOAD_FAILED", message: "加载抖音绑定失败" } }, { status: 500 }) } as const;
  if (!binding.data) return { error: NextResponse.json({ error: { code: "BINDING_NOT_FOUND", message: "抖音绑定不存在" } }, { status: 404 }) } as const;
  const account = await admin.from("accounts").select("id, profile_id").eq("id", binding.data.account_id).maybeSingle();
  if (account.error) return { error: NextResponse.json({ error: { code: "ACCOUNT_LOAD_FAILED", message: "加载业务账号失败" } }, { status: 500 }) } as const;
  if (!account.data || !core.scope.visibleUserIds.includes(account.data.profile_id)) {
    return { error: NextResponse.json({ error: { code: "FORBIDDEN", message: "无权操作该抖音绑定" } }, { status: 403 }) } as const;
  }
  return { core, admin, binding: binding.data } as const;
}

async function handlePost(_request: Request, context: RouteContext, observation?: MutationObservation) {
  observation?.mark("auth");
  const { bindingId } = await context.params;
  const loaded = await loadBinding(bindingId);
  if ("error" in loaded) return appendObservedMutationResult(loaded.error ?? NextResponse.json({ error: { code: "BINDING_ACCESS_FAILED", message: "无权操作该抖音绑定" } }, { status: 403 }), observation);

  try {
    if (Date.parse(loaded.binding.refresh_token_expires_at) <= Date.now()) {
      await loaded.admin.from("douyin_account_bindings").update({ status: "expired", last_error_code: "REFRESH_TOKEN_EXPIRED", last_error_summary: "refresh_token 已过期" }).eq("id", bindingId);
      return appendObservedMutationResult(NextResponse.json({ error: { code: "REFRESH_TOKEN_EXPIRED", message: "授权已过期，请重新绑定抖音账号" } }, { status: 409 }), observation);
    }
    const config = getDouyinConfig();
    const refreshToken = decryptDouyinSecret(loaded.binding.refresh_token_ciphertext, config.tokenEncryptionKey);
    const { client } = getConfiguredDouyinClient();
    const token = await client.refreshAccessToken(refreshToken);
    const update = await loaded.admin
      .from("douyin_account_bindings")
      .update({
        platform_account_id: token.openId,
        access_token_ciphertext: encryptDouyinSecret(token.accessToken, config.tokenEncryptionKey),
        refresh_token_ciphertext: encryptDouyinSecret(token.refreshToken, config.tokenEncryptionKey),
        access_token_expires_at: new Date(Date.now() + token.expiresInSeconds * 1000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + token.refreshExpiresInSeconds * 1000).toISOString(),
        scopes: token.scopes,
        status: "active",
        last_error_code: null,
        last_error_summary: null,
        consecutive_failures: 0,
      })
      .eq("id", bindingId)
      .select("id, status, access_token_expires_at, refresh_token_expires_at")
      .single();
    if (update.error) throw update.error;
    return appendObservedMutationResult(NextResponse.json({ data: update.data }), observation);
  } catch (error) {
    const code = error instanceof Error && error.message.includes("DOUYIN_SECRET") ? "TOKEN_DECRYPT_FAILED" : "TOKEN_REFRESH_FAILED";
    await loaded.admin.from("douyin_account_bindings").update({ status: "error", last_error_code: code, last_error_summary: "抖音授权续期失败" }).eq("id", bindingId);
    return appendObservedMutationResult(NextResponse.json({ error: { code, message: "抖音授权续期失败，请重新绑定" } }, { status: 409 }), observation);
  }
}

export async function POST(request: Request, context: RouteContext) {
  return observeMutationRequest("/api/douyin/accounts/[bindingId]", request, async (observation) => handlePost(request, context, observation));
}

async function handleDelete(_request: Request, context: RouteContext, observation?: MutationObservation) {
  observation?.mark("auth");
  const { bindingId } = await context.params;
  const loaded = await loadBinding(bindingId);
  if ("error" in loaded) return appendObservedMutationResult(loaded.error ?? NextResponse.json({ error: { code: "BINDING_ACCESS_FAILED", message: "无权操作该抖音绑定" } }, { status: 403 }), observation);
  const update = await loaded.admin
    .from("douyin_account_bindings")
    .update({ status: "revoked", last_error_code: "REVOKED_BY_USER", last_error_summary: "用户解除绑定" })
    .eq("id", bindingId);
  if (update.error) return appendObservedMutationResult(NextResponse.json({ error: { code: "BINDING_REVOKE_FAILED", message: "解除抖音绑定失败" } }, { status: 500 }), observation);
  return appendObservedMutationResult(new NextResponse(null, { status: 204 }), observation);
}

export async function DELETE(request: Request, context: RouteContext) {
  return observeMutationRequest("/api/douyin/accounts/[bindingId]", request, async (observation) => handleDelete(request, context, observation));
}
