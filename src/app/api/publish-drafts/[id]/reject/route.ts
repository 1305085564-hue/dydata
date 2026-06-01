import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureCanReview,
  getAuthenticatedContext,
  jsonBadRequest,
  jsonNotFound,
  jsonServerError,
  jsonUnauthorized,
  jsonValidationError,
} from "@/lib/publish-drafts/api";
import { loadReviewQueue } from "@/lib/publish-drafts/read-model";
import { validateRejectPayload } from "@/lib/publish-drafts/validation";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { user } = await getAuthenticatedContext();
  if (!user) {
    return jsonUnauthorized();
  }

  const adminSupabase = createAdminClient();
  const reviewAccess = await ensureCanReview(adminSupabase, user.id);
  if (!reviewAccess.ok) {
    return reviewAccess.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("请求体不是合法 JSON");
  }

  const validation = validateRejectPayload(body);
  if (!validation.ok) {
    return jsonValidationError(validation.message, validation.details);
  }

  const { id } = await context.params;

  const { data: reviewerProfile, error: reviewerError } = await adminSupabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  if (reviewerError) {
    return jsonServerError("获取审核人信息失败");
  }

  const queueResult = await loadReviewQueue(user.id);
  if (queueResult.errorMessage || !queueResult.data) {
    return jsonServerError(queueResult.errorMessage ?? "获取审核队列失败");
  }

  const snapshot = queueResult.data.queue.find((item) => item.id === id);
  if (!snapshot) {
    return jsonNotFound("稿件不存在");
  }

  const reviewedAt = new Date().toISOString();
  const feedbackHistory = [
    ...snapshot.feedback_history,
    {
      round: snapshot.current_round,
      action: "reject" as const,
      reviewer_id: user.id,
      reviewer_name: typeof reviewerProfile.name === "string" && reviewerProfile.name.trim()
        ? reviewerProfile.name.trim()
        : undefined,
      feedback_text: validation.data.feedback_text,
      at: reviewedAt,
    },
  ];

  const { data, error } = await adminSupabase
    .from("publish_drafts")
    .update({
      status: "rejected",
      reviewed_at: reviewedAt,
      reviewed_by: user.id,
      approved_at: null,
      feedback_history: feedbackHistory,
    })
    .eq("id", id)
    .eq("is_deleted", false)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error || !data) {
    return jsonBadRequest("审核打回失败，稿件可能已被处理");
  }

  return NextResponse.json({ data });
}
