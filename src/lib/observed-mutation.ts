import { logApiRequest, type ApiLogEntry } from "./api-logger";
import { getSentryRelease } from "./sentry/privacy";
import { captureMutationError } from "./sentry/capture-mutation-error";

export type MutationRoute = "/api/video-submit" | "/api/exemptions/apply" | "/api/exemptions/review";

export type MutationStage =
  | "auth"
  | "validate"
  | "scope"
  | "read"
  | "write-video"
  | "write-snapshot"
  | "write-report"
  | "write-tags"
  | "write-request"
  | "write-dates"
  | "review-rpc"
  | "compensate"
  | "finalize";

export type MutationOutcome = "success" | "rejected" | "failed" | "thrown";

export type MutationObservation = {
  requestId: string;
  mark: (stage: MutationStage) => void;
};

export type MutationCaptureContext = {
  requestId: string;
  route: MutationRoute;
  stage?: MutationStage;
  outcome: MutationOutcome;
};

type ObserveMutationDeps = {
  createRequestId?: () => string;
  now?: () => number;
  log?: (entry: ApiLogEntry) => void;
  capture?: (error: Error, context: MutationCaptureContext) => void;
  release?: () => string | undefined;
};

const DEFAULT_METHOD = "POST";
const REQUEST_ID_HEADER = "x-dydata-request-id";

function createServerRequestId() {
  return crypto.randomUUID();
}

function resolveOutcome(status: number): MutationOutcome {
  if (status >= 500) return "failed";
  if (status >= 400) return "rejected";
  return "success";
}

function appendRequestIdHeader(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildStageDetail(stages: MutationStage[], outcome: MutationOutcome, release?: string) {
  const stage = stages.at(-1);
  const compensationOccurred = stages.includes("compensate");
  const primaryStage = compensationOccurred
    ? [...stages].reverse().find((item) => item !== "compensate")
    : stage;

  return {
    ...(stage ? { stage } : {}),
    ...(primaryStage ? { primaryStage } : {}),
    stages,
    compensationOccurred,
    outcome,
    ...(release ? { release } : {}),
  };
}

function safeCall(call: () => void) {
  try {
    call();
  } catch {
    // 观测链路不能改变业务响应或异常语义。
  }
}

export async function observeMutation(
  route: MutationRoute,
  handler: (observation: MutationObservation) => Promise<Response>,
  deps: ObserveMutationDeps = {},
) {
  const requestId = deps.createRequestId?.() ?? createServerRequestId();
  const startedAt = deps.now?.() ?? Date.now();
  const stages: MutationStage[] = [];
  const seenStages = new Set<MutationStage>();
  const release = deps.release?.() ?? getSentryRelease();
  const log = deps.log ?? logApiRequest;
  const capture = deps.capture ?? captureMutationError;

  const observation: MutationObservation = {
    requestId,
    mark(stage) {
      if (seenStages.has(stage)) return;
      seenStages.add(stage);
      stages.push(stage);
    },
  };

  try {
    const response = await handler(observation);
    const outcome = resolveOutcome(response.status);
    const detail = buildStageDetail(stages, outcome, release);
    const durationMs = Math.max(0, (deps.now?.() ?? Date.now()) - startedAt);

    safeCall(() => log({
      requestId,
      route,
      method: DEFAULT_METHOD,
      status: response.status,
      durationMs,
      outcome,
      detail,
    }));

    if (outcome === "failed") {
      safeCall(() => capture(new Error("mutation_failed"), {
        requestId,
        route,
        stage: detail.primaryStage,
        outcome,
      }));
    }

    return appendRequestIdHeader(response, requestId);
  } catch (error) {
    const outcome: MutationOutcome = "thrown";
    const detail = buildStageDetail(stages, outcome, release);
    const durationMs = Math.max(0, (deps.now?.() ?? Date.now()) - startedAt);
    safeCall(() => log({
      requestId,
      route,
      method: DEFAULT_METHOD,
      durationMs,
      outcome,
      detail,
    }));
    throw error;
  }
}
