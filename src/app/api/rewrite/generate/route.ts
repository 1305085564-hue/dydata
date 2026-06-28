import { createServiceClient } from "@/lib/supabase/service";
import { streamGeneration } from "@/lib/rewrite/generation";
import { getOrCreateDocument } from "@/lib/rewrite/documents";
import { selectHealthyProviderKeyModel } from "@/lib/ai/provider-routing";
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
  }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const { conversationId, userPrompt, providerKeyModelId } = bodyResult;
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
    const selectedProvider =
      providerKeyModelId?.trim()
        ? providerKeyModelId.trim()
        : (await selectHealthyProviderKeyModel(service, process.env.AI_MODEL?.trim() || undefined))
            ?.providerKeyModelId ?? null;

    const sse = createSSEStream();

    (async () => {
      try {
        for await (const event of streamGeneration(service, {
          conversationId,
          userId: user.id,
          userPrompt,
          targetParagraphIds,
          assetMentions,
          providerKeyModelId: selectedProvider,
        })) {
          sse.send(event.type, event);
        }

        sse.close();
      } catch (error) {
        sse.send("error", { error: error instanceof Error ? error.message : "生成失败" });
        sse.close();
      }
    })();

    return sse.response;
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "启动生成失败", 500);
  }
}
