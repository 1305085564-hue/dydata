import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ALLOWED_SCREENSHOT_TYPES,
  getAuthenticatedContext,
  getOwnedAccount,
  getUserProfile,
  isPlainObject,
  jsonBadRequest,
  jsonError,
  jsonForbidden,
  jsonNotFound,
  jsonServerError,
  jsonUnauthorized,
  jsonValidationError,
  MAX_SCREENSHOT_SIZE,
  normalizeOptionalText,
  normalizeStringArray,
  sanitizeFilename,
  VIOLATION_SCREENSHOT_BUCKET,
} from "@/lib/violations/api";

import { parsePublishDraftActorScope, type PublishDraftActorScope } from "./types";

export {
  ALLOWED_SCREENSHOT_TYPES,
  getAuthenticatedContext,
  getOwnedAccount,
  getUserProfile,
  isPlainObject,
  jsonBadRequest,
  jsonError,
  jsonForbidden,
  jsonNotFound,
  jsonServerError,
  jsonUnauthorized,
  jsonValidationError,
  MAX_SCREENSHOT_SIZE,
  normalizeOptionalText,
  normalizeStringArray,
  sanitizeFilename,
  VIOLATION_SCREENSHOT_BUCKET,
};

export async function ensureCanReview(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  | { ok: true; scope: PublishDraftActorScope }
  | { ok: false; response: Response }
> {
  const { data, error } = await supabase.rpc("publish_draft_actor_scope", {
    p_user_id: userId,
  });

  if (error) {
    return { ok: false, response: jsonServerError("获取视频审核权限失败") };
  }

  const scope = parsePublishDraftActorScope(data);
  if (!scope) {
    return { ok: false, response: jsonServerError("视频审核权限返回格式不合法") };
  }

  if (!scope.can_review) {
    return { ok: false, response: jsonForbidden("缺少视频审核权限") };
  }

  return { ok: true, scope };
}
