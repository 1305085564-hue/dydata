import { NextResponse } from "next/server";

import { markDone } from "@/lib/notifications/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

export type NotificationDoneFailureLookup = {
  data: { id: string } | null;
  error: unknown;
};

/** markDone 已返回 false 时，区分“无匹配行/非本人”和数据库异常。 */
export function notificationDoneFailureStatus(result: NotificationDoneFailureLookup) {
  if (result.error || result.data) return 500;
  return 404;
}

type NotificationDoneDeps = {
  createClient: typeof createClient;
  markDone: typeof markDone;
  classifyMarkDoneFailure: typeof classifyMarkDoneFailure;
};

export const defaultNotificationDoneDeps: NotificationDoneDeps = { createClient, markDone, classifyMarkDoneFailure };

export async function buildNotificationDoneResponse(
  id: string,
  reason: "done" | "ignored" = "done",
  deps: NotificationDoneDeps = defaultNotificationDoneDeps,
) {
  const supabase = await deps.createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  try {
    const ok = await deps.markDone(id, user.id, reason);
    if (ok) return NextResponse.json({ ok: true, todoMarked: true }, { status: 200 });
    const status = await deps.classifyMarkDoneFailure(id, user.id);
    return status === 404
      ? NextResponse.json({ error: "未找到通知" }, { status: 404 })
      : NextResponse.json({ error: "更新失败" }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

async function classifyMarkDoneFailure(id: string, userId: string) {
  try {
    const result = await createAdminClient()
      .from("notifications")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    return notificationDoneFailureStatus(result);
  } catch {
    return 500;
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeMutationRequest("/api/notifications/[id]/done", request, async (observation) => {
    const respond = (body: Record<string, unknown>, status: number) =>
      NextResponse.json(body, { status });

    observation.mark("auth");
    observation.mark("validate");
    const { id } = await params;

    let reason: "done" | "ignored" = "done";
    try {
      const body = (await request.json()) as { reason?: unknown };
      if (body && body.reason !== undefined) {
        if (body.reason === "done" || body.reason === "ignored") {
          reason = body.reason;
        } else {
          return appendObservedMutationResult(respond({ error: "reason 取值必须为 done/ignored" }, 400), observation);
        }
      }
    } catch {
      // body 为空也可，按默认 done
    }

    observation.mark("write-request");
    return appendObservedMutationResult(await buildNotificationDoneResponse(id, reason), observation);
  });
}
