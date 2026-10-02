export type RequestContext = {
  requestId: string;
  actorId: string | null;
  companyId: string | null;
  groupMode: boolean;
  route: string;
  operation: string;
  targetId: string | null;
  permissionScope: string | null;
  startedAt: number;
};

const REQUEST_ID_HEADER = "x-dydata-request-id";

function createRequestId() {
  return crypto.randomUUID();
}

function clean(value: string | null | undefined, maxLength = 128) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function createRequestContext(input: {
  request?: Request;
  requestId?: string | null;
  actorId?: string | null;
  companyId?: string | null;
  groupMode?: boolean;
  route: string;
  operation: string;
  targetId?: string | null;
  permissionScope?: string | null;
  startedAt?: number;
}): RequestContext {
  const headerRequestId = input.request?.headers.get(REQUEST_ID_HEADER) ?? input.request?.headers.get("x-request-id");
  return {
    requestId: clean(input.requestId ?? headerRequestId, 128) ?? createRequestId(),
    actorId: clean(input.actorId),
    companyId: clean(input.companyId),
    groupMode: input.groupMode === true,
    route: clean(input.route, 256) ?? "unknown",
    operation: clean(input.operation, 128) ?? "unknown",
    targetId: clean(input.targetId),
    permissionScope: clean(input.permissionScope, 256),
    startedAt: input.startedAt ?? Date.now(),
  };
}

export function childRequestContext(
  context: RequestContext,
  overrides: Partial<Omit<RequestContext, "requestId" | "startedAt">>,
): RequestContext {
  return { ...context, ...overrides };
}

export function requestContextLogFields(context: RequestContext) {
  return {
    requestId: context.requestId,
    ...(context.actorId ? { actorId: context.actorId } : {}),
    ...(context.companyId ? { companyId: context.companyId } : {}),
    groupMode: context.groupMode,
    route: context.route,
    operation: context.operation,
    ...(context.targetId ? { targetId: context.targetId } : {}),
    ...(context.permissionScope ? { permissionScope: context.permissionScope } : {}),
  };
}

export const requestContextHeaders = { requestId: REQUEST_ID_HEADER } as const;
