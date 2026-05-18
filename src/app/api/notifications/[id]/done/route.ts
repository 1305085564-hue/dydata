import { NextResponse } from "next/server";

import { markDone } from "@/lib/notifications/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  let reason: "done" | "ignored" = "done";
  try {
    const body = (await request.json()) as { reason?: "done" | "ignored" };
    if (body?.reason === "ignored") reason = "ignored";
  } catch {
    // body 为空也可
  }

  const ok = await markDone(id, user.id, reason);
  if (!ok) return NextResponse.json({ error: "更新失败" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
