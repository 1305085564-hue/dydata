import { NextRequest, NextResponse } from "next/server";

import { archivedFeatureResponse, isArchivedWriteEnabled } from "@/app/api/_archive";
import { requireRewriteActor, streamRewriteChat, type RewriteStreamEvent } from "@/lib/rewrite/shared";

import {
  parseJsonBody,
  toApiErrorResponse,
  toNullableString,
  toOptionalNullableString,
} from "../../_shared";

export const maxDuration = 60;

type RewriteChatBody = {
  conversationId?: string | null;
  message?: string;
  autoModeEnabled?: boolean;
  autoStep?: number | null;
  fixedModeId?: string | null;
  fixedModeKey?: string | null;
  modelViewId?: string | null;
  modelViewKey?: string | null;
  modeId?: string | null;
  modeKey?: string | null;
  lengthPresetId?: string | null;
  lengthPresetKey?: string | null;
};

function encodeEvent(encoder: TextEncoder, event: RewriteStreamEvent | { type: "error"; error: string }) {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: NextRequest) {
  if (isArchivedWriteEnabled()) {
    return archivedFeatureResponse("旧版文案助手流式改写接口已归档，请使用 /api/rewrite/generate");
  }

  const auth = await requireRewriteActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: RewriteChatBody;
  try {
    body = await parseJsonBody<RewriteChatBody>(request);
  } catch (error) {
    return toApiErrorResponse(error, "请求体格式不正确");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await streamRewriteChat(
          {
            service: auth.serviceClient,
            actor: auth.actor,
            conversationId: toNullableString(body.conversationId),
            message: body.message ?? "",
            autoModeEnabled: body.autoModeEnabled,
            autoStep: typeof body.autoStep === "number" ? body.autoStep : undefined,
            fixedModeId: toOptionalNullableString(body.fixedModeId),
            fixedModeKey: toOptionalNullableString(body.fixedModeKey),
            modelViewId: toOptionalNullableString(body.modelViewId),
            modelViewKey: toOptionalNullableString(body.modelViewKey),
            modeId: toOptionalNullableString(body.modeId),
            modeKey: toOptionalNullableString(body.modeKey),
            lengthPresetId: toOptionalNullableString(body.lengthPresetId),
            lengthPresetKey: toOptionalNullableString(body.lengthPresetKey),
          },
          {
            emit(event) {
              controller.enqueue(encodeEvent(encoder, event));
            },
          },
        );

        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "改写失败";
        controller.enqueue(encodeEvent(encoder, { type: "error", error: message }));
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
