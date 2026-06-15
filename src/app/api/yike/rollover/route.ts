import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { rolloverYikeItems } from "@/lib/yike/service";

import {
  isAuthorizedCronRequest,
  jsonBadRequest,
  jsonInternalError,
  jsonYikeError,
  parseYikeDate,
  readJsonBody,
  requireYikeActor,
} from "../_shared";

export async function POST(request: NextRequest) {
  const today = parseYikeDate(request);
  if (!today) return jsonBadRequest("date 必须是 YYYY-MM-DD");

  let actor = null as { userId: string } | null;

  if (isAuthorizedCronRequest(request)) {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const userId = body.body && typeof body.body === "object" && "userId" in body.body
      ? (body.body as { userId?: unknown }).userId
      : null;
    if (typeof userId !== "string" || !userId) {
      return jsonBadRequest("cron 顺延需要 userId");
    }
    actor = { userId };
  } else {
    const auth = await requireYikeActor();
    if (!auth.ok) return auth.response;
    actor = auth.actor;
  }

  try {
    const result = await rolloverYikeItems(actor, today);
    if (!result.ok) return jsonYikeError(result.error);
    return NextResponse.json({ ok: true, ...result.data, today });
  } catch (error) {
    return jsonInternalError(error, "顺延此刻事项失败");
  }
}
