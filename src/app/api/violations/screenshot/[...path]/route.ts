import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedContext,
  jsonBadRequest,
  jsonNotFound,
  jsonServerError,
  jsonUnauthorized,
  sanitizeStoragePathSegments,
  VIOLATION_SCREENSHOT_BUCKET,
} from "@/lib/violations/api";

type ScreenshotRouteDeps = {
  createAdminClient: typeof createAdminClient;
  getAuthenticatedContext: typeof getAuthenticatedContext;
};

const defaultDeps: ScreenshotRouteDeps = {
  createAdminClient,
  getAuthenticatedContext,
};

type PublishDraftScreenshotRow = {
  id: string;
  submitted_by: string | null;
  status: string | null;
};

export async function buildViolationScreenshotResponse(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  deps: ScreenshotRouteDeps = defaultDeps,
) {
  const { user } = await deps.getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const { path } = await context.params;
  const objectPath = sanitizeStoragePathSegments(path);
  if (!objectPath) {
    return jsonBadRequest("截图路径不合法");
  }

  const adminSupabase = deps.createAdminClient();
  const [caseResult, publishDraftResult] = await Promise.all([
    adminSupabase
      .from("violation_cases")
      .select("id")
      .contains("screenshot_paths", [objectPath])
      .eq("is_deleted", false)
      .eq("purpose", "violation")
      .limit(1),
    adminSupabase
      .from("publish_drafts")
      .select("id, submitted_by, status")
      .contains("screenshot_paths", [objectPath])
      .eq("is_deleted", false)
      .limit(5),
  ]);

  if (caseResult.error || publishDraftResult.error) {
    return jsonServerError("校验截图关联失败");
  }

  const caseRows = caseResult.data ?? [];
  const publishDraftRows = (publishDraftResult.data ?? []) as PublishDraftScreenshotRow[];
  const belongsToCurrentUserUpload = objectPath.startsWith(`${user.id}/`);
  const belongsToApprovedDraft = publishDraftRows.some((row) => row.status === "approved");
  const belongsToOwnDraft = publishDraftRows.some((row) => row.submitted_by === user.id);

  if (!belongsToCurrentUserUpload && caseRows.length === 0 && !belongsToApprovedDraft && !belongsToOwnDraft) {
    return jsonNotFound("截图不存在");
  }

  const { data, error } = await adminSupabase
    .storage
    .from(VIOLATION_SCREENSHOT_BUCKET)
    .createSignedUrl(objectPath, 60 * 60);

  if (error || !data?.signedUrl) {
    return jsonNotFound("截图不存在或无法访问");
  }

  return NextResponse.redirect(data.signedUrl);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return buildViolationScreenshotResponse(request, context);
}
