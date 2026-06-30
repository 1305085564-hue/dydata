import { NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import {
  getDocumentHistoryState,
  moveDocumentHistoryPointer,
} from "@/lib/rewrite/documents";
import {
  errorResponse,
  jsonResponse,
  parseJsonBody,
  requireAuth,
  requireConversationOwner,
} from "@/lib/rewrite/api-helpers";

type HistoryAction = "undo" | "redo";

function isHistoryAction(value: unknown): value is HistoryAction {
  return value === "undo" || value === "redo";
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { user } = authResult;
  const { id: conversationId } = await params;

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const service = createServiceClient();

  try {
    const state = await getDocumentHistoryState(service, conversationId);
    if (!state) {
      return errorResponse("Document 不存在", 404);
    }

    return jsonResponse(state);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "获取历史状态失败", 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { user } = authResult;
  const { id: conversationId } = await params;

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const bodyResult = await parseJsonBody<{ action?: unknown }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  if (!isHistoryAction(bodyResult.action)) {
    return errorResponse("action 参数必须是 undo 或 redo", 400);
  }

  const service = createServiceClient();

  try {
    const state = await moveDocumentHistoryPointer(service, {
      conversationId,
      direction: bodyResult.action,
    });

    return jsonResponse(state);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "切换历史版本失败", 400);
  }
}
