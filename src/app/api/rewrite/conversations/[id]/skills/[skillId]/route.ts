import { createServiceClient } from "@/lib/supabase/service";
import { updateConversationSkillStatus, removeSkillFromConversation } from "@/lib/rewrite/skills";
import {
  requireAuth,
  requireConversationOwner,
  jsonResponse,
  errorResponse,
  parseJsonBody,
} from "@/lib/rewrite/api-helpers";
import { NextRequest } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> },
) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { user } = authResult;
  const { id: conversationId, skillId } = await params;

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const bodyResult = await parseJsonBody<{ isActive: boolean }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const { isActive } = bodyResult;

  if (typeof isActive !== "boolean") {
    return errorResponse("isActive 必须是 boolean");
  }

  const service = createServiceClient();

  try {
    await updateConversationSkillStatus(service, {
      conversationId,
      skillId,
      isActive,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "更新 skill 状态失败", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> },
) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { user } = authResult;
  const { id: conversationId, skillId } = await params;

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const service = createServiceClient();

  try {
    await removeSkillFromConversation(service, {
      conversationId,
      skillId,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "移除 skill 失败", 500);
  }
}
