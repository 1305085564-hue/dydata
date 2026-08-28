import { NextRequest, NextResponse } from "next/server";
import { replaceSubTopicClaim } from "@/lib/topics/service";
import { jsonResult, requireActiveTeamContext } from "../../_shared";

export async function POST(request: NextRequest) {
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null) as { returned_sub_topic_id?: unknown; target_sub_topic_id?: unknown } | null;
  const returnedSubTopicId = typeof body?.returned_sub_topic_id === "string" ? body.returned_sub_topic_id.trim() : "";
  const targetSubTopicId = typeof body?.target_sub_topic_id === "string" ? body.target_sub_topic_id.trim() : "";
  if (!returnedSubTopicId || !targetSubTopicId) return NextResponse.json({ error: "缺少替换选题 ID" }, { status: 400 });
  return jsonResult(await replaceSubTopicClaim(auth.context.supabase, auth.context.userId, returnedSubTopicId, targetSubTopicId));
}
