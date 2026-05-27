import { NextRequest, NextResponse } from "next/server";
import { hasPermission as hasUnifiedPermission } from "@/lib/permission-utils";
import { isCaseLibraryView } from "@/lib/case-library/shared";
import { calculatePassRate } from "@/lib/violations/dashboard-summary";

import {
  getAuthenticatedContext,
  getOwnedAccount,
  getUserProfile,
  isViolationCategory,
  isViolationStatus,
  jsonBadRequest,
  jsonForbidden,
  jsonServerError,
  jsonUnauthorized,
  jsonValidationError,
  parsePageParams,
} from "@/lib/violations/api";
import { validateCreateViolationPayload } from "@/lib/violations/validation";
import type { Permissions } from "@/types";

type MinimalViolationsQueryResult = {
  data: unknown[] | null;
  error: unknown;
  count: number | null;
};

type MinimalVisualTagQueryResult = {
  data: Array<{ case_id: string }> | null;
  error: unknown;
};

type MinimalViolationsQuery = {
  eq: (column: string, value: unknown) => MinimalViolationsQuery;
  in: (column: string, values: string[]) => MinimalViolationsQuery;
  ilike: (column: string, value: string) => MinimalViolationsQuery;
  select: (columns: string, options?: { count?: "exact" }) => MinimalViolationsQuery;
  order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => MinimalViolationsQuery;
  range: (from: number, to: number) => Promise<MinimalViolationsQueryResult>;
};

type MinimalViolationsSupabase = {
  from: (table: string) => unknown;
};

type MinimalVisualTagQuery = {
  select: (columns: string) => {
    in: (column: string, values: string[]) => PromiseLike<MinimalVisualTagQueryResult>;
  };
};

type MinimalViolationProfile = {
  businessRole: "owner" | "team_admin" | "group_leader" | "member";
  permissions: Permissions;
};

type ViolationsRouteDeps = {
  getAuthenticatedContext: () => Promise<{
    supabase: MinimalViolationsSupabase;
    user: { id: string } | null;
  }>;
  getUserProfile: (
    supabase: MinimalViolationsSupabase,
    userId: string,
  ) => Promise<MinimalViolationProfile | null>;
  loadCaseIdsByVisualTagIds?: (
    supabase: MinimalViolationsSupabase,
    tagIds: string[],
  ) => Promise<{ caseIds: string[]; error: unknown }>;
};

type SortKey = "conversion_rate" | "pass_rate" | "usage_count" | "created_at";
type SortDirection = "asc" | "desc";
type StatusFilter = "pending" | "processed";
type CaseListRow = {
  id?: string | null;
  pass_count?: number | null;
  fail_count?: number | null;
  created_at?: string | null;
};

const GUIDANCE_METHODS = ["oral", "visual", "profile", "comment", "other"] as const;
const SORT_KEYS = new Set<SortKey>(["conversion_rate", "pass_rate", "usage_count", "created_at"]);
const STATUS_FILTERS = new Set<StatusFilter>(["pending", "processed"]);
const PROCESSED_STATUSES = ["verified", "rejected", "archived"];

const defaultDeps: ViolationsRouteDeps = {
  getAuthenticatedContext: getAuthenticatedContext as unknown as ViolationsRouteDeps["getAuthenticatedContext"],
  getUserProfile: getUserProfile as unknown as ViolationsRouteDeps["getUserProfile"],
  loadCaseIdsByVisualTagIds: async (supabase, tagIds) => {
    const query = (supabase as MinimalViolationsSupabase).from(
      "violation_case_visual_tags",
    ) as MinimalVisualTagQuery;
    const { data, error } = await query
      .select("case_id")
      .in("tag_id", tagIds);

    return {
      caseIds: Array.from(new Set((data ?? []).map((row: { case_id: string }) => row.case_id))),
      error,
    };
  },
};

function buildViolationsListPayload(
  data: unknown[],
  view: string,
  page: number,
  pageSize: number,
  totalItems: number,
  sort: SortKey | null,
  order: SortDirection,
) {
  return {
    data,
    view,
    sort,
    order,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0,
    },
  };
}

