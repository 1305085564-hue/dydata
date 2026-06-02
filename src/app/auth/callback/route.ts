import { NextResponse } from "next/server";

import { sanitizeNextPath } from "@/lib/auth-password";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = sanitizeNextPath(url.searchParams.get("next"), "/login");

  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL("/login?reset=expired", url.origin));
  }

  const supabase = await createClient();
  let error: Error | null = null;

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

  if (error) {
    return NextResponse.redirect(new URL("/login?reset=expired", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
