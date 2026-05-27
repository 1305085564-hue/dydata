import { NextRequest, NextResponse } from "next/server";

import { handleRewriteChat, requireRewriteActor } from "@/lib/rewrite/shared";

import { parseJsonBody, toApiErrorResponse, toNullableString } from "../_shared";

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
      modelViewId: toNullableString(body.modelViewId),
      modelViewKey: toNullableString(body.modelViewKey),
      modeId: body.modeId === null ? null : toNullableString(body.modeId),
      modeKey: body.modeKey === null ? null : toNullableString(body.modeKey),
      lengthPresetId: toNullableString(body.lengthPresetId),
      lengthPresetKey: toNullableString(body.lengthPresetKey),
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toApiErrorResponse(error, "改写失败");
  }
}
