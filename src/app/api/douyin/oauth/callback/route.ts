import { NextResponse } from "next/server";

import { getDouyinConfig } from "@/lib/douyin/config";
import { getConfiguredDouyinClient, consumeDouyinOAuthState, upsertDouyinBinding } from "@/lib/douyin/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const config = getDouyinConfig();
  const resultUrl = new URL("/dashboard", config.redirectUri);
  resultUrl.searchParams.set("douyin", "error");

  const providerError = url.searchParams.get("error");
  if (providerError) {
    resultUrl.searchParams.set("code", "AUTHORIZATION_DENIED");
    return NextResponse.redirect(resultUrl);
  }

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) {
    resultUrl.searchParams.set("code", "INVALID_CALLBACK");
    return NextResponse.redirect(resultUrl);
  }

  const admin = createAdminClient();
  const intent = await consumeDouyinOAuthState(admin, state);
  if (!intent) {
    resultUrl.searchParams.set("code", "INVALID_OR_EXPIRED_STATE");
    return NextResponse.redirect(resultUrl);
  }

  try {
    const { config: clientConfig, client } = getConfiguredDouyinClient();
    const token = await client.exchangeCode(code);
    const userInfo = await client.getUserInfo({ accessToken: token.accessToken, openId: token.openId });
    const binding = await upsertDouyinBinding({
      admin,
      accountId: intent.account_id,
      authorizedBy: intent.actor_id,
      token,
      userInfo,
      tokenEncryptionKey: clientConfig.tokenEncryptionKey,
    });
    resultUrl.searchParams.set("douyin", "connected");
    resultUrl.searchParams.set("accountId", binding.account_id);
    return NextResponse.redirect(resultUrl);
  } catch (error) {
    resultUrl.searchParams.set("code", error instanceof Error && error.message.startsWith("DOUYIN_") ? error.message.split(":")[0] : "AUTHORIZATION_FAILED");
    return NextResponse.redirect(resultUrl);
  }
}
