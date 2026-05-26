import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildVisualTagDetail } from "@/lib/violations/visual-tags";
import {
  getAuthenticatedContext,
  jsonBadRequest,
  jsonNotFound,
  jsonServerError,
  jsonUnauthorized,
} from "@/lib/violations/api";

type VisualTagRow = {
  id: string;
  name: string;
  description: string | null;
};

type VisualTagCaseRow = {
  id: string;
  script_text: string | null;
  account_name_snapshot: string | null;
  pass_count: number | null;
  fail_count: number | null;
  status: string;
  is_deleted: boolean;
};

type VisualTagCaseJoinRow = {
  case:
    | VisualTagCaseRow
    | VisualTagCaseRow[]
    | null;
};

function getJoinedCase(row: VisualTagCaseJoinRow) {
  return Array.isArray(row.case) ? row.case[0] ?? null : row.case;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ tagId: string }> },
) {
  const { user } = await getAuthenticatedContext();
  if (!user) return jsonUnauthorized();

  const { tagId } = await context.params;
  if (!tagId) return jsonBadRequest("缺少标签 ID");

  const supabase = createAdminClient();
  const { data: tag, error: tagError } = await supabase
    .from("visual_tags")
    .select("id, name, description")
    .eq("id", tagId)
    .single();

  if (tagError || !tag) {
    return jsonNotFound("画面标签不存在");
  }

  const { data: rawCases, error: casesError } = await supabase
    .from("violation_case_visual_tags")
    .select(
      `case:violation_cases(id, script_text, account_name_snapshot, pass_count, fail_count, status, is_deleted)`,
    )
    .eq("tag_id", tagId)
    .order("created_at", { ascending: false });

  if (casesError) {
    return jsonServerError("获取画面标签详情失败");
  }

  const cases = ((rawCases ?? []) as VisualTagCaseJoinRow[])
    .map(getJoinedCase)
    .filter((row): row is VisualTagCaseRow => Boolean(row))
    .filter((row) => !row.is_deleted)
    .map((row) => ({
      id: row.id,
      script_text: row.script_text,
      account_name_snapshot: row.account_name_snapshot,
      pass_count: row.pass_count,
      fail_count: row.fail_count,
      status: row.status,
    }));

  return NextResponse.json({
    data: buildVisualTagDetail(tag as VisualTagRow, cases),
  });
}
