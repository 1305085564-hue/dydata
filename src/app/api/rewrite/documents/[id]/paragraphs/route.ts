import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentDocumentSnapshot } from "@/lib/rewrite/documents";
import { requireAuth, requireConversationOwner, jsonResponse, errorResponse } from "@/lib/rewrite/api-helpers";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { user } = authResult;
  const { id: conversationId } = await params;

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const service = createServiceClient();

  try {
    const snapshot = await getCurrentDocumentSnapshot(service, conversationId);
    if (!snapshot) {
      return errorResponse("Document 不存在", 404);
    }

    return jsonResponse({ paragraphs: snapshot.paragraphs });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "获取段落失败", 500);
  }
}
