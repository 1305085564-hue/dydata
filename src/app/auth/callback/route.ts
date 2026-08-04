import { NextResponse } from "next/server";

import { getCallbackNextPath } from "@/lib/auth-password";
import { createClient } from "@/lib/supabase/server";

function classifyCallbackError(error: Error): "pkce" | "expired" {
  const msg = error.message.toLowerCase();
  if (msg.includes("verifier") || msg.includes("pkce") || msg.includes("code_verifier")) {
    return "pkce";
  }
  return "expired";
}

function normalizeCallbackError(error: unknown) {
  if (error instanceof Error) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return new Error(error.message);
  }
  return new Error("Auth callback failed");
}

function logCallbackDebug(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.debug(`[auth/callback] ${event}`, details);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = getCallbackNextPath(type, url.searchParams.get("next"));

  logCallbackDebug("received", {
    type,
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    next,
  });

  if (!code && !tokenHash) {
    logCallbackDebug("missing-params", { type, next });
    return NextResponse.redirect(new URL("/login?reset=expired", url.origin));
  }

  let error: Error | null = null;

  try {
    const supabase = await createClient();

    if (code) {
      const result = await supabase.auth.exchangeCodeForSession(code);
      error = result.error;
    } else if (tokenHash && type) {
      const result = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as "recovery" | "signup" | "invite" | "magiclink" | "email" | "email_change",
      });
      error = result.error;
    } else {
      error = new Error("Missing auth callback params");
    }
  } catch (caught) {
    error = normalizeCallbackError(caught);
  }

  if (error) {
    const kind = classifyCallbackError(error);
    logCallbackDebug("failed", { type, kind, message: error.message });
    return NextResponse.redirect(new URL(`/login?reset=${kind}`, url.origin));
  }

  logCallbackDebug("success", { type, next });
  return NextResponse.redirect(new URL(next, url.origin));
}
