import { NextRequest, NextResponse } from "next/server";
import { hasPermission as hasUnifiedPermission } from "@/lib/permission-utils";
import { isCaseLibraryView } from "@/lib/case-library/shared";
import {
  GUIDANCE_METHODS,
  loadViolationsList,
  SORT_KEYS,
  type SortDirection,
  type SortKey,
  type ViolationsListView,
} from "@/lib/violations/read-model";

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
  range: (from: number, to: number) => Promise<{
    data: unknown[] | null;
    error: unknown;
    count: number | null;
  }>;
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
  const effectiveView = (requestedView ?? (canManageViolations ? "admin" : "staff")) as ViolationsListView;

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
  if (status && !["pending", "processed"].includes(status) && !isViolationStatus(status)) {
    return jsonBadRequest("status 不合法");
  }
  if (category && !isViolationCategory(category)) {
    return jsonBadRequest("category 不合法");
  }

  const normalizedSort = sort as SortKey | null;
  const { payload, errorMessage } = await loadViolationsList({
    supabase,
    view: effectiveView,
    page,
    pageSize,
    from,
    to,
    status,
    category,
    teamId,
    search,
    sort: normalizedSort,
    order: orderDir,
    guidanceMethod,
    visualTagIds: visualTagIdList,
    loadCaseIdsByVisualTagIds,
  });

  if (errorMessage || !payload) {
    return jsonServerError(errorMessage ?? "获取违规话术列表失败");
  }

  return NextResponse.json(payload);
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
