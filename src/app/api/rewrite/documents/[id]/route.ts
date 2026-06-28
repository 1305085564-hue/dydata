import { createServiceClient } from "@/lib/supabase/service";
import {
  getDocumentByConversationId,
  getOrCreateDocument,
  updateDocumentTitle,
} from "@/lib/rewrite/documents";
import {
  requireAuth,
  requireConversationOwner,
  jsonResponse,
  errorResponse,
  parseJsonBody,
} from "@/lib/rewrite/api-helpers";
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
    const document = await getOrCreateDocument(service, conversationId);
    return jsonResponse({ document });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "获取 document 失败", 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { user } = authResult;
  const { id: conversationId } = await params;

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const bodyResult = await parseJsonBody<{ title: string }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const { title } = bodyResult;

  if (!title) {
    return errorResponse("缺少 title 参数");
  }

  const service = createServiceClient();

  try {
    const document = await getDocumentByConversationId(service, conversationId);
    if (!document) {
      return errorResponse("Document 不存在", 404);
    }

    await updateDocumentTitle(service, document.id, title);
    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "更新标题失败", 500);
  }
}
