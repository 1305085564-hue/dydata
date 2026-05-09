import { NextRequest, NextResponse } from "next/server";

import {
  getAuthenticatedContext,
  getOwnedAccount,
  getUserProfile,
  isViolationCategory,
  isViolationStatus,
  jsonBadRequest,
  jsonServerError,
  jsonUnauthorized,
  jsonValidationError,
  parsePageParams,
} from "@/lib/violations/api";
import { validateCreateViolationPayload } from "@/lib/violations/validation";

export async function GET(request: NextRequest) {
  const { supabase, user } = await getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const { searchParams } = new URL(request.url);
  const { page, pageSize, from, to } = parsePageParams(searchParams);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const teamId = searchParams.get("team_id");
  const search = searchParams.get("q")?.trim();

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
    pagination: {
      page,
      pageSize,
      totalItems: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
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
    })
    .select("*")
    .single();

  if (error) {
    return jsonServerError("提交违规话术失败");
  }

  return NextResponse.json({ data }, { status: 201 });
}
