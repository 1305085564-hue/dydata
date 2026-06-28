import { createServiceClient } from "@/lib/supabase/service";
import { adoptVariant, createRevision, createParagraphs, setCurrentRevision } from "@/lib/rewrite/documents";
import {
  requireAuth,
  requireConversationOwner,
  jsonResponse,
  errorResponse,
  parseJsonBody,
} from "@/lib/rewrite/api-helpers";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { user } = authResult;

  const bodyResult = await parseJsonBody<{
    conversationId: string;
    variantId: string;
    documentId: string;
    content: string;
  }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const { conversationId, variantId, documentId, content } = bodyResult;

  if (!conversationId || !variantId || !documentId || !content) {
    return errorResponse("缺少必需参数");
  }

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const service = createServiceClient();

  try {
    const revision = await createRevision(service, {
      documentId,
      sourceType: "variant_adopt",
      status: "completed",
      fullContent: content,
    });

    const paragraphContents = content.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    const paragraphs = paragraphContents.map((c, i) => ({
      paragraphId: `adopted-${Date.now()}-${i}`,
      position: i,
      content: c,
      isLocked: false,
      sourceType: "ai" as const,
    }));

    await createParagraphs(service, {
      revisionId: revision.id,
      paragraphs,
    });

    await setCurrentRevision(service, documentId, revision.id);
    await adoptVariant(service, variantId, revision.id);

    return jsonResponse({ revisionId: revision.id }, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "采纳变体失败", 500);
  }
}
