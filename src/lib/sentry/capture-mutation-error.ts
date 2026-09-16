import * as Sentry from "@sentry/nextjs";

import type { MutationCaptureContext } from "../observed-mutation";

/** 服务端写链路只上报固定分类和白名单诊断标签，不携带请求体、SQL 或业务对象。 */
export function captureMutationError(error: Error, context: MutationCaptureContext) {
  Sentry.captureException(error, {
    tags: {
      "dydata.request_id": context.requestId,
      ...(context.stage ? { "dydata.stage": context.stage } : {}),
      "dydata.outcome": context.outcome,
    },
  });
}
