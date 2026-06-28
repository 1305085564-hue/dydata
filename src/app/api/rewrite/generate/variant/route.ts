import { createServiceClient } from "@/lib/supabase/service";
import { createVariant } from "@/lib/rewrite/documents";
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
    documentId: string;
    generationRunId: string;
    targetParagraphIds: string[];
    content: string;
    label?: string;
  }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const { conversationId, documentId, generationRunId, targetParagraphIds, content, label } = bodyResult;

  if (!conversationId || !documentId || !generationRunId || !targetParagraphIds || !content) {
    return errorResponse("缺少必需参数");
  }

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const service = createServiceClient();

  try {
    const variant = await createVariant(service, {
      documentId,
      generationRunId,
      targetParagraphIds,
      content,
      label: label ?? null,
    });

    return jsonResponse({ variant }, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "创建变体失败", 500);
  }
}
