import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureCanReview,
  getAuthenticatedContext,
  jsonServerError,
  jsonUnauthorized,
} from "@/lib/publish-drafts/api";
import { loadReviewQueue } from "@/lib/publish-drafts/read-model";

export async function GET() {
  const { user } = await getAuthenticatedContext();
  if (!user) {
    return jsonUnauthorized();
  }

  const reviewAccess = await ensureCanReview(createAdminClient(), user.id);
  if (!reviewAccess.ok) {
    return reviewAccess.response;
  }

  const { data, errorMessage } = await loadReviewQueue(user.id);
  if (errorMessage || !data) {
    return jsonServerError(errorMessage ?? "获取审核队列失败");
  }

  return NextResponse.json(data);
}
