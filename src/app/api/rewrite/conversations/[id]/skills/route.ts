import { createServiceClient } from "@/lib/supabase/service";
import { listConversationSkills, injectSkillToConversation } from "@/lib/rewrite/skills";
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
    const skills = await listConversationSkills(service, conversationId);
    return jsonResponse({ skills });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "获取对话 skills 失败", 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { user } = authResult;
  const { id: conversationId } = await params;

  const ownerCheck = await requireConversationOwner(conversationId, user.id);
  if (ownerCheck) return ownerCheck;

  const bodyResult = await parseJsonBody<{ skillId: string; skillVersionId?: string }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const { skillId, skillVersionId } = bodyResult;

  if (!skillId) {
    return errorResponse("缺少 skillId 参数");
  }

  const service = createServiceClient();

  try {
    const conversationSkill = await injectSkillToConversation(service, {
      conversationId,
      skillId,
      skillVersionId: skillVersionId ?? null,
    });

    return jsonResponse({ conversationSkill }, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "注入 skill 失败", 500);
  }
}
