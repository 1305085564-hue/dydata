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
import type { CreateUsageRecordPayload } from "@/lib/conversion-hub/validation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UsageRecordsListQuery = PromiseLike<{
  data: unknown[] | null;
  error: unknown;
  count: number | null;
}> & {
  order: (column: string, options: { ascending: boolean }) => UsageRecordsListQuery;
  eq: (column: string, value: unknown) => UsageRecordsListQuery;
  range: (from: number, to: number) => UsageRecordsListQuery;
};

type UsageRecordsRouteDeps = {
  getAuthenticatedContext: () => Promise<{
    user: { id: string } | null;
  }>;
  createAdminClient: () => unknown;
  createUsageRecordForUser: (
    supabase: unknown,
    userId: string,
    payload: CreateUsageRecordPayload,
  ) => Promise<
    | { ok: true; data: unknown }
    | { ok: false; status: number; code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "SERVER_ERROR"; message: string }
  >;
  canSeeAllUsageRecords: (supabase: unknown, userId: string) => Promise<boolean>;
};

const defaultDeps: UsageRecordsRouteDeps = {
  getAuthenticatedContext: getAuthenticatedContext as unknown as UsageRecordsRouteDeps["getAuthenticatedContext"],
  createAdminClient: createAdminClient as unknown as UsageRecordsRouteDeps["createAdminClient"],
  createUsageRecordForUser: createUsageRecordForUser as unknown as UsageRecordsRouteDeps["createUsageRecordForUser"],
  canSeeAllUsageRecords: canSeeAllUsageRecords as unknown as UsageRecordsRouteDeps["canSeeAllUsageRecords"],
};

export async function GET(request: NextRequest) {
  const { user } = await defaultDeps.getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const adminSupabase = defaultDeps.createAdminClient() as {
    from: (
      table: string,
    ) => {
      select: (query: string, options: { count: "exact" }) => UsageRecordsListQuery;
    };
  };
  const { searchParams } = new URL(request.url);
  const caseId = searchParams.get("case_id")?.trim() ?? null;

  if (caseId && !UUID_PATTERN.test(caseId)) {
    return jsonBadRequest("case_id 不合法");
  }

  const { page, pageSize, from, to } = parsePageParams(searchParams);
  const canSeeAll = await defaultDeps.canSeeAllUsageRecords(adminSupabase, user.id);

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

export async function buildCreateUsageRecordResponse(
  request: NextRequest,
  deps: UsageRecordsRouteDeps = defaultDeps,
) {
  const { user } = await deps.getAuthenticatedContext();

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

  const adminSupabase = deps.createAdminClient();
  const result = await deps.createUsageRecordForUser(adminSupabase, user.id, validation.data);

  if (!result.ok) {
    return jsonError(result.code, result.message, result.status);
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}

export async function POST(request: NextRequest) {
  return buildCreateUsageRecordResponse(request);
}
