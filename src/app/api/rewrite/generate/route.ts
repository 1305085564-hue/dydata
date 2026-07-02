import { createServiceClient } from "@/lib/supabase/service";
import { streamGeneration } from "@/lib/rewrite/generation";
import { getOrCreateDocument } from "@/lib/rewrite/documents";
import { insertRewriteMessage } from "@/lib/rewrite/shared";
import {
  requireAuth,
  requireConversationOwner,
  errorResponse,
  parseJsonBody,
  createSSEStream,
} from "@/lib/rewrite/api-helpers";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { user } = authResult;

  const bodyResult = await parseJsonBody<{
    conversationId: string;
    userPrompt: string;
    targetParagraphIds?: unknown;
    assetMentions?: unknown;
    providerKeyModelId?: string;
    modelViewId?: string;
    contextLimit?: number;
  }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const { conversationId, userPrompt, providerKeyModelId, modelViewId, contextLimit } = bodyResult;
  const targetParagraphIds = Array.isArray(bodyResult.targetParagraphIds)
    ? bodyResult.targetParagraphIds
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
  const assetMentions = Array.isArray(bodyResult.assetMentions)
    ? bodyResult.assetMentions
        .filter((item): item is { id: string; name: string } =>
          Boolean(
            item &&
              typeof item === "object" &&
              typeof (item as { id?: unknown }).id === "string" &&
              typeof (item as { name?: unknown }).name === "string" &&
              (item as { id: string }).id.trim() &&
              (item as { name: string }).name.trim(),
          ),
        )
        .map((item) => ({ id: item.id.trim(), name: item.name.trim() }))
    : [];

  if (!conversationId || !userPrompt) {
    return errorResponse("缺少 conversationId 或 userPrompt");
  }

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const service = createServiceClient();

  try {
    await getOrCreateDocument(service, conversationId);

    const sse = createSSEStream();

    (async () => {
      try {
        await insertRewriteMessage(service as never, {
          conversationId,
          userId: user.id,
          role: "user",
          content: userPrompt,
          generationMode: "single",
          messageStatus: "success",
          requestSnapshot: {
            autoModeEnabled: false,
            modelViewId: modelViewId?.trim() || null,
            modeId: null,
            lengthPresetId: null,
            workflowId: null,
          },
        });

        let completedContent = "";
        let generationError = "";
        for await (const event of streamGeneration(service, {
          conversationId,
          userId: user.id,
          userPrompt,
          targetParagraphIds,
          assetMentions,
          providerKeyModelId: providerKeyModelId?.trim() || null,
          modelViewId: modelViewId?.trim() || null,
          contextLimit: typeof contextLimit === "number" ? contextLimit : null,
        })) {
          if (event.type === "generation_complete") {
            completedContent = event.fullContent;
          }
          if (event.type === "error") {
            generationError = event.error;
          }

          sse.send(event.type, event);
        }

        if (generationError) {
          await insertRewriteMessage(service as never, {
            conversationId,
            userId: user.id,
            role: "assistant",
            content: generationError,
            generationMode: "single",
            messageStatus: "failed",
            errorMessage: generationError,
            requestSnapshot: {
              autoModeEnabled: false,
              modelViewId: modelViewId?.trim() || null,
              modeId: null,
              lengthPresetId: null,
              workflowId: null,
            },
          });
        } else if (completedContent.trim()) {
          await insertRewriteMessage(service as never, {
            conversationId,
            userId: user.id,
            role: "assistant",
            content: completedContent,
            generationMode: "single",
            messageStatus: "success",
            requestSnapshot: {
              autoModeEnabled: false,
              modelViewId: modelViewId?.trim() || null,
              modeId: null,
              lengthPresetId: null,
              workflowId: null,
            },
          });
        }

        sse.close();
      } catch (error) {
        await insertRewriteMessage(service as never, {
          conversationId,
          userId: user.id,
          role: "assistant",
          content: error instanceof Error ? error.message : "生成失败",
          generationMode: "single",
          messageStatus: "failed",
          errorMessage: error instanceof Error ? error.message : "生成失败",
          requestSnapshot: {
            autoModeEnabled: false,
            modelViewId: modelViewId?.trim() || null,
            modeId: null,
            lengthPresetId: null,
            workflowId: null,
          },
        }).catch(() => {});
        sse.send("error", { error: error instanceof Error ? error.message : "生成失败" });
        sse.close();
      }
    })();

    return sse.response;
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "启动生成失败", 500);
  }
}
