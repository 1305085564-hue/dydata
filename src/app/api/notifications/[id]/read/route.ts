import { NextResponse } from "next/server";

import { markRead } from "@/lib/notifications/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const ok = await markRead(id, user.id);
  if (!ok) return NextResponse.json({ error: "更新失败" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
