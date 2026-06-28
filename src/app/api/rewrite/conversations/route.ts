import { NextRequest } from "next/server";

import { requireAuth, jsonResponse, errorResponse, parseJsonBody } from "@/lib/rewrite/api-helpers";
import { createV2Conversation } from "@/lib/rewrite/bootstrap";
import { createServiceClient } from "@/lib/supabase/service";

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
