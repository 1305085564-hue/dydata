import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  return NextResponse.json({
    items: [],
    summary: {
      total: 0,
      unread: 0,
      viewed: 0,
      delivery_disabled: true,
    },
  });
}
