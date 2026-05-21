import { NextRequest, NextResponse } from "next/server";

import {
  createUsageRecordForUser,
} from "@/lib/conversion-hub/service";
import {
  getAuthenticatedContext,
  jsonBadRequest,
  jsonError,
  jsonNotFound,
  jsonUnauthorized,
  jsonValidationError,
} from "@/lib/violations/api";
import { validateCreateTestRecordPayload } from "@/lib/violations/validation";

type MinimalViolationTestQuery = {
  eq: (column: string, value: unknown) => MinimalViolationTestQuery;
  single: () => Promise<{ data: { id: string; status: string; is_deleted: boolean } | null; error: unknown }>;
};

type MinimalViolationTestSupabase = {
  from: (table: string) => {
    select: (query: string) => MinimalViolationTestQuery;
  };
};

type CreateViolationTestRouteDeps = {
  getAuthenticatedContext: () => Promise<{
    supabase: MinimalViolationTestSupabase;
    user: { id: string } | null;
  }>;
  createUsageRecordForUser: (
    supabase: MinimalViolationTestSupabase,
    userId: string,
    payload: {
      case_id: string;
      script_text: null;
      script_format: "oral";
      account_id: string | null;
      used_at: string;
      views: number;
      follows: number;
      source: "manual";
      daily_report_id: null;
      note: string | null;
      result_flag: "pass" | "fail";
    },
  ) => Promise<
    | { ok: true; data: unknown }
    | { ok: false; status: number; code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "SERVER_ERROR"; message: string }
  >;
};

const defaultDeps: CreateViolationTestRouteDeps = {
  getAuthenticatedContext: getAuthenticatedContext as unknown as CreateViolationTestRouteDeps["getAuthenticatedContext"],
  createUsageRecordForUser: createUsageRecordForUser as unknown as CreateViolationTestRouteDeps["createUsageRecordForUser"],
};

/**
 * @deprecated 90 天过渡期保留。前端已迁移到 POST /api/conversion-hub/usage-records。
 */
export async function buildCreateViolationTestRecordResponse(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  deps: CreateViolationTestRouteDeps = defaultDeps,
) {
  const { supabase, user } = await deps.getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
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

  const validation = validateCreateTestRecordPayload(body);
  if (!validation.ok) {
    return jsonValidationError(validation.message, validation.details);
  }

  const { data: currentCase, error: caseError } = await supabase
    .from("violation_cases")
    .select("id, status, is_deleted")
    .eq("id", id)
    .eq("is_deleted", false)
    .eq("purpose", "violation")
    .single();

  if (caseError || !currentCase) {
    return jsonNotFound("违规话术不存在");
  }

  if (currentCase.status === "archived") {
    return jsonError("CONFLICT", "已归档案例不能追加测试记录", 409);
  }

  const result = await deps.createUsageRecordForUser(supabase, user.id, {
    case_id: id,
    script_text: null,
    script_format: "oral",
    account_id: validation.data.account_id,
    used_at: new Date().toISOString().slice(0, 10),
    views: 0,
    follows: 0,
    source: "manual",
    daily_report_id: null,
    note: validation.data.note,
    result_flag: validation.data.passed ? "pass" : "fail",
  });

  if (!result.ok) {
    return jsonError(result.code, result.message, result.status);
  }

  return NextResponse.json(
    {
      case_id: id,
      data: result.data,
      migrated: true,
    },
    {
      status: 201,
      headers: {
        "X-Deprecation": "use POST /api/conversion-hub/usage-records with result_flag",
      },
    },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return buildCreateViolationTestRecordResponse(request, context);
}
