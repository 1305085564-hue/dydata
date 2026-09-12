import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Next.js 16 的服务端错误钩子；SDK 的隐私过滤会在事件送出前执行。 */
export const onRequestError = Sentry.captureRequestError;
