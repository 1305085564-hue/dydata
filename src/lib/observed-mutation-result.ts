import {
  observeMutation,
  type MutationObservation,
  type MutationRoute,
  type ObserveMutationDeps,
} from "./observed-mutation";
export type { MutationObservation } from "./observed-mutation";

type LayerStatus = "succeeded" | "failed" | "skipped";

type MutationResultBody = Record<string, unknown>;

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is MutationResultBody {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function statusBoolean(status: LayerStatus) {
  return status === "succeeded" ? true : status === "failed" ? false : null;
}

export function resolveObservedMutationRequestId(request: Request) {
  const supplied = request.headers.get("x-dydata-request-id")?.trim();
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

export function observeMutationRequest(
  route: MutationRoute,
  request: Request,
  handler: (observation: MutationObservation) => Promise<Response>,
  deps: ObserveMutationDeps = {},
) {
  return observeMutation(route, handler, {
    ...deps,
    createRequestId: deps.createRequestId ?? (() => resolveObservedMutationRequestId(request)),
  });
}

/**
 * Keep the route's original payload while adding the shared mutation result
 * fields used by admin write endpoints.
 */
export async function appendObservedMutationResult(
  response: Response,
  observation?: MutationObservation,
) {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json") || contentType.includes("+json");

  // 非 JSON 响应（二进制图片、CSV 导出、纯文本）不能靠 json() 解析，也不能被
  // 重新序列化成 JSON —— 那会把响应体静默变成 null / 破坏二进制内容。
  // 这类响应不是"业务结果 JSON"，原样放行，不做分层字段附加。
  if (response.body !== null && !isJson) {
    observation?.setDetail?.({ businessSucceeded: response.ok });
    return response;
  }

  let body: unknown = null;
  try {
    body = await response.clone().json();
  } catch {
    // 声明为 JSON 但解析失败：保留 null 语义，仍补分层字段，由调用方自行判定。
  }

  const record = isRecord(body) ? body : {};
  const auditStatus: LayerStatus = record.auditStatus === "succeeded" || record.auditStatus === "failed"
    ? record.auditStatus
    : "skipped";
  const employeeNotificationStatus: LayerStatus = record.employeeNotificationStatus === "succeeded" || record.employeeNotificationStatus === "failed"
    ? record.employeeNotificationStatus
    : "skipped";
  const todoStatus: LayerStatus = record.todoStatus === "succeeded" || record.todoStatus === "failed"
    ? record.todoStatus
    : "skipped";
  const businessSucceeded = typeof record.businessSucceeded === "boolean"
    ? record.businessSucceeded
    : typeof record.success === "boolean"
      ? record.success
      : response.ok;
  const fields = {
    businessSucceeded,
    permissionChecked: response.status !== 401 && response.status !== 403,
    auditSucceeded: record.auditSucceeded ?? statusBoolean(auditStatus),
    notificationSucceeded: record.notificationSucceeded
      ?? record.employeeNotificationSucceeded
      ?? statusBoolean(employeeNotificationStatus),
    todoMarked: record.todoMarked ?? record.notificationMarked ?? statusBoolean(todoStatus),
    compensationRequired: record.compensationRequired
      ?? [auditStatus, employeeNotificationStatus, todoStatus].includes("failed"),
    auditStatus,
    employeeNotificationStatus,
    todoStatus,
    employeeNotificationSucceeded: record.employeeNotificationSucceeded
      ?? statusBoolean(employeeNotificationStatus),
    notificationMarked: record.notificationMarked ?? statusBoolean(todoStatus),
  } satisfies MutationResultBody;

  observation?.setDetail?.(fields);
  if (businessSucceeded) observation?.mark("finalize");

  const nextBody = isRecord(body)
    ? { ...body, ...fields }
    : { data: body, ...fields };
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(nextBody), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