function comparePassRate(left: CaseListRow, right: CaseListRow, direction: SortDirection) {
  const leftRate = calculatePassRate(left.pass_count ?? null, left.fail_count ?? null) ?? -1;
  const rightRate = calculatePassRate(right.pass_count ?? null, right.fail_count ?? null) ?? -1;
  if (leftRate !== rightRate) {
    return direction === "asc" ? leftRate - rightRate : rightRate - leftRate;
  }

  const leftSamples = (left.pass_count ?? 0) + (left.fail_count ?? 0);
  const rightSamples = (right.pass_count ?? 0) + (right.fail_count ?? 0);
  if (leftSamples !== rightSamples) return rightSamples - leftSamples;

  const leftCreatedAt = left.created_at ?? "";
  const rightCreatedAt = right.created_at ?? "";
  if (leftCreatedAt !== rightCreatedAt) {
    return direction === "asc"
      ? leftCreatedAt.localeCompare(rightCreatedAt)
      : rightCreatedAt.localeCompare(leftCreatedAt);
  }

  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

function applyStatusFilter(query: MinimalViolationsQuery, status: string) {
  if (STATUS_FILTERS.has(status as StatusFilter)) {
    return status === "pending"
      ? query.eq("status", "submitted")
      : query.in("status", PROCESSED_STATUSES);
  }

  if (!isViolationStatus(status)) {
    return null;
  }

  return query.eq("status", status);
}

export async function buildViolationsListResponse(
  request: NextRequest,
  deps: ViolationsRouteDeps = defaultDeps,
) {
  const { supabase, user } = await deps.getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const { searchParams } = new URL(request.url);
  const { page, pageSize, from, to } = parsePageParams(searchParams);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const teamId = searchParams.get("team_id");
  const search = searchParams.get("q")?.trim();
  const requestedView = searchParams.get("view")?.trim() ?? null;
  const sortValue = searchParams.get("sort")?.trim() ?? null;
  const orderValue = searchParams.get("order")?.trim().toLowerCase() ?? "desc";
  const guidanceMethod = searchParams.get("guidance_method")?.trim() ?? null;
  const visualTagIds = searchParams.get("visual_tag_ids")?.trim() ?? null;

  if (requestedView && !isCaseLibraryView(requestedView)) {
    return jsonBadRequest("view 不合法");
  }

  const sort = sortValue == null || sortValue === "" ? null : sortValue;
  if (sort && !SORT_KEYS.has(sort as SortKey)) {
    return jsonBadRequest("sort 不合法");
  }

  if (orderValue !== "asc" && orderValue !== "desc") {
    return jsonBadRequest("order 不合法");
  }
  const orderDir = orderValue as SortDirection;

  if (guidanceMethod && !(GUIDANCE_METHODS as readonly string[]).includes(guidanceMethod)) {
    return jsonBadRequest("guidance_method 不合法");
  }

  const profile = await deps.getUserProfile(supabase, user.id);
  if (!profile) {
    return jsonServerError("用户资料不存在");
  }

  const canManageViolations = hasUnifiedPermission(
    profile.businessRole,
    profile.permissions as Permissions,
    "manage_violations",
  );
  const effectiveView = requestedView ?? (canManageViolations ? "admin" : "staff");

  if (effectiveView === "admin" && !canManageViolations) {
    return jsonForbidden("仅具备违规话术复核权限的用户可查看 admin 视角");
  }

  const loadCaseIdsByVisualTagIds = deps.loadCaseIdsByVisualTagIds
    ?? defaultDeps.loadCaseIdsByVisualTagIds;
  if (!loadCaseIdsByVisualTagIds) {
    return jsonServerError("画面标签筛选器未初始化");
  }

  const visualTagIdList = visualTagIds
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
  let visualTagCaseIds: string[] | null = null;

  if (visualTagIdList.length > 0) {
    const { caseIds, error } = await loadCaseIdsByVisualTagIds(supabase, Array.from(new Set(visualTagIdList)));
    if (error) {
      return jsonServerError("获取画面标签筛选失败");
    }
    visualTagCaseIds = caseIds;
    if (caseIds.length === 0) {
      return NextResponse.json(
        buildViolationsListPayload([], effectiveView, page, pageSize, 0, sort as SortKey | null, orderDir),
      );
    }
  }

  let query = (supabase.from("violation_cases") as MinimalViolationsQuery)
    .select(
      `
        *,
        submitter:profiles!violation_cases_submitted_by_fkey(id, name),
        team:teams(id, name),
        reviewer:profiles!violation_cases_reviewed_by_fkey(id, name)
      `,
      { count: "exact" },
    )
    .eq("is_deleted", false)
    .eq("purpose", "violation");

  if (status) {
    const filteredQuery = applyStatusFilter(query, status);
    if (!filteredQuery) {
      return jsonBadRequest("status 不合法");
    }
    query = filteredQuery;
  }

  if (category) {
    if (!isViolationCategory(category)) {
      return jsonBadRequest("category 不合法");
    }
    query = query.eq("category", category);
  }

  if (teamId) {
    query = query.eq("team_id", teamId);
  }

  if (search) {
    query = query.ilike("script_text", `%${search}%`);
  }

  if (guidanceMethod) {
    query = query.eq("guidance_method", guidanceMethod);
  }

  if (visualTagCaseIds && visualTagCaseIds.length > 0) {
    query = query.in("id", visualTagCaseIds);
  }

  if (effectiveView === "staff") {
    query = query
      .eq("status", "verified")
      .in("usage_state", ["available", "testing"]);
  }

  const normalizedSort = sort as SortKey | null;
  let orderedQuery = query;

  switch (normalizedSort) {
    case "conversion_rate":
      orderedQuery = orderedQuery
        .order("weighted_conversion_rate", { ascending: orderDir === "asc", nullsFirst: false })
        .order("usage_count", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      break;
    case "usage_count":
      orderedQuery = orderedQuery
        .order("usage_count", { ascending: orderDir === "asc", nullsFirst: false })
        .order("weighted_conversion_rate", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      break;
    case "created_at":
      orderedQuery = orderedQuery.order("created_at", { ascending: orderDir === "asc" });
      break;
    case "pass_rate":
      orderedQuery = orderedQuery
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
      break;
    default:
      orderedQuery = orderedQuery
        .order("status", { ascending: true })
        .order("reviewed_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      break;
  }

  const usesInMemoryPassRateSort = normalizedSort === "pass_rate";
  const { data, error, count } = await orderedQuery.range(usesInMemoryPassRateSort ? 0 : from, usesInMemoryPassRateSort ? 9999 : to);

  if (error) {
    return jsonServerError("获取违规话术列表失败");
  }

  let responseData = data ?? [];

  if (usesInMemoryPassRateSort) {
    responseData = [...responseData].sort((left, right) =>
      comparePassRate(left as CaseListRow, right as CaseListRow, orderDir));
    responseData = responseData.slice(from, to + 1);
  }

  return NextResponse.json(
    buildViolationsListPayload(responseData, effectiveView, page, pageSize, count ?? 0, normalizedSort, orderDir),
  );
}

export async function GET(request: NextRequest) {
  return buildViolationsListResponse(request);
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("请求体不是合法 JSON");
  }

  const validation = validateCreateViolationPayload(body);
  if (!validation.ok) {
    return jsonValidationError(validation.message, validation.details);
  }

  const profile = await getUserProfile(supabase, user.id);
  if (!profile) {
    return jsonServerError("用户资料不存在");
  }

  const invalidScreenshotPath = validation.data.screenshot_paths.find(
    (path) => !path.startsWith(`${user.id}/`) || path.includes(".."),
  );
  if (invalidScreenshotPath) {
    return jsonValidationError("screenshot_paths 包含无效路径");
  }

  const accountResult = await getOwnedAccount(supabase, user.id, validation.data.account_id);
  if (!accountResult.ok) {
    return accountResult.response;
  }

  const { data, error } = await supabase
    .from("violation_cases")
    .insert({
      submitted_by: user.id,
      script_text: validation.data.script_text,
      is_violation: validation.data.is_violation,
      category: validation.data.category,
      account_id: accountResult.account?.id ?? null,
      account_name_snapshot: accountResult.account?.name ?? null,
      team_id: profile.team_id,
      scene_description: validation.data.scene_description,
      screenshot_paths: validation.data.screenshot_paths,
      result: validation.data.result,
      tags: validation.data.tags,
      status: "submitted",
      purpose: validation.data.is_violation ? "violation" : "conversion",
      platforms: validation.data.platforms,
    })
    .select("*")
    .single();

  if (error) {
    return jsonServerError("提交违规话术失败");
  }

  return NextResponse.json({ data }, { status: 201 });
}
