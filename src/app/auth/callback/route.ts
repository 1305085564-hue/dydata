import { NextResponse } from "next/server";

import { sanitizeNextPath } from "@/lib/auth-password";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = sanitizeNextPath(url.searchParams.get("next"), "/login");

  if (!code) {
    return NextResponse.redirect(new URL("/login?reset=expired", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?reset=expired", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
