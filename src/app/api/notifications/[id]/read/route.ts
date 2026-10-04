import { NextResponse } from "next/server";

import { markRead } from "@/lib/notifications/server";
import { createClient } from "@/lib/supabase/server";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeMutationRequest("/api/notifications/[id]/read", request, async (observation) => {
    observation.mark("auth");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return appendObservedMutationResult(NextResponse.json({ error: "未登录" }, { status: 401 }), observation);
    }
    observation.mark("validate");
    const { id } = await params;
    if (!id) return appendObservedMutationResult(NextResponse.json({ error: "缺少 id" }, { status: 400 }), observation);

    let ok = false;
    try {
      observation.mark("write-request");
      ok = await markRead(id, user.id);
    } catch {
      return appendObservedMutationResult(NextResponse.json({ error: "更新失败" }, { status: 500 }), observation);
    }
    if (!ok) return appendObservedMutationResult(NextResponse.json({ error: "更新失败" }, { status: 500 }), observation);
    observation.mark("finalize");
    return appendObservedMutationResult(NextResponse.json({ ok: true }), observation);
  });
}
