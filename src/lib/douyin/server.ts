import { buildDouyinAuthorizationUrl } from "./contracts";
import { DouyinClient } from "./client";
import { createDouyinOAuthState, getDouyinConfig, hashDouyinOAuthState } from "./config";
import { encryptDouyinSecret } from "./secrets";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PermissionCore } from "@/lib/current-permission-context";

export function getConfiguredDouyinClient() {
  const config = getDouyinConfig();
  return { config, client: new DouyinClient(config) };
}

export async function loadAccessibleDouyinAccount(
  admin: ReturnType<typeof createAdminClient>,
  core: PermissionCore,
  accountId: string,
) {
  const result = await admin
    .from("accounts")
    .select("id, profile_id, name")
    .eq("id", accountId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data || !core.scope.visibleUserIds.includes(result.data.profile_id)) return null;
  return result.data;
}

export async function createDouyinAuthorizationIntent(input: {
  admin: ReturnType<typeof createAdminClient>;
  core: PermissionCore;
  accountId: string;
}) {
  const account = await loadAccessibleDouyinAccount(input.admin, input.core, input.accountId);
  if (!account) return { error: "账号不存在或无权操作", status: 404 as const };

  const config = getDouyinConfig();
  const state = createDouyinOAuthState();
  const insert = await input.admin.from("douyin_oauth_states").insert({
    state_hash: state.hash,
    account_id: account.id,
    actor_id: input.core.userId,
    expires_at: new Date(state.expiresAt).toISOString(),
  });
  if (insert.error) throw insert.error;

  const binding = await input.admin
    .from("douyin_account_bindings")
    .select("id")
    .eq("account_id", account.id)
    .maybeSingle();
  if (binding.error) throw binding.error;
  if (binding.data) {
    const update = await input.admin
      .from("douyin_account_bindings")
      .update({ status: "authorizing", last_error_code: null, last_error_summary: null })
      .eq("id", binding.data.id);
    if (update.error) throw update.error;
  }

  return {
    account,
    stateExpiresAt: new Date(state.expiresAt).toISOString(),
    authorizationUrl: buildDouyinAuthorizationUrl({
      clientKey: config.clientKey,
      redirectUri: config.redirectUri,
      state: state.value,
      scope: config.scopes,
    }),
  };
}

export async function consumeDouyinOAuthState(
  admin: ReturnType<typeof createAdminClient>,
  value: string,
) {
  const stateHash = hashDouyinOAuthState(value);
  const row = await admin
    .from("douyin_oauth_states")
    .select("state_hash, account_id, actor_id, expires_at, used_at")
    .eq("state_hash", stateHash)
    .maybeSingle();
  if (row.error) throw row.error;
  if (!row.data || row.data.used_at || Date.parse(row.data.expires_at) <= Date.now()) return null;

  const consumed = await admin
    .from("douyin_oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state_hash", stateHash)
    .is("used_at", null)
    .select("account_id, actor_id")
    .maybeSingle();
  if (consumed.error) throw consumed.error;
  return consumed.data ?? null;
}

export async function upsertDouyinBinding(input: {
  admin: ReturnType<typeof createAdminClient>;
  accountId: string;
  authorizedBy: string;
  token: {
    accessToken: string;
    refreshToken: string;
    openId: string;
    expiresInSeconds: number;
    refreshExpiresInSeconds: number;
    scopes: string[];
  };
  userInfo: { openId: string; nickname: string | null; avatar: string | null };
  tokenEncryptionKey: string;
}) {
  const now = Date.now();
  const row = {
    account_id: input.accountId,
    authorized_by: input.authorizedBy,
    platform_account_id: input.token.openId,
    display_name: input.userInfo.nickname,
    avatar_url: input.userInfo.avatar,
    scopes: input.token.scopes,
    access_token_ciphertext: encryptDouyinSecret(input.token.accessToken, input.tokenEncryptionKey),
    refresh_token_ciphertext: encryptDouyinSecret(input.token.refreshToken, input.tokenEncryptionKey),
    access_token_expires_at: new Date(now + input.token.expiresInSeconds * 1000).toISOString(),
    refresh_token_expires_at: new Date(now + input.token.refreshExpiresInSeconds * 1000).toISOString(),
    status: "active",
    last_error_code: null,
    last_error_summary: null,
    consecutive_failures: 0,
  };
  const result = await input.admin
    .from("douyin_account_bindings")
    .upsert(row, { onConflict: "account_id" })
    .select("id, account_id, platform_account_id, display_name, avatar_url, scopes, access_token_expires_at, refresh_token_expires_at, status")
    .single();
  if (result.error) throw result.error;
  return result.data;
}
