import { NextResponse } from "next/server";

import { markRead } from "@/lib/notifications/server";
import { createClient } from "@/lib/supabase/server";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

type NotificationReadDeps = {
  createClient: typeof createClient;
  markRead: typeof markRead;
};

const defaultDeps: NotificationReadDeps = { createClient, markRead };

export async function buildNotificationReadResponse(
  id: string,
  deps: NotificationReadDeps = defaultDeps,
) {
  const supabase = await deps.createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  try {
    const ok = await deps.markRead(id, user.id);
    if (!ok) return NextResponse.json({ error: "更新失败" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeMutationRequest("/api/notifications/[id]/read", request, async (observation) => {
    observation.mark("auth");
    observation.mark("validate");
    const { id } = await params;
    observation.mark("write-request");
    return appendObservedMutationResult(await buildNotificationReadResponse(id), observation);
  });
}
