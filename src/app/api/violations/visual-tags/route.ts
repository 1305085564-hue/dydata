import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildVisualTagList, validateCreateVisualTagPayload } from "@/lib/violations/visual-tags";
import {
  getAuthenticatedContext,
  jsonBadRequest,
  jsonServerError,
  jsonUnauthorized,
  requireViolationAdmin,
} from "@/lib/violations/api";

type VisualTagRow = {
  id: string;
  name: string;
  description: string | null;
};

type VisualTagLinkRow = {
  tag_id: string;
};

export async function GET() {
  const { user } = await getAuthenticatedContext();
  if (!user) return jsonUnauthorized();

  const supabase = createAdminClient();
  const [tagsResult, linksResult] = await Promise.all([
    supabase
      .from("visual_tags")
      .select("id, name, description")
      .order("name", { ascending: true }),
    supabase
      .from("violation_case_visual_tags")
      .select("tag_id"),
  ]);

  if (tagsResult.error || linksResult.error) {
    return jsonServerError("获取画面标签失败");
  }

  return NextResponse.json({
    data: buildVisualTagList(
      (tagsResult.data ?? []) as VisualTagRow[],
      (linksResult.data ?? []) as VisualTagLinkRow[],
    ),
  });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await getAuthenticatedContext();
  if (!user) return jsonUnauthorized();

  const admin = await requireViolationAdmin(supabase, user);
  if (!admin.ok) return admin.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("请求体不是合法 JSON");
  }

  const validation = validateCreateVisualTagPayload(body);
  if (!validation.ok) {
    return jsonBadRequest(validation.message);
  }

  const { data, error } = await createAdminClient()
    .from("visual_tags")
    .insert({
      name: validation.data.name,
      description: validation.data.description,
      created_by: user.id,
    })
    .select("id, name, description")
    .single();

  if (error) {
    if (error.code === "23505") {
      return jsonBadRequest("标签名称已存在");
    }
    return jsonServerError("创建画面标签失败");
  }

  return NextResponse.json({ data }, { status: 201 });
}
