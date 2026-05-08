import { NextRequest, NextResponse } from "next/server";

import {
  getAuthenticatedContext,
  getOwnedAccount,
  jsonBadRequest,
  jsonError,
  jsonNotFound,
  jsonServerError,
  jsonUnauthorized,
  jsonValidationError,
} from "@/lib/violations/api";
import { validateCreateTestRecordPayload } from "@/lib/violations/validation";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedContext();

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
    .single();

  if (caseError || !currentCase) {
    return jsonNotFound("违规话术不存在");
  }

  if (currentCase.status === "archived") {
    return jsonError("CONFLICT", "已归档案例不能追加测试记录", 409);
  }

  const accountResult = await getOwnedAccount(supabase, user.id, validation.data.account_id);
  if (!accountResult.ok) {
    return accountResult.response;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let duplicateQuery = supabase
    .from("violation_test_records")
    .select("id")
    .eq("case_id", id)
    .eq("tested_by", user.id)
    .gte("tested_at", since)
    .limit(1);

  duplicateQuery = accountResult.account
    ? duplicateQuery.eq("account_id", accountResult.account.id)
    : duplicateQuery.is("account_id", null);

  const { data: duplicated, error: duplicateError } = await duplicateQuery;
  if (duplicateError) {
    return jsonServerError("检查重复测试记录失败");
  }

  if (duplicated && duplicated.length > 0) {
    return jsonError("CONFLICT", "同一案例同一账号 24 小时内不能重复提交测试记录", 409);
  }

  const { data, error } = await supabase
    .from("violation_test_records")
    .insert({
      case_id: id,
      tested_by: user.id,
      account_id: accountResult.account?.id ?? null,
      passed: validation.data.passed,
      note: validation.data.note,
    })
    .select("*")
    .single();

  if (error) {
    return jsonServerError("提交测试记录失败");
  }

  return NextResponse.json({ data }, { status: 201 });
}
