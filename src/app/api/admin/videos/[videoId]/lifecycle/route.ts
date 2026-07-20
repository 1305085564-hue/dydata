import { NextRequest, NextResponse } from "next/server";

import { performVideoLifecycleAction, type VideoLifecycleAction } from "@/lib/video-lifecycle";

function isAction(value: unknown): value is VideoLifecycleAction {
  return value === "trash" || value === "restore" || value === "purge";
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ videoId: string }> }) {
  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }
  if (!isAction(body.action)) return NextResponse.json({ error: "action 只能是 trash、restore 或 purge" }, { status: 400 });

  const { videoId } = await context.params;
  const result = await performVideoLifecycleAction({ videoId, action: body.action });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    ok: true,
    lifecycle_state: result.lifecycleState,
    trashed_at: result.trashedAt,
    purged_at: result.purgedAt,
    screenshot_cleanup_failed: result.screenshotCleanupFailed,
  });
}
