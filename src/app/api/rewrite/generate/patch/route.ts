import { createServiceClient } from "@/lib/supabase/service";
import { createParagraphPatchRevision } from "@/lib/rewrite/generation";
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
    generationRunId: string;
    targetParagraphIds: string[];
    patchedContent: string;
  }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const { conversationId, generationRunId, targetParagraphIds, patchedContent } = bodyResult;

  if (!conversationId || !generationRunId || !targetParagraphIds || !patchedContent) {
    return errorResponse("缺少必需参数");
  }

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const service = createServiceClient();

  try {
    const result = await createParagraphPatchRevision(service, {
      conversationId,
      userId: user.id,
      generationRunId,
      targetParagraphIds,
      patchedContent,
    });

    return jsonResponse(result, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "段落修补失败", 500);
  }
}
