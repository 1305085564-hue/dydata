import { NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentDocumentSnapshot } from "@/lib/rewrite/documents";
import { errorResponse, jsonResponse, requireAuth, requireConversationOwner } from "@/lib/rewrite/api-helpers";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { id: conversationId } = await params;
  const ownerCheck = await requireConversationOwner(conversationId, authResult.user.id);
  if (ownerCheck) return ownerCheck;

  try {
    const snapshot = await getCurrentDocumentSnapshot(createServiceClient(), conversationId);
    if (!snapshot) return errorResponse("Document 不存在", 404);
    return jsonResponse({ paragraphs: snapshot.paragraphs });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "获取段落失败");
  }
}
