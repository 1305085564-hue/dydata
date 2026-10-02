import { NextResponse } from "next/server";

import { markDone } from "@/lib/notifications/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationDoneFailureLookup = {
  data: { id: string } | null;
  error: unknown;
};

/** markDone 已返回 false 时，区分“无匹配行/非本人”和数据库异常。 */
export function notificationDoneFailureStatus(result: NotificationDoneFailureLookup) {
  if (result.error || result.data) return 500;
  return 404;
}

function appendRequestIdHeader(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  headers.set("x-dydata-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function resolveRequestId(request: Request) {
  const supplied = request.headers.get("x-dydata-request-id")?.trim();
  return supplied || crypto.randomUUID();
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
  const requestId = resolveRequestId(request);
  const respond = (body: Record<string, unknown>, status: number) =>
    appendRequestIdHeader(NextResponse.json(body, { status }), requestId);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return respond({ error: "未登录" }, 401);

  const { id } = await params;
  if (!id) return respond({ error: "缺少 id" }, 400);

  let reason: "done" | "ignored" = "done";
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (body && body.reason !== undefined) {
      if (body.reason === "done" || body.reason === "ignored") {
        reason = body.reason;
      } else {
        return respond({ error: "reason 取值必须为 done/ignored" }, 400);
      }
    }
  } catch {
    // body 为空也可，按默认 done
  }

  let ok = false;
  try {
    ok = await markDone(id, user.id, reason);
  } catch {
    return respond({ error: "更新失败" }, 500);
  }
  if (!ok) {
    const status = await classifyMarkDoneFailure(id, user.id);
    return status === 404
      ? respond({ error: "未找到通知" }, 404)
      : respond({ error: "更新失败" }, 500);
  }
  return respond({ ok: true }, 200);
}
