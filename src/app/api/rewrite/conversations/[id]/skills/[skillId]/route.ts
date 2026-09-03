import { NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { removeSkillFromConversation, updateConversationSkillStatus } from "@/lib/rewrite/skills";
import {
  errorResponse,
  jsonResponse,
  parseJsonBody,
  requireAuth,
  requireConversationOwner,
} from "@/lib/rewrite/api-helpers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> },
) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { id: conversationId, skillId } = await params;
  const ownerCheck = await requireConversationOwner(conversationId, authResult.user.id);
  if (ownerCheck) return ownerCheck;

  const bodyResult = await parseJsonBody<{ isActive?: unknown }>(request);
  if (bodyResult instanceof Response) return bodyResult;
  if (typeof bodyResult.isActive !== "boolean") {
    return errorResponse("isActive 必须是 boolean", 400);
  }

  try {
    await updateConversationSkillStatus(createServiceClient(), {
      conversationId,
      skillId,
      isActive: bodyResult.isActive,
    });
    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "更新 skill 状态失败");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> },
) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { id: conversationId, skillId } = await params;
  const ownerCheck = await requireConversationOwner(conversationId, authResult.user.id);
  if (ownerCheck) return ownerCheck;

  try {
    await removeSkillFromConversation(createServiceClient(), { conversationId, skillId });
    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "移除 skill 失败");
  }
}
