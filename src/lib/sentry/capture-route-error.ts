"use client";

import * as Sentry from "@sentry/nextjs";

/** 仅允许调用方传入固定错误边界名；隐私过滤层会删除其他 tag。 */
export function captureRouteError(error: Error, boundary: string) {
  Sentry.captureException(error, {
    tags: { "dydata.boundary": boundary },
  });
}
