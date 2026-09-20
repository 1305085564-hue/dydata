import { NextRequest, NextResponse } from "next/server";

import { listConversationMessages, requireRewriteActor } from "@/lib/rewrite/shared";
import { toApiErrorResponse } from "@/app/api/content-tools/rewrite/_shared";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Params) {
  const auth = await requireRewriteActor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;
    return NextResponse.json(await listConversationMessages(auth.serviceClient, {
      userId: auth.actor.userId,
      conversationId: id,
    }));
  } catch (error) {
    return toApiErrorResponse(error, "消息列表加载失败");
  }
}
