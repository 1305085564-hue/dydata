import { NextRequest, NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportCronFailure } from "@/lib/cron-failure";
import { toStringErrorResponse } from "@/lib/errors";

export async function buildNotificationCleanupResponse(request: NextRequest, deps = { isCronAuthorized, createAdminClient, reportCronFailure }) {
  if (!deps.isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = deps.createAdminClient();
  const { data, error } = await admin.rpc("cleanup_expired_notifications");

  if (error) {
    await deps.reportCronFailure("通知清理", error);
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/notifications/cleanup",
      operation: "cleanup-expired-notifications",
      request,
      error,
    });
  }

  let ocrDeleted = 0;
  const failures: string[] = [];
  try {
    const { data: ocrData, error: ocrError } = await admin.rpc("cleanup_ocr_recognition_logs");
    if (ocrError) throw ocrError;
    ocrDeleted = ocrData ?? 0;
  } catch (ocrErr) {
    failures.push("ocr");
    console.error("[ocr_logs/cleanup] failed", ocrErr);
    await deps.reportCronFailure("OCR 日志清理", ocrErr);
  }

  try {
    const { error: aiCallError } = await admin.rpc("cleanup_ai_call_attempts");
    if (aiCallError) throw aiCallError;
  } catch (aiCallErr) {
    failures.push("ai_call_attempts");
    console.error("[ai_call_attempts/cleanup] failed", aiCallErr);
    await deps.reportCronFailure("AI 调用台账清理", aiCallErr);
  }

  return NextResponse.json({ ok: failures.length === 0, deleted: data ?? 0, ocr_deleted: ocrDeleted, failures }, { status: failures.length ? 500 : 200 });
}

export async function GET(request: NextRequest) {
  return buildNotificationCleanupResponse(request);
}
