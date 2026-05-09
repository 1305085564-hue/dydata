import { NextRequest, NextResponse } from "next/server";

import {
  getAuthenticatedContext,
  jsonBadRequest,
  jsonNotFound,
  jsonUnauthorized,
  jsonValidationError,
  requireViolationAdmin,
} from "@/lib/violations/api";
import { validateReviewViolationPayload } from "@/lib/violations/validation";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const admin = await requireViolationAdmin(supabase, user);
  if (!admin.ok) {
    return admin.response;
  }

  const { id } = await context.params;
  if (!id) {
    return jsonBadRequest("缺少案例 ID");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("请求体不是合法 JSON");
  }

  const validation = validateReviewViolationPayload(body);
  if (!validation.ok) {
    return jsonValidationError(validation.message, validation.details);
  }

  const { data, error } = await supabase
    .from("violation_cases")
    .update({
      status: validation.data.status,
      risk_level: validation.data.risk_level,
      admin_conclusion: validation.data.admin_conclusion,
      suggested_action: validation.data.suggested_action,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("is_deleted", false)
    .eq("purpose", "violation")
    .select("*")
    .single();

  if (error || !data) {
    return jsonNotFound("违规话术不存在或复核失败");
  }

  return NextResponse.json({ data });
}
