import { NextRequest, NextResponse } from "next/server";

import { archivedFeatureResponse, isArchivedWriteEnabled } from "@/app/api/_archive";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedContext,
  jsonBadRequest,
  jsonServerError,
  jsonUnauthorized,
  jsonValidationError,
} from "@/lib/publish-drafts/api";
import { loadOwnDrafts, PUBLISH_DRAFT_SELECT } from "@/lib/publish-drafts/read-model";
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
  if (isArchivedWriteEnabled()) {
    return archivedFeatureResponse("视频审核稿件提交已归档，不再接受新的待审稿");
  }

  const { user } = await getAuthenticatedContext();
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

  const admin = createAdminClient();

  let accountId: string | null = null;
  let accountName: string | null = null;

  if (validation.data.account_id) {
    const { data: acct, error: acctErr } = await admin
      .from("accounts")
      .select("id, name, profile_id")
      .eq("id", validation.data.account_id)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (acctErr || !acct) {
      return jsonServerError("account_id 不属于当前用户");
    }

    accountId = acct.id;
    accountName = acct.name;
  }

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    return jsonServerError("用户资料不存在");
  }

  const { data, error } = await admin
    .from("publish_drafts")
    .insert({
      submitted_by: user.id,
      account_id: accountId,
      account_name_snapshot: accountName,
      team_id: (profile.team_id ?? null) as string | null,
      script_text: validation.data.script_text,
      screenshot_paths: validation.data.screenshot_paths,
      status: "pending",
      current_round: 1,
      feedback_history: [],
    })
    .select(PUBLISH_DRAFT_SELECT)
    .single();

  if (error || !data) {
    console.error("[POST /api/publish-drafts] insert error:", JSON.stringify(error));
    return jsonServerError(error?.message ?? "提交视频审核稿失败");
  }

  return NextResponse.json({ data }, { status: 201 });
}
