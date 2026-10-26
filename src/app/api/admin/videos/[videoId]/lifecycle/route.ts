import { NextRequest, NextResponse } from "next/server";

import { performVideoLifecycleAction, type VideoLifecycleAction } from "@/lib/video-lifecycle";
import { observeMutation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, resolveObservedMutationRequestId } from "@/lib/observed-mutation-result";

function isAction(value: unknown): value is VideoLifecycleAction {
  return value === "trash" || value === "restore" || value === "purge";
}

export const defaultVideoLifecycleDeps = {
  performVideoLifecycleAction,
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ videoId: string }> }) {
  return observeMutation("/api/admin/videos/[videoId]/lifecycle", async (observation) => {
    observation.mark("validate");
    observation.setDetail?.({ businessSucceeded: false, auditStatus: "skipped", employeeNotificationStatus: "skipped", todoStatus: "skipped", compensationRequired: false, events: [] });
    const finish = (response: Response) => appendObservedMutationResult(response, observation);
    let body: { action?: unknown };
    try {
      body = await request.json();
    } catch {
      return finish(NextResponse.json({ error: "请求体格式不正确" }, { status: 400 }));
    }
    if (!isAction(body.action)) return finish(NextResponse.json({ error: "action 只能是 trash、restore 或 purge" }, { status: 400 }));

    observation.mark("scope");
    const { videoId } = await context.params;
    const result = await defaultVideoLifecycleDeps.performVideoLifecycleAction({ videoId, action: body.action });
    if (!result.ok) return finish(NextResponse.json({ error: result.error }, { status: result.status }));
    const response = NextResponse.json({
      ok: true,
      lifecycle_state: result.lifecycleState,
      trashed_at: result.trashedAt,
      purged_at: result.purgedAt,
      screenshot_cleanup_failed: result.screenshotCleanupFailed,
      daily_reports_changed: result.dailyReportsChanged,
    });
    return appendObservedMutationResult(response, observation);
  }, { createRequestId: () => resolveObservedMutationRequestId(request) });
}
