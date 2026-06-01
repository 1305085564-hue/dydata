import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureCanReview,
  getAuthenticatedContext,
  jsonBadRequest,
  jsonNotFound,
  jsonServerError,
  jsonUnauthorized,
} from "@/lib/publish-drafts/api";
import { loadReviewQueue } from "@/lib/publish-drafts/read-model";

export async function POST(
  _request: NextRequest,
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
      action: "approve" as const,
      reviewer_id: user.id,
      reviewer_name: typeof reviewerProfile.name === "string" && reviewerProfile.name.trim()
        ? reviewerProfile.name.trim()
        : undefined,
      feedback_text: null,
      at: reviewedAt,
    },
  ];

  const { data, error } = await adminSupabase
    .from("publish_drafts")
    .update({
      status: "approved",
      approved_at: reviewedAt,
      reviewed_at: reviewedAt,
      reviewed_by: user.id,
      feedback_history: feedbackHistory,
    })
    .eq("id", id)
    .eq("is_deleted", false)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error || !data) {
    return jsonBadRequest("审核通过失败，稿件可能已被处理");
  }

  return NextResponse.json({ data });
}
