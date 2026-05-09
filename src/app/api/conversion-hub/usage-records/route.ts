import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  canSeeAllUsageRecords,
  createUsageRecordForUser,
} from "@/lib/conversion-hub/service";
import { validateCreateUsageRecordPayload } from "@/lib/conversion-hub/validation";
import {
  getAuthenticatedContext,
  jsonBadRequest,
  jsonError,
  jsonServerError,
  jsonUnauthorized,
  jsonValidationError,
  parsePageParams,
} from "@/lib/violations/api";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const { user } = await getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const adminSupabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const caseId = searchParams.get("case_id")?.trim() ?? null;

  if (caseId && !UUID_PATTERN.test(caseId)) {
    return jsonBadRequest("case_id 不合法");
  }

  const { page, pageSize, from, to } = parsePageParams(searchParams);
  const canSeeAll = await canSeeAllUsageRecords(adminSupabase, user.id);

  let query = adminSupabase
    .from("script_usage_records")
    .select(
      `
        *,
        case:violation_cases(id, script_text, purpose, script_format, total_views, total_follows, usage_count, weighted_conversion_rate),
        recorder:profiles!script_usage_records_recorded_by_fkey(id, name),
        account:accounts(id, name)
      `,
      { count: "exact" },
    )
    .order("used_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (!canSeeAll) {
    query = query.eq("recorded_by", user.id);
  }

  if (caseId) {
    query = query.eq("case_id", caseId);
  }

  const { data, error, count } = await query;

  if (error) {
    return jsonServerError("获取话术使用记录失败");
  }

  return NextResponse.json({
    data: data ?? [],
    pagination: {
      page,
      pageSize,
      totalItems: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("请求体不是合法 JSON");
  }

  const validation = validateCreateUsageRecordPayload(body);
  if (!validation.ok) {
    return jsonValidationError(validation.message, validation.details);
  }

  const adminSupabase = createAdminClient();
  const result = await createUsageRecordForUser(adminSupabase, user.id, validation.data);

  if (!result.ok) {
    return jsonError(result.code, result.message, result.status);
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
