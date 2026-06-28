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
  requireAuth,
  requireConversationOwner,
  jsonResponse,
  errorResponse,
  parseJsonBody,
} from "@/lib/rewrite/api-helpers";
import { NextRequest } from "next/server";

const REVISION_STATUSES: RevisionStatus[] = ["pending", "completed", "failed", "aborted"];
const SOURCE_TYPES: DocumentSourceType[] = ["ai_generation", "user_edit", "paragraph_patch", "variant_adopt", "fork"];

function isRevisionStatus(value: unknown): value is RevisionStatus {
  return typeof value === "string" && REVISION_STATUSES.includes(value as RevisionStatus);
}

function isSourceType(value: unknown): value is DocumentSourceType {
  return typeof value === "string" && SOURCE_TYPES.includes(value as DocumentSourceType);
}

const routeDeps = {
  requireAuth,
  requireConversationOwner,
  parseJsonBody,
  createServiceClient,
  getDocumentByConversationId,
  getRevisionById,
  createRevision,
  createParagraphs,
  setCurrentRevision,
  splitIntoParagraphs,
  jsonResponse,
  errorResponse,
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { user } = authResult;
  const { id: conversationId } = await params;

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const service = createServiceClient();

  try {
    const document = await getDocumentByConversationId(service, conversationId);
    if (!document) {
      return errorResponse("Document 不存在", 404);
    }

    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const revisions = await listRevisionsByDocumentId(service, document.id, limit);
    return jsonResponse({ revisions });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "获取版本历史失败", 500);
  }
}

export async function buildRewriteDocumentRevisionsPostResponse(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  deps: Partial<typeof routeDeps> = {},
) {
  const actualDeps = { ...routeDeps, ...deps };
  const authResult = await actualDeps.requireAuth();
  if (!("user" in authResult)) return authResult;

  const { user } = authResult;
  const { id: conversationId } = await params;

  const ownerCheck = await actualDeps.requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const bodyResult = await actualDeps.parseJsonBody<{
    sourceType?: DocumentSourceType;
    status?: RevisionStatus;
    fullContent?: string | null;
    parentRevisionId?: string | null;
    messageId?: string | null;
    meta?: Record<string, unknown> | null;
  }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const sourceType = bodyResult.sourceType ?? "user_edit";
  const status = bodyResult.status ?? "completed";
  const fullContent = typeof bodyResult.fullContent === "string" ? bodyResult.fullContent.trim() : null;

  if (!isSourceType(sourceType)) {
    return actualDeps.errorResponse("sourceType 参数不正确", 400);
  }
  if (!isRevisionStatus(status)) {
    return actualDeps.errorResponse("status 参数不正确", 400);
  }
  if (status === "completed" && !fullContent) {
    return actualDeps.errorResponse("completed revision 必须提供 fullContent", 400);
  }

  const service = actualDeps.createServiceClient();

  try {
    const document = await actualDeps.getDocumentByConversationId(service, conversationId);
    if (!document) {
      return actualDeps.errorResponse("Document 不存在", 404);
    }

    const parentRevisionId = bodyResult.parentRevisionId ?? document.currentRevisionId;
    if (parentRevisionId) {
      const parentRevision = await actualDeps.getRevisionById(service, parentRevisionId);
      if (!parentRevision || parentRevision.documentId !== document.id) {
        return actualDeps.errorResponse("parentRevisionId 不属于当前 document", 400);
      }
    }

    const revision = await actualDeps.createRevision(service, {
      documentId: document.id,
      parentRevisionId,
      sourceType,
      status,
      fullContent,
      messageId: bodyResult.messageId ?? null,
      meta: bodyResult.meta ?? null,
    });

    if (fullContent) {
      await actualDeps.createParagraphs(service, {
        revisionId: revision.id,
        paragraphs: actualDeps.splitIntoParagraphs(fullContent).map((content, index) => ({
          paragraphId: `user-${Date.now()}-${index}`,
          position: index,
          content,
          sourceType: "user",
        })),
      });
    }

    if (status === "completed") {
      await actualDeps.setCurrentRevision(service, document.id, revision.id);
    }

    return actualDeps.jsonResponse({ revision, currentRevisionId: status === "completed" ? revision.id : document.currentRevisionId }, 201);
  } catch (error) {
    return actualDeps.errorResponse(error instanceof Error ? error.message : "提交 revision 失败", 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return buildRewriteDocumentRevisionsPostResponse(req, { params });
}
