import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedContext,
  jsonBadRequest,
  jsonNotFound,
  jsonUnauthorized,
  jsonValidationError,
  requireViolationAdmin,
} from "@/lib/violations/api";
import { validateReviewViolationPayload } from "@/lib/violations/validation";

type ReviewSnapshot = {
  id: string;
  status: string;
  usage_state: string | null;
  risk_level: string | null;
  admin_conclusion: string | null;
  suggested_action: string | null;
};

const REVIEW_SNAPSHOT_SELECT = "id,status,usage_state,risk_level,admin_conclusion,suggested_action";

type MinimalReviewSelectQuery = {
  eq: (column: string, value: unknown) => MinimalReviewSelectQuery;
  single: () => Promise<{ data: unknown; error: unknown }>;
};

type MinimalReviewMutation = {
  eq: (column: string, value: unknown) => MinimalReviewMutation;
  select: (query: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
};

type MinimalReviewCaseTable = {
  select: (query: string) => MinimalReviewSelectQuery;
  update: (payload: Record<string, unknown>) => MinimalReviewMutation;
};

type MinimalReasonTagTable = {
  delete: () => { eq: (column: string, value: unknown) => Promise<unknown> | unknown };
  insert: (rows: Array<{ case_id: string; tag_id: string }>) => Promise<{ error: unknown }>;
};

type MinimalReviewSupabase = {
  from: (table: string) => Record<string, unknown>;
};

type ReviewViolationRouteDeps = {
  getAuthenticatedContext: () => Promise<{
    supabase: MinimalReviewSupabase;
    user: { id: string } | null;
  }>;
  requireViolationAdmin: (
    supabase: MinimalReviewSupabase,
    user: { id: string },
  ) => Promise<
    | { ok: false; response: Response }
    | { ok: true; profile: unknown }
  >;
  createAdminClient?: () => MinimalReviewSupabase;
};

const defaultDeps: ReviewViolationRouteDeps = {
  getAuthenticatedContext: getAuthenticatedContext as unknown as ReviewViolationRouteDeps["getAuthenticatedContext"],
  requireViolationAdmin: requireViolationAdmin as unknown as ReviewViolationRouteDeps["requireViolationAdmin"],
  createAdminClient: createAdminClient as unknown as ReviewViolationRouteDeps["createAdminClient"],
};

export async function buildReviewViolationResponse(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  deps: ReviewViolationRouteDeps = defaultDeps,
) {
  const { supabase, user } = await deps.getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const admin = await deps.requireViolationAdmin(supabase, user);
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
    return jsonBadRequest(validation.message, validation.details);
  }

  const adminSupabase = deps.createAdminClient ? deps.createAdminClient() : supabase;

  const reviewCasesTable = adminSupabase.from("violation_cases") as MinimalReviewCaseTable;

  const { data: snapshot, error: snapshotError } = await reviewCasesTable
    .select(REVIEW_SNAPSHOT_SELECT)
    .eq("id", id)
    .eq("is_deleted", false)
    .single();

  if (snapshotError || !snapshot) {
    return jsonNotFound("案例不存在或复核失败");
  }

  const { data, error } = await reviewCasesTable
    .update({
      status: validation.data.status,
      risk_level: validation.data.risk_level,
      ...(validation.data.usage_state ? { usage_state: validation.data.usage_state } : {}),
      ...(validation.data.promotion_level ? { promotion_level: validation.data.promotion_level } : {}),
      admin_conclusion: validation.data.admin_conclusion,
      suggested_action: validation.data.suggested_action,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("is_deleted", false)
    .select("*")
    .single();

  if (error || !data) {
    return jsonNotFound("案例不存在或复核失败");
  }

  if (validation.data.reason_tag_ids) {
    const reasonTagTable = adminSupabase.from("violation_case_reason_tags") as MinimalReasonTagTable;
    await reasonTagTable.delete().eq("case_id", id);
    if (validation.data.reason_tag_ids.length > 0) {
      const rows = validation.data.reason_tag_ids.map((tagId) => ({ case_id: id, tag_id: tagId }));
      const { error: insertError } = await reasonTagTable.insert(rows);
      if (insertError) {
        return jsonValidationError("保存踩雷点标签失败", insertError);
      }
    }
  }

  return NextResponse.json({
    data,
    snapshot: snapshot as ReviewSnapshot,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return buildReviewViolationResponse(request, context);
}
