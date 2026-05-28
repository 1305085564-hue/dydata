import { NextRequest, NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";
import {
  isContentExperienceType,
  isContentExperienceVisibilityScope,
  listContentExperienceMarks,
  normalizeOptionalUuid,
  upsertContentExperienceMark,
} from "@/lib/content-experience-marks";

type PostBody = {
  videoId?: unknown;
  video_id?: unknown;
  feedbackCardId?: unknown;
  feedback_card_id?: unknown;
  aiInsightResultId?: unknown;
  ai_insight_result_id?: unknown;
  experienceType?: unknown;
  experience_type?: unknown;
  visibilityScope?: unknown;
  visibility_scope?: unknown;
  note?: unknown;
};

function getTrimmedString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function GET(request: NextRequest) {
  const videoId = getTrimmedString(request.nextUrl.searchParams.get("videoId"));
  if (!videoId) return errorResponse("缺少 videoId", 400);

  const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return errorResponse(access.error, access.status);
  }

  try {
    const items = await listContentExperienceMarks(access.supabase, videoId);
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "加载经验标记失败", 500);
  }
}

export async function POST(request: NextRequest) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return errorResponse("请求体格式不正确", 400);
  }

  const videoId = getTrimmedString(body.videoId ?? body.video_id);
  if (!videoId) return errorResponse("缺少 videoId", 400);

  const experienceType = body.experienceType ?? body.experience_type;
  if (!isContentExperienceType(experienceType)) {
    return errorResponse("experience_type 不合法", 400);
  }

  const visibilityScope = body.visibilityScope ?? body.visibility_scope ?? "team";
  if (!isContentExperienceVisibilityScope(visibilityScope)) {
    return errorResponse("visibility_scope 不合法", 400);
  }

  const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return errorResponse(access.error, access.status);
  }

  try {
    const mark = await upsertContentExperienceMark(access.supabase, {
      videoId,
      markedBy: access.actor.userId,
      feedbackCardId: normalizeOptionalUuid(body.feedbackCardId ?? body.feedback_card_id),
      aiInsightResultId: normalizeOptionalUuid(body.aiInsightResultId ?? body.ai_insight_result_id),
      experienceType,
      visibilityScope,
      note: typeof body.note === "string" ? body.note : null,
    });

    return NextResponse.json({ ok: true, item: mark });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "保存经验标记失败", 500);
  }
}
