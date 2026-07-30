import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  canAccessPrivateViolationCases,
  getAuthenticatedContext,
  getUserProfile,
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
  getUserProfile?: typeof getUserProfile;
};

const defaultDeps: ScreenshotRouteDeps = {
  createAdminClient,
  getAuthenticatedContext,
  getUserProfile,
};

type PublishDraftScreenshotRow = {
  id: string;
  submitted_by: string | null;
  status: string | null;
};

type CaseScreenshotRow = PublishDraftScreenshotRow;

export async function buildViolationScreenshotResponse(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  deps: ScreenshotRouteDeps = defaultDeps,
) {
  const { supabase, user } = await deps.getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const { path } = await context.params;
  const objectPath = sanitizeStoragePathSegments(path);
  if (!objectPath) {
    return jsonBadRequest("截图路径不合法");
  }

  const adminSupabase = deps.createAdminClient();
  const [violationCaseResult, knowledgeCaseResult, publishDraftResult] = await Promise.all([
    adminSupabase
      .from("violation_cases")
      .select("id, submitted_by, status")
      .contains("screenshot_paths", [objectPath])
      .eq("is_deleted", false)
      .eq("purpose", "violation")
      .limit(1),
    adminSupabase
      .from("knowledge_cases")
      .select("id, submitted_by, status")
      .contains("screenshot_paths", [objectPath])
      .limit(1),
    adminSupabase
      .from("publish_drafts")
      .select("id, submitted_by, status")
      .contains("screenshot_paths", [objectPath])
      .eq("is_deleted", false)
      .limit(5),
  ]);

  if (violationCaseResult.error || knowledgeCaseResult.error || publishDraftResult.error) {
    return jsonServerError("校验截图关联失败");
  }

  const caseRows = [
    ...((violationCaseResult.data ?? []) as CaseScreenshotRow[]),
    ...((knowledgeCaseResult.data ?? []) as CaseScreenshotRow[]),
  ];
  const getUserProfileForRequest = deps.getUserProfile ?? defaultDeps.getUserProfile!;
  const profile = caseRows.length > 0
    ? await getUserProfileForRequest(supabase, user.id)
    : null;
  const canViewPrivate = profile ? canAccessPrivateViolationCases(profile) : false;
  const publishDraftRows = (publishDraftResult.data ?? []) as PublishDraftScreenshotRow[];
  const belongsToVerifiedCase = caseRows.some((row) => row.status === "verified");
  const belongsToOwnCase = caseRows.some((row) => row.submitted_by === user.id);
  const belongsToPrivateCase = canViewPrivate && caseRows.length > 0;
  const belongsToApprovedDraft = publishDraftRows.some((row) => row.status === "approved");
  const belongsToOwnDraft = publishDraftRows.some((row) => row.submitted_by === user.id);

  if (!belongsToVerifiedCase && !belongsToOwnCase && !belongsToPrivateCase && !belongsToApprovedDraft && !belongsToOwnDraft) {
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
