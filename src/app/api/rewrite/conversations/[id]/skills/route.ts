import { NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { injectSkillToConversation, listConversationSkills } from "@/lib/rewrite/skills";
import {
  errorResponse,
  jsonResponse,
  parseJsonBody,
  requireAuth,
  requireConversationOwner,
} from "@/lib/rewrite/api-helpers";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { id: conversationId } = await params;
  const ownerCheck = await requireConversationOwner(conversationId, authResult.user.id);
  if (ownerCheck) return ownerCheck;

  try {
    const skills = await listConversationSkills(createServiceClient(), conversationId);
    return jsonResponse({ skills });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "获取对话 skills 失败");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { id: conversationId } = await params;
  const ownerCheck = await requireConversationOwner(conversationId, authResult.user.id);
  if (ownerCheck) return ownerCheck;

  const bodyResult = await parseJsonBody<{ skillId?: unknown; skillVersionId?: unknown }>(request);
  if (bodyResult instanceof Response) return bodyResult;
  if (typeof bodyResult.skillId !== "string" || !bodyResult.skillId.trim()) {
    return errorResponse("缺少 skillId 参数", 400);
  }

  try {
    const conversationSkill = await injectSkillToConversation(createServiceClient(), {
      conversationId,
      skillId: bodyResult.skillId.trim(),
      userId: authResult.user.id,
      skillVersionId: typeof bodyResult.skillVersionId === "string" ? bodyResult.skillVersionId.trim() : null,
    });
    return jsonResponse({ conversationSkill }, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "注入 skill 失败");
  }
}
