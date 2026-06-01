import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedContext,
  getOwnedAccount,
  jsonBadRequest,
  jsonServerError,
  jsonUnauthorized,
  jsonValidationError,
} from "@/lib/publish-drafts/api";
import { loadOwnDrafts } from "@/lib/publish-drafts/read-model";
import { isDraftStatus } from "@/lib/publish-drafts/types";
import { validateCreateDraftPayload } from "@/lib/publish-drafts/validation";

export async function GET(request: NextRequest) {
  const { supabase, user } = await getAuthenticatedContext();
  if (!user) {
    return jsonUnauthorized();
  }

  const { data, errorMessage } = await loadOwnDrafts(supabase, user.id);
  if (errorMessage || !data) {
    return jsonServerError(errorMessage ?? "获取我的稿件失败");
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() ?? null;
  if (status && !isDraftStatus(status)) {
    return jsonBadRequest("status 不合法");
  }

  const filtered = status ? data.filter((item) => item.status === status) : data;
  return NextResponse.json({ data: filtered });
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

  const validation = validateCreateDraftPayload(body);
  if (!validation.ok) {
    return jsonValidationError(validation.message, validation.details);
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

  const profileQuery = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .single();

  if (profileQuery.error || !profileQuery.data) {
    return jsonServerError("用户资料不存在");
  }

  const { data, error } = await createAdminClient()
    .from("publish_drafts")
    .insert({
      submitted_by: user.id,
      account_id: accountResult.account?.id ?? null,
      account_name_snapshot: accountResult.account?.name ?? null,
      team_id: (profileQuery.data.team_id ?? null) as string | null,
      script_text: validation.data.script_text,
      screenshot_paths: validation.data.screenshot_paths,
      status: "pending",
      current_round: 1,
      feedback_history: [],
    })
    .select("*")
    .single();

  if (error || !data) {
    return jsonServerError("提交视频审核稿失败");
  }

  return NextResponse.json({ data }, { status: 201 });
}
