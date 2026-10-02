import { logApiRequest, type ApiLogEntry } from "./api-logger";
import { requestContextLogFields, type RequestContext } from "./request-context";

export type OperationMetrics = {
  requestId: string;
  route: string;
  operation: string;
  status: number;
  durationMs: number;
  outcome: "success" | "rejected" | "failed" | "thrown";
  queryCount?: number;
  retryCount?: number;
  cache?: { hit: number; miss: number; invalidation: number };
};

function resolveOutcome(status: number): OperationMetrics["outcome"] {
  if (status >= 500) return "failed";
  if (status >= 400) return "rejected";
  return "success";
}

function safeLog(log: (entry: ApiLogEntry) => void, entry: ApiLogEntry) {
  try { log(entry); } catch { /* 观测故障不能改变业务结果。 */ }
}

export async function observeOperation<T>(
  context: RequestContext,
  task: () => Promise<{ value: T; status?: number; detail?: Record<string, unknown> }>,
  deps: { now?: () => number; log?: (entry: ApiLogEntry) => void } = {},
): Promise<{ value: T; metrics: OperationMetrics }> {
  const now = deps.now ?? Date.now;
  const startedAt = context.startedAt;
  const log = deps.log ?? logApiRequest;
  try {
    const result = await task();
    const metrics: OperationMetrics = {
      ...contextMetrics(context),
      status: result.status ?? 200,
      durationMs: Math.max(0, now() - startedAt),
      outcome: resolveOutcome(result.status ?? 200),
    };
    safeLog(log, { ...metrics, detail: { ...result.detail, ...contextDetail(context) } });
    return { value: result.value, metrics };
  } catch (error) {
    const metrics: OperationMetrics = {
      ...contextMetrics(context),
      status: 500,
      durationMs: Math.max(0, now() - startedAt),
      outcome: "thrown",
    };
    safeLog(log, { ...metrics, detail: { ...contextDetail(context), errorType: error instanceof Error ? error.name : "unknown" } });
    throw error;
  }
}

export async function observeRequest(
  context: RequestContext,
  handler: () => Promise<Response>,
  deps: { now?: () => number; log?: (entry: ApiLogEntry) => void } = {},
) {
  const result = await observeOperation(context, async () => {
    const response = await handler();
    return { value: response, status: response.status };
  }, deps);
  const headers = new Headers(result.value.headers);
  headers.set("x-dydata-request-id", context.requestId);
  return new Response(result.value.body, { status: result.value.status, statusText: result.value.statusText, headers });
}

function contextMetrics(context: RequestContext) {
  return { requestId: context.requestId, route: context.route, operation: context.operation };
}

function contextDetail(context: RequestContext) {
  return requestContextLogFields(context);
}
