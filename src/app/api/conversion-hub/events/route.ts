import { NextRequest, NextResponse } from "next/server";

import { createViolationEventForUser } from "@/lib/conversion-hub/service";
import { validateCreateViolationEventPayload } from "@/lib/conversion-hub/validation";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const accountId = searchParams.get("account_id")?.trim() ?? null;

  if (caseId && !UUID_PATTERN.test(caseId)) {
    return jsonBadRequest("case_id 不合法");
  }

  if (accountId && !UUID_PATTERN.test(accountId)) {
    return jsonBadRequest("account_id 不合法");
  }

  const { page, pageSize, from, to } = parsePageParams(searchParams);
  let query = adminSupabase
    .from("violation_events")
    .select(
      `
        *,
        case:violation_cases(id, script_text, purpose, status),
        reporter:profiles!violation_events_reported_by_fkey(id, name),
        account:accounts(id, name)
      `,
      { count: "exact" },
    )
    .order("occurred_at", { ascending: false })
    .range(from, to);

  if (caseId) query = query.eq("case_id", caseId);
  if (accountId) query = query.eq("account_id", accountId);

  const { data, error, count } = await query;

  if (error) {
    return jsonServerError("获取违规事件失败");
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

  const validation = validateCreateViolationEventPayload(body);
  if (!validation.ok) {
    return jsonValidationError(validation.message, validation.details);
  }

  const adminSupabase = createAdminClient();
  const result = await createViolationEventForUser(adminSupabase, user.id, validation.data);

  if (!result.ok) {
    return jsonError(result.code, result.message, result.status);
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
