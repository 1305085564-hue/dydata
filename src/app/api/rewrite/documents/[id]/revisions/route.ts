import { NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import {
  createParagraphs,
  createRevision,
  getDocumentByConversationId,
  getRevisionById,
  listRevisionsByDocumentId,
  setCurrentRevision,
  splitIntoParagraphs,
  type DocumentSourceType,
  type RevisionStatus,
} from "@/lib/rewrite/documents";
import {
  errorResponse,
  jsonResponse,
  parseJsonBody,
  requireAuth,
  requireConversationOwner,
} from "@/lib/rewrite/api-helpers";

const REVISION_STATUSES: RevisionStatus[] = ["pending", "completed", "failed", "aborted"];
const SOURCE_TYPES: DocumentSourceType[] = ["ai_generation", "user_edit", "paragraph_patch", "variant_adopt", "fork"];

function isRevisionStatus(value: unknown): value is RevisionStatus {
  return typeof value === "string" && REVISION_STATUSES.includes(value as RevisionStatus);
}

function isSourceType(value: unknown): value is DocumentSourceType {
  return typeof value === "string" && SOURCE_TYPES.includes(value as DocumentSourceType);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { id: conversationId } = await params;
  const ownerCheck = await requireConversationOwner(conversationId, authResult.user.id);
  if (ownerCheck) return ownerCheck;

  try {
    const document = await getDocumentByConversationId(createServiceClient(), conversationId);
    if (!document) return errorResponse("Document 不存在", 404);

    const rawLimit = new URL(request.url).searchParams.get("limit");
    const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;
    const revisions = await listRevisionsByDocumentId(createServiceClient(), document.id, limit);
    return jsonResponse({ revisions });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "获取版本历史失败");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { id: conversationId } = await params;
  const ownerCheck = await requireConversationOwner(conversationId, authResult.user.id);
  if (ownerCheck) return ownerCheck;

  const bodyResult = await parseJsonBody<{
    sourceType?: unknown;
    status?: unknown;
    fullContent?: unknown;
    parentRevisionId?: unknown;
    messageId?: unknown;
    meta?: Record<string, unknown> | null;
  }>(request);
  if (bodyResult instanceof Response) return bodyResult;

  const sourceType = bodyResult.sourceType ?? "user_edit";
  const status = bodyResult.status ?? "completed";
  const fullContent = typeof bodyResult.fullContent === "string" ? bodyResult.fullContent.trim() : null;
  if (!isSourceType(sourceType)) return errorResponse("sourceType 参数不正确", 400);
  if (!isRevisionStatus(status)) return errorResponse("status 参数不正确", 400);
  if (status === "completed" && !fullContent) {
    return errorResponse("completed revision 必须提供 fullContent", 400);
  }

  try {
    const service = createServiceClient();
    const document = await getDocumentByConversationId(service, conversationId);
    if (!document) return errorResponse("Document 不存在", 404);

    const parentRevisionId = typeof bodyResult.parentRevisionId === "string"
      ? bodyResult.parentRevisionId
      : document.currentRevisionId;
    if (parentRevisionId) {
      const parentRevision = await getRevisionById(service, parentRevisionId);
      if (!parentRevision || parentRevision.documentId !== document.id) {
        return errorResponse("parentRevisionId 不属于当前 document", 400);
      }
    }

    const revision = await createRevision(service, {
      documentId: document.id,
      parentRevisionId,
      sourceType,
      status,
      fullContent,
      messageId: typeof bodyResult.messageId === "string" ? bodyResult.messageId : null,
      meta: bodyResult.meta ?? null,
    });

    if (fullContent) {
      await createParagraphs(service, {
        revisionId: revision.id,
        paragraphs: splitIntoParagraphs(fullContent).map((content, index) => ({
          paragraphId: `user-${Date.now()}-${index}`,
          position: index,
          content,
          sourceType: "user",
        })),
      });
    }

    if (status === "completed") await setCurrentRevision(service, document.id, revision.id);
    return jsonResponse({ revision, currentRevisionId: status === "completed" ? revision.id : document.currentRevisionId }, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "提交 revision 失败");
  }
}
