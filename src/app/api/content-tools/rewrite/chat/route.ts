import { NextRequest, NextResponse } from "next/server";

import { handleRewriteChat, requireRewriteActor } from "@/lib/rewrite/shared";

import {
  parseJsonBody,
  toApiErrorResponse,
  toNullableString,
  toOptionalNullableString,
} from "../_shared";

// 自动模式两步 AI 串行调用，需要足够的执行时间
export const maxDuration = 60;

type RewriteChatBody = {
  conversationId?: string | null;
  message?: string;
  autoModeEnabled?: boolean;
  modelViewId?: string | null;
  modelViewKey?: string | null;
  modeId?: string | null;
  modeKey?: string | null;
  lengthPresetId?: string | null;
  lengthPresetKey?: string | null;
};

export async function POST(request: NextRequest) {
  const auth = await requireRewriteActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await parseJsonBody<RewriteChatBody>(request);
    const payload = await handleRewriteChat({
      service: auth.serviceClient,
      actor: auth.actor,
      conversationId: toNullableString(body.conversationId),
      message: body.message ?? "",
      autoModeEnabled: body.autoModeEnabled,
      modelViewId: toOptionalNullableString(body.modelViewId),
      modelViewKey: toOptionalNullableString(body.modelViewKey),
      modeId: toOptionalNullableString(body.modeId),
      modeKey: toOptionalNullableString(body.modeKey),
      lengthPresetId: toOptionalNullableString(body.lengthPresetId),
      lengthPresetKey: toOptionalNullableString(body.lengthPresetKey),
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toApiErrorResponse(error, "改写失败");
  }
}
