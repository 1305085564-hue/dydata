import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { validateCaseVisualTagIds } from "@/lib/violations/visual-tags";
import {
  getAuthenticatedContext,
  jsonBadRequest,
  jsonNotFound,
  jsonServerError,
  jsonUnauthorized,
  requireViolationAdmin,
} from "@/lib/violations/api";

type CaseVisualTagJoinRow = {
  tag:
    | {
      id: string;
      name: string;
      description: string | null;
    }
    | Array<{
      id: string;
      name: string;
      description: string | null;
    }>
    | null;
};

async function ensureCaseExists(caseId: string) {
  const { data, error } = await createAdminClient()
    .from("violation_cases")
    .select("id")
    .eq("id", caseId)
    .eq("is_deleted", false)
    .single();

  if (error || !data) return false;
  return true;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { user } = await getAuthenticatedContext();
  if (!user) return jsonUnauthorized();

  const { id } = await context.params;
  if (!id) return jsonBadRequest("缺少案例 ID");

  if (!(await ensureCaseExists(id))) {
    return jsonNotFound("案例不存在");
  }

  const { data, error } = await createAdminClient()
    .from("violation_case_visual_tags")
    .select("tag:visual_tags(id, name, description)")
    .eq("case_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return jsonServerError("获取案例画面标签失败");
  }

  return NextResponse.json({
    data: ((data ?? []) as CaseVisualTagJoinRow[])
      .map((row) => (Array.isArray(row.tag) ? row.tag[0] : row.tag))
      .filter(Boolean),
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedContext();
  if (!user) return jsonUnauthorized();

  const admin = await requireViolationAdmin(supabase, user);
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  if (!id) return jsonBadRequest("缺少案例 ID");

  if (!(await ensureCaseExists(id))) {
    return jsonNotFound("案例不存在");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("请求体不是合法 JSON");
  }

  const validation = validateCaseVisualTagIds(body);
  if (!validation.ok) {
    return jsonBadRequest(validation.message);
  }

  const adminSupabase = createAdminClient();
  if (validation.data.tag_ids.length > 0) {
    const { data: existingTags, error: tagError } = await adminSupabase
      .from("visual_tags")
      .select("id")
      .in("id", validation.data.tag_ids);

    if (tagError) {
      return jsonServerError("校验画面标签失败");
    }

    if ((existingTags ?? []).length !== validation.data.tag_ids.length) {
      return jsonBadRequest("tag_ids 包含不存在的标签");
    }
  }

  const { error: deleteError } = await adminSupabase
    .from("violation_case_visual_tags")
    .delete()
    .eq("case_id", id);

  if (deleteError) {
    return jsonServerError("清空案例画面标签失败");
  }

  if (validation.data.tag_ids.length > 0) {
    const rows = validation.data.tag_ids.map((tagId) => ({
      case_id: id,
      tag_id: tagId,
    }));
    const { error: insertError } = await adminSupabase
      .from("violation_case_visual_tags")
      .insert(rows);

    if (insertError) {
      return jsonServerError("保存案例画面标签失败");
    }
  }

  return NextResponse.json({
    data: {
      case_id: id,
      tag_ids: validation.data.tag_ids,
    },
  });
}
