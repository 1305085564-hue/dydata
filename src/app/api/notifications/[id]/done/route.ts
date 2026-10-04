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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return appendObservedMutationResult(respond({ error: "未登录" }, 401), observation);

    observation.mark("validate");
    const { id } = await params;
    if (!id) return appendObservedMutationResult(respond({ error: "缺少 id" }, 400), observation);

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

    let ok = false;
    try {
      observation.mark("write-request");
      ok = await markDone(id, user.id, reason);
    } catch {
      return appendObservedMutationResult(respond({ error: "更新失败" }, 500), observation);
    }
    if (!ok) {
      const status = await classifyMarkDoneFailure(id, user.id);
      return appendObservedMutationResult(status === 404 ? respond({ error: "未找到通知" }, 404) : respond({ error: "更新失败" }, 500), observation);
    }
    observation.mark("finalize");
    return appendObservedMutationResult(respond({ ok: true, todoMarked: true }, 200), observation);
  });
}
