import { NextRequest, NextResponse } from "next/server";
import { hasPermission as hasUnifiedPermission } from "@/lib/permission-utils";
import { isCaseLibraryView } from "@/lib/case-library/shared";

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

type MinimalViolationsQuery = {
  eq: (column: string, value: unknown) => MinimalViolationsQuery;
  in: (column: string, values: string[]) => MinimalViolationsQuery;
  ilike: (column: string, value: string) => MinimalViolationsQuery;
  order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => MinimalViolationsQuery;
  range: (from: number, to: number) => Promise<{ data: unknown[] | null; error: unknown; count: number | null }>;
};

type MinimalViolationsSupabase = {
  from: (table: string) => {
    select: (query: string, options: { count: "exact" }) => MinimalViolationsQuery;
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
};

const defaultDeps: ViolationsRouteDeps = {
  getAuthenticatedContext: getAuthenticatedContext as unknown as ViolationsRouteDeps["getAuthenticatedContext"],
  getUserProfile: getUserProfile as unknown as ViolationsRouteDeps["getUserProfile"],
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

  if (requestedView && !isCaseLibraryView(requestedView)) {
    return jsonBadRequest("view 不合法");
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

  let query = supabase
    .from("violation_cases")
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
    if (!isViolationStatus(status)) {
      return jsonBadRequest("status 不合法");
    }
    query = query.eq("status", status);
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

  if (effectiveView === "staff") {
    query = query
      .eq("status", "verified")
      .in("usage_state", ["available", "testing"]);
  }

  const { data, error, count } = await query
    .order("status", { ascending: true })
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return jsonServerError("获取违规话术列表失败");
  }

  return NextResponse.json({
    data: data ?? [],
    view: effectiveView,
    pagination: {
      page,
      pageSize,
      totalItems: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
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
