import * as Sentry from "@sentry/nextjs";
import type { CosFailureDetail } from "./cos/client";

export type ScreenshotReadFailureEvent = {
  requestId: string;
  imageKey: string;
  mode: "fast" | "slow";
  authMs: number;
  failure?: CosFailureDetail;
};

type Capture = (error: Error, context: { tags: Record<string, string> }) => unknown;

/** 不传原图路径、Cookie或原始错误文本；固定分类经现有Sentry隐私白名单后仍保留。 */
export function reportScreenshotReadFailure(
  event: ScreenshotReadFailureEvent,
  deps: { log?: (record: Record<string, unknown>) => void; capture?: Capture } = {},
) {
  const failure = event.failure;
  const kind = failure?.kind ?? "unknown";
  const code = failure?.code ?? "UNKNOWN";
  const phase = failure?.phase ?? "headers";
  const attempts = failure?.attempts ?? 1;
  const record = {
    event: "screenshot_read_failure",
    requestId: event.requestId,
    imageKey: event.imageKey,
    mode: event.mode,
    auth_ms: event.authMs,
    kind, code, phase, attempts,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    region: process.env.COS_REGION ?? null,
  };
  try { (deps.log ?? ((value) => console.error("[screenshot-storage]", JSON.stringify(value))))(record); } catch { /* 观测不能改变业务结果。 */ }
  const error = new Error("Screenshot storage read failed");
  error.name = "ScreenshotStorageReadError";
  try {
    (deps.capture ?? Sentry.captureException)(error, {
      tags: {
        "dydata.boundary": `screenshot-storage/${kind}/${code}/${phase}/attempts-${attempts}`,
        "dydata.request_id": event.requestId,
        "dydata.stage": "read",
        "dydata.outcome": "failed",
      },
    });
  } catch { /* 错误平台不可用时仍返回原来的失败状态。 */ }
}
