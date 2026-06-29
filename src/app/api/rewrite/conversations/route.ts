import { NextRequest } from "next/server";

import { requireAuth, jsonResponse, errorResponse, parseJsonBody } from "@/lib/rewrite/api-helpers";
import { createV2Conversation } from "@/lib/rewrite/bootstrap";
import { listUserConversations } from "@/lib/rewrite/shared";
import { createServiceClient } from "@/lib/supabase/service";

function toPositiveLimit(value: string | null, fallback = 30, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const service = createServiceClient();
  const limit = toPositiveLimit(new URL(req.url).searchParams.get("limit"));

  try {
    const conversations = await listUserConversations(service as never, {
      userId: authResult.user.id,
      limit: limit * 3,
    });
    const v2Conversations = conversations.filter((conversation) => conversation.schemaVersion === 2);
    const conversationIds = v2Conversations.map((conversation) => conversation.id);

    if (conversationIds.length === 0) {
      return jsonResponse({ conversations: [] });
    }

    const { data, error } = await service
      .from("rewrite_documents")
      .select("conversation_id, current_revision_id")
      .in("conversation_id", conversationIds)
      .not("current_revision_id", "is", null);

    if (error) {
      throw new Error(error.message);
    }

    const visibleIds = new Set(
      ((data ?? []) as Array<{ conversation_id: string; current_revision_id: string | null }>)
        .filter((row) => row.current_revision_id)
        .map((row) => row.conversation_id),
    );

    return jsonResponse({
      conversations: v2Conversations.filter((conversation) => visibleIds.has(conversation.id)).slice(0, limit),
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error : new Error("v2 会话列表加载失败"));
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const bodyResult = await parseJsonBody<{ title?: string }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const service = createServiceClient();

  try {
    const data = await createV2Conversation(service, authResult.user.id, bodyResult.title);
    return jsonResponse({ data }, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error : new Error("创建 v2 会话失败"));
  }
}
