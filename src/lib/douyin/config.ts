import { createHash, randomBytes } from "node:crypto";

import { DOUYIN_SCOPE, type DouyinScope } from "./contracts";

export const DOUYIN_DEFAULT_SCOPES = [
  ...DOUYIN_SCOPE,
  "data.external.user",
] as const satisfies readonly DouyinScope[];

export type DouyinConfig = {
  clientKey: string;
  clientSecret: string;
  tokenEncryptionKey: string;
  redirectUri: string;
  scopes: readonly string[];
};

export function getDouyinConfig(env: NodeJS.ProcessEnv = process.env): DouyinConfig {
  const clientKey = requiredEnv(env.DOUYIN_CLIENT_KEY, "DOUYIN_CLIENT_KEY");
  const clientSecret = requiredEnv(env.DOUYIN_CLIENT_SECRET, "DOUYIN_CLIENT_SECRET");
  const tokenEncryptionKey = requiredEnv(env.DOUYIN_TOKEN_ENCRYPTION_KEY, "DOUYIN_TOKEN_ENCRYPTION_KEY");
  const appUrl = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const redirectUri = env.DOUYIN_REDIRECT_URI?.trim() || (appUrl ? `${appUrl}/api/douyin/oauth/callback` : null);
  if (!redirectUri) throw new Error("Missing DOUYIN_REDIRECT_URI or NEXT_PUBLIC_APP_URL");
  return {
    clientKey,
    clientSecret,
    tokenEncryptionKey,
    redirectUri,
    scopes: DOUYIN_DEFAULT_SCOPES,
  };
}

export function createDouyinOAuthState(now = Date.now()): { value: string; hash: string; expiresAt: number } {
  const value = randomBytes(32).toString("base64url");
  return { value, hash: hashDouyinOAuthState(value), expiresAt: now + 10 * 60 * 1000 };
}

export function hashDouyinOAuthState(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requiredEnv(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing ${name}`);
  return normalized;
}
