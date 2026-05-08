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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { user } = await getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const { path } = await context.params;
  const objectPath = sanitizeStoragePathSegments(path);
  if (!objectPath) {
    return jsonBadRequest("截图路径不合法");
  }

  const { data: caseRows, error: caseError } = await createAdminClient()
    .from("violation_cases")
    .select("id")
    .contains("screenshot_paths", [objectPath])
    .eq("is_deleted", false)
    .limit(1);

  if (caseError) {
    return jsonServerError("校验截图关联失败");
  }

  const belongsToCurrentUserUpload = objectPath.startsWith(`${user.id}/`);
  if (!belongsToCurrentUserUpload && (!caseRows || caseRows.length === 0)) {
    return jsonNotFound("截图不存在");
  }

  const { data, error } = await createAdminClient()
    .storage
    .from(VIOLATION_SCREENSHOT_BUCKET)
    .createSignedUrl(objectPath, 60 * 60);

  if (error || !data?.signedUrl) {
    return jsonNotFound("截图不存在或无法访问");
  }

  return NextResponse.redirect(data.signedUrl);
}
