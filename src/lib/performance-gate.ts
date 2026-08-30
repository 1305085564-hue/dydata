export const PERFORMANCE_ROUTE_BUDGETS = {
  "/topics": {
    firstPaintMs: 2_500,
    completeMs: 4_000,
    requestLimit: 20,
    apiMs: 800,
    forbiddenRequestPrefixes: ["/api/topics/"],
  },
  "/dashboard": {
    firstPaintMs: 2_000,
    completeMs: 3_000,
    requestLimit: 15,
    apiMs: 600,
    forbiddenRequestPrefixes: [],
  },
  "/admin/content": {
    firstPaintMs: 2_500,
    completeMs: 5_000,
    requestLimit: 20,
    apiMs: 1_200,
    forbiddenRequestPrefixes: [],
  },
  "/admin/collaboration": {
    firstPaintMs: 2_500,
    completeMs: 4_000,
    requestLimit: 20,
    apiMs: 800,
    forbiddenRequestPrefixes: [],
  },
} as const;

export type PerformanceRoute = keyof typeof PERFORMANCE_ROUTE_BUDGETS;

export type PerformanceRequestRecord = {
  method: string;
  pathname: string;
  signature: string;
  status: number | null;
  durationMs: number | null;
};

export type PerformanceRunInput = {
  route: PerformanceRoute;
  firstPaintMs: number | null;
  completeMs: number;
  requests: PerformanceRequestRecord[];
  consoleErrors: string[];
};

type PerformanceIssueCode =
  | "HTTP_ERROR"
  | "REQUEST_FAILED"
  | "CONSOLE_ERROR"
  | "REQUEST_LIMIT"
  | "DUPLICATE_REQUEST"
  | "FORBIDDEN_REQUEST"
  | "FIRST_PAINT_BUDGET"
  | "COMPLETE_BUDGET"
  | "API_BUDGET";

export type PerformanceIssue = {
  code: PerformanceIssueCode;
  message: string;
};

export type PerformanceRunResult = {
  route: PerformanceRoute;
  passed: boolean;
  failures: PerformanceIssue[];
  warnings: PerformanceIssue[];
  metrics: {
    firstPaintMs: number | null;
    completeMs: number;
    requestCount: number;
    slowestApiMs: number | null;
  };
};

export function evaluatePerformanceRun(
  input: PerformanceRunInput,
  options: { enforceTiming?: boolean } = {},
): PerformanceRunResult {
  const budget = PERFORMANCE_ROUTE_BUDGETS[input.route];
  const failures: PerformanceIssue[] = [];
  const warnings: PerformanceIssue[] = [];

  for (const request of input.requests) {
    if (request.status === null) {
      failures.push({
        code: "REQUEST_FAILED",
        message: `${request.method} ${request.pathname} 没有取得响应`,
      });
    } else if (request.status >= 400) {
      failures.push({
        code: "HTTP_ERROR",
        message: `${request.method} ${request.pathname} 返回 HTTP ${request.status}`,
      });
    }
  }

  for (const message of input.consoleErrors) {
    failures.push({ code: "CONSOLE_ERROR", message: `浏览器控制台错误：${message}` });
  }

  if (input.requests.length > budget.requestLimit) {
    failures.push({
      code: "REQUEST_LIMIT",
      message: `首屏业务请求 ${input.requests.length} 个，超过预算 ${budget.requestLimit} 个`,
    });
  }

  const signatureCounts = new Map<string, number>();
  for (const request of input.requests) {
    signatureCounts.set(request.signature, (signatureCounts.get(request.signature) ?? 0) + 1);
  }
  for (const [signature, count] of signatureCounts) {
    if (count > 1) {
      const request = input.requests.find((item) => item.signature === signature);
      failures.push({
        code: "DUPLICATE_REQUEST",
        message: `${request?.method ?? "请求"} ${request?.pathname ?? "未知接口"} 重复 ${count} 次`,
      });
    }
  }

  for (const request of input.requests) {
    if (budget.forbiddenRequestPrefixes.some((prefix) => request.pathname.startsWith(prefix))) {
      failures.push({
        code: "FORBIDDEN_REQUEST",
        message: `${input.route} 首屏不应提前请求 ${request.pathname}`,
      });
    }
  }

  const timingIssues: PerformanceIssue[] = [];
  if (input.firstPaintMs !== null && input.firstPaintMs > budget.firstPaintMs) {
    timingIssues.push({
      code: "FIRST_PAINT_BUDGET",
      message: `首屏绘制 ${input.firstPaintMs}ms，超过预算 ${budget.firstPaintMs}ms`,
    });
  }
  if (input.completeMs > budget.completeMs) {
    timingIssues.push({
      code: "COMPLETE_BUDGET",
      message: `完整加载 ${input.completeMs}ms，超过预算 ${budget.completeMs}ms`,
    });
  }

  const slowestApiMs = input.requests.reduce<number | null>((slowest, request) => {
    if (request.durationMs === null) return slowest;
    return slowest === null ? request.durationMs : Math.max(slowest, request.durationMs);
  }, null);
  if (slowestApiMs !== null && slowestApiMs > budget.apiMs) {
    timingIssues.push({
      code: "API_BUDGET",
      message: `最慢业务接口 ${slowestApiMs}ms，超过预算 ${budget.apiMs}ms`,
    });
  }

  if (options.enforceTiming) failures.push(...timingIssues);
  else warnings.push(...timingIssues);

  return {
    route: input.route,
    passed: failures.length === 0,
    failures,
    warnings,
    metrics: {
      firstPaintMs: input.firstPaintMs,
      completeMs: input.completeMs,
      requestCount: input.requests.length,
      slowestApiMs,
    },
  };
}
