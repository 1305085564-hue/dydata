import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedContext,
  getOwnedAccount,
  jsonBadRequest,
  jsonForbidden,
  jsonNotFound,
  jsonServerError,
  jsonUnauthorized,
  jsonValidationError,
} from "@/lib/publish-drafts/api";
import { loadDraftById } from "@/lib/publish-drafts/read-model";
import { validateUpdateDraftPayload } from "@/lib/publish-drafts/validation";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedContext();
  if (!user) {
    return jsonUnauthorized();
  }

  const { id } = await context.params;
  const { data, errorMessage } = await loadDraftById(supabase, id);
  if (errorMessage) {
    return jsonServerError(errorMessage);
  }
  if (!data) {
    return jsonNotFound("稿件不存在");
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedContext();
  if (!user) {
    return jsonUnauthorized();
  }

  const { id } = await context.params;
  const current = await loadDraftById(supabase, id);
  if (current.errorMessage) {
    return jsonServerError(current.errorMessage);
  }
  if (!current.data) {
    return jsonNotFound("稿件不存在");
  }
  if (current.data.submitted_by !== user.id) {
    return jsonForbidden("只能整改自己的稿件");
  }
  if (current.data.status !== "rejected") {
    return jsonForbidden("只有被打回的稿件才能重新提交");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("请求体不是合法 JSON");
  }

  const validation = validateUpdateDraftPayload(body);
  if (!validation.ok) {
    return jsonValidationError(validation.message, validation.details);
  }

  if (validation.data.screenshot_paths) {
    const invalidScreenshotPath = validation.data.screenshot_paths.find(
      (path) => !path.startsWith(`${user.id}/`) || path.includes(".."),
    );
    if (invalidScreenshotPath) {
      return jsonValidationError("screenshot_paths 包含无效路径");
    }
  }

  let accountId = current.data.account_id;
  let accountNameSnapshot = current.data.account_name_snapshot;

  if ("account_id" in validation.data) {
    const accountResult = await getOwnedAccount(supabase, user.id, validation.data.account_id ?? null);
    if (!accountResult.ok) {
      return accountResult.response;
    }
    accountId = accountResult.account?.id ?? null;
    accountNameSnapshot = accountResult.account?.name ?? null;
  }

  const { data, error } = await createAdminClient()
    .from("publish_drafts")
    .update({
      ...(validation.data.script_text !== undefined ? { script_text: validation.data.script_text } : {}),
      ...(validation.data.screenshot_paths !== undefined ? { screenshot_paths: validation.data.screenshot_paths } : {}),
      ...("account_id" in validation.data ? {
        account_id: accountId,
        account_name_snapshot: accountNameSnapshot,
      } : {}),
      status: "pending",
      current_round: current.data.current_round + 1,
      reviewed_by: null,
      reviewed_at: null,
      approved_at: null,
    })
    .eq("id", id)
    .eq("submitted_by", user.id)
    .eq("status", "rejected")
    .eq("is_deleted", false)
    .select("*")
    .single();

  if (error || !data) {
    return jsonServerError("重新提交稿件失败");
  }

  return NextResponse.json({ data });
}
