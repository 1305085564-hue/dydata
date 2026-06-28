import { NextRequest } from "next/server";

import {
  requireAuth,
  jsonResponse,
  errorResponse,
  parseJsonBody,
} from "@/lib/rewrite/api-helpers";
import { updateParagraphLockStatus } from "@/lib/rewrite/documents";
import { createServiceClient } from "@/lib/supabase/service";

type ParagraphLookupRow = {
  revision_id: string;
  paragraph_id: string;
  revision:
    | {
        document:
          | {
              conversation_id: string;
              conversation:
                | { user_id: string }
                | Array<{ user_id: string }>
                | null;
            }
          | Array<{
              conversation_id: string;
              conversation:
                | { user_id: string }
                | Array<{ user_id: string }>
                | null;
            }>
          | null;
      }
    | Array<{
        document:
          | {
              conversation_id: string;
              conversation:
                | { user_id: string }
                | Array<{ user_id: string }>
                | null;
            }
          | Array<{
              conversation_id: string;
              conversation:
                | { user_id: string }
                | Array<{ user_id: string }>
                | null;
            }>
          | null;
      }>
    | null;
};

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const bodyResult = await parseJsonBody<{ isLocked: boolean }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  if (typeof bodyResult.isLocked !== "boolean") {
    return errorResponse("缺少 isLocked 参数", 400);
  }

  const service = createServiceClient();
  const { id: paragraphRowId } = await params;
  const { data, error } = await service
    .from("rewrite_document_paragraphs")
    .select(`
      revision_id,
      paragraph_id,
      revision:rewrite_document_revisions(
        document:rewrite_documents(
          conversation_id,
          conversation:rewrite_conversations(user_id)
        )
      )
    `)
    .eq("id", paragraphRowId)
    .maybeSingle();

  if (error) {
    return errorResponse(error.message, 500);
  }

  if (!data) {
    return errorResponse("段落不存在", 404);
  }

  const row = data as ParagraphLookupRow;
  const revision = firstOrNull(row.revision);
  const document = firstOrNull(revision?.document);
  const conversation = firstOrNull(document?.conversation);

  if (!conversation || conversation.user_id !== authResult.user.id) {
    return errorResponse("无权访问此段落", 403);
  }

  try {
    await updateParagraphLockStatus(service, row.revision_id, row.paragraph_id, bodyResult.isLocked);
    return jsonResponse({ data: { isLocked: bodyResult.isLocked } });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "更新段落锁定失败", 500);
  }
}
