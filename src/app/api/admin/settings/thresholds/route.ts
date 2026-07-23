import { NextResponse } from "next/server";

import {
  readJsonBody,
  requireAdminServiceClient,
  requireOwnerOrTeamAdminRole,
} from "../../fulfillment/_shared";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_VIDEO_REVIEW_THRESHOLDS,
  normalizeVideoReviewThresholds,
  parseVideoReviewThresholds,
  VIDEO_REVIEW_THRESHOLDS_KEY,
  type VideoReviewThresholds,
} from "@/lib/video-review-thresholds";

const SETTINGS_DESCRIPTION = "视频复盘与素材库异常警戒阈值";

type ThresholdsRouteDeps = {
  createClient: typeof createClient;
  requireAdminServiceClient: typeof requireAdminServiceClient;
  requireOwnerOrTeamAdminRole: typeof requireOwnerOrTeamAdminRole;
};

const defaultDeps: ThresholdsRouteDeps = {
  createClient,
  requireAdminServiceClient,
  requireOwnerOrTeamAdminRole,
};

function isMissingSystemSettingsTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST205" || message.includes("public.system_settings");
}

function jsonServerError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function parseThresholdsPayload(input: unknown):
  | { data: VideoReviewThresholds }
  | { response: NextResponse } {
  const parsed = parseVideoReviewThresholds(input);
  if ("error" in parsed) {
    return { response: NextResponse.json({ error: parsed.error }, { status: 400 }) };
  }
  return parsed;
}

export async function buildVideoReviewThresholdsGetResponse(
  deps: ThresholdsRouteDeps = defaultDeps,
) {
  const supabase = await deps.createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const result = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", VIDEO_REVIEW_THRESHOLDS_KEY)
    .maybeSingle();

  if (result.error && !isMissingSystemSettingsTableError(result.error)) {
    return jsonServerError(result.error.message || "读取阈值配置失败");
  }

  return NextResponse.json({
    thresholds:
      result.error && isMissingSystemSettingsTableError(result.error)
        ? { ...DEFAULT_VIDEO_REVIEW_THRESHOLDS }
        : normalizeVideoReviewThresholds(result.data?.value),
  });
}

export async function buildVideoReviewThresholdsPatchResponse(
  request: Request,
  deps: ThresholdsRouteDeps = defaultDeps,
) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;

  const payload = parseThresholdsPayload(body.data);
  if ("response" in payload) return payload.response;

  const auth = await deps.requireAdminServiceClient();
  const forbidden = deps.requireOwnerOrTeamAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.from("system_settings").upsert(
    {
      key: VIDEO_REVIEW_THRESHOLDS_KEY,
      value: payload.data,
      description: SETTINGS_DESCRIPTION,
      updated_by: auth.actor.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (result.error) return jsonServerError(result.error.message || "更新阈值配置失败");

  const auditResult = await auth.supabase.from("audit_logs").insert({
    user_id: auth.actor.userId,
    action: "video_review_thresholds_updated",
    target: VIDEO_REVIEW_THRESHOLDS_KEY,
    detail: JSON.stringify({ thresholds: payload.data }),
  });

  if (auditResult.error) {
    return jsonServerError(auditResult.error.message || "阈值配置已更新，但审计记录写入失败");
  }

  return NextResponse.json({ ok: true, thresholds: payload.data });
}

export async function GET() {
  return buildVideoReviewThresholdsGetResponse();
}

export async function PATCH(request: Request) {
  return buildVideoReviewThresholdsPatchResponse(request);
}
