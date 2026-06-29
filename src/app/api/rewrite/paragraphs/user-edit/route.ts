import { createServiceClient } from "@/lib/supabase/service";
import { createUserEditRevision } from "@/lib/rewrite/documents";
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
    paragraphId: string;
    newContent: string;
  }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const { conversationId, paragraphId, newContent } = bodyResult;

  if (!conversationId || !paragraphId || typeof newContent !== 'string') {
    return errorResponse("缺少必需参数");
  }

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const service = createServiceClient();

  try {
    const result = await createUserEditRevision(service, {
      conversationId,
      userId: user.id,
      paragraphId,
      newContent,
    });

    return jsonResponse(result, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "保存修改失败", 500);
  }
}
