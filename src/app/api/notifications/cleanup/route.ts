import { NextRequest, NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportCronFailure } from "@/lib/cron-failure";
import { toStringErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cleanup_expired_notifications");

  if (error) {
    await reportCronFailure("通知清理", error);
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/notifications/cleanup",
      operation: "cleanup-expired-notifications",
      request,
      error: error.message,
    });
  }

  let ocrDeleted = 0;
  try {
    const { data: ocrData } = await admin.rpc("cleanup_ocr_recognition_logs");
    ocrDeleted = ocrData ?? 0;
  } catch (ocrErr) {
    console.error("[ocr_logs/cleanup] failed", ocrErr);
    await reportCronFailure("OCR 日志清理", ocrErr);
  }

  try {
    await admin.rpc("cleanup_ai_call_attempts");
  } catch (aiCallErr) {
    console.error("[ai_call_attempts/cleanup] failed", aiCallErr);
    await reportCronFailure("AI 调用台账清理", aiCallErr);
  }

  return NextResponse.json({ ok: true, deleted: data ?? 0, ocr_deleted: ocrDeleted });
}
