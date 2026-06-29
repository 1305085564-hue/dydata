import { createServiceClient } from "@/lib/supabase/service";
import { createParagraphUndoRevision } from "@/lib/rewrite/documents";
import {
  requireAuth,
  requireConversationOwner,
  errorResponse,
  parseJsonBody,
  jsonResponse,
} from "@/lib/rewrite/api-helpers";
import { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: paragraphId } = await params;
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const bodyResult = await parseJsonBody<{ conversationId: string }>(req);
  if (bodyResult instanceof Response) return bodyResult;
  const { conversationId } = bodyResult;

  if (!conversationId || !paragraphId) {
    return errorResponse("缺少参数", 400);
  }

  const ownerCheck = await requireConversationOwner(conversationId, authResult.user.id);
  if (ownerCheck) return ownerCheck;

  const service = createServiceClient();
  try {
    await createParagraphUndoRevision(service, {
      conversationId,
      paragraphId,
    });
    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "撤销失败", 500);
  }
}
