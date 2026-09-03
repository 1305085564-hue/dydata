import { NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { createUserEditRevision } from "@/lib/rewrite/documents";
import {
  errorResponse,
  jsonResponse,
  parseJsonBody,
  requireAuth,
  requireConversationOwner,
} from "@/lib/rewrite/api-helpers";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const bodyResult = await parseJsonBody<{
    conversationId?: unknown;
    paragraphId?: unknown;
    newContent?: unknown;
  }>(request);
  if (bodyResult instanceof Response) return bodyResult;

  if (
    typeof bodyResult.conversationId !== "string" ||
    !bodyResult.conversationId.trim() ||
    typeof bodyResult.paragraphId !== "string" ||
    !bodyResult.paragraphId.trim() ||
    typeof bodyResult.newContent !== "string"
  ) {
    return errorResponse("缺少必需参数", 400);
  }

  const conversationId = bodyResult.conversationId.trim();
  const ownerCheck = await requireConversationOwner(conversationId, authResult.user.id);
  if (ownerCheck) return ownerCheck;

  try {
    const result = await createUserEditRevision(createServiceClient(), {
      conversationId,
      userId: authResult.user.id,
      paragraphId: bodyResult.paragraphId.trim(),
      newContent: bodyResult.newContent,
    });
    return jsonResponse(result, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "保存修改失败");
  }
}
