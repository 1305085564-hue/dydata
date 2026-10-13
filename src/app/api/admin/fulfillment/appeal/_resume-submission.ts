import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildVideoSubmitResponse,
  defaultVideoSubmitDeps,
} from "@/app/api/video-submit/route-core";

export type ResumeSubmissionResult =
  | { success: true; videoId: string | null; cleared: boolean }
  | { success: false; error: string };

export type ResumeSubmissionDeps = {
  getBaseUrl?: () => string;
  markWriteRequest?: () => void;
};

export async function resumeAppealSubmission(
  appealId: string,
  supabase: SupabaseClient,
  deps: ResumeSubmissionDeps = {},
  expectedUserId?: string,
): Promise<ResumeSubmissionResult> {
  let appealQuery = supabase
    .from("fulfillment_appeals")
    .select("id, user_id, status, submission_payload")
    .eq("id", appealId);
  if (expectedUserId) appealQuery = appealQuery.eq("user_id", expectedUserId);
  const { data: appeal, error: readError } = await appealQuery.maybeSingle();

  if (readError) return { success: false, error: "读取补交申请失败" };
  if (!appeal) return { success: false, error: "补交申请不存在" };
  if (appeal.status !== "approved") return { success: false, error: "补交申请尚未通过" };
  if (!appeal.submission_payload || typeof appeal.submission_payload !== "object") {
    return { success: false, error: "没有找到待续交的数据" };
  }

  const baseUrl = deps.getBaseUrl?.() ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
  const request = new NextRequest(new URL("/api/video-submit", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(appeal.submission_payload),
  });
  const response = await buildVideoSubmitResponse(
    request,
    defaultVideoSubmitDeps,
    undefined,
    { userId: appeal.user_id },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "数据写入失败" })) as { error?: string };
    return { success: false, error: body.error ?? "数据写入失败" };
  }

  const result = await response.json().catch(() => ({})) as { id?: string; video_id?: string };
  deps.markWriteRequest?.();
  const { error: clearError } = await supabase
    .from("fulfillment_appeals")
    .update({ submission_payload: null })
    .eq("id", appealId)
    .eq("status", "approved");

  if (clearError) {
    console.warn(`[appeal ${appealId}] 数据已写入，但清空暂存失败`, clearError);
  }

  return {
    success: true,
    videoId: result.id ?? result.video_id ?? null,
    cleared: !clearError,
  };
}
