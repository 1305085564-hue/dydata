import { NextResponse } from "next/server";

import { markAllRead } from "@/lib/notifications/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const updated = await markAllRead(user.id);
  return NextResponse.json({ ok: true, updated });
}
