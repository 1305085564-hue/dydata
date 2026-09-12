/**
 * Sentry 事件的最小化白名单。宁可少传排查信息，也不能把员工或业务内容传出站。
 * 该文件不依赖 Node API，浏览器、Node 与 Edge 三端共用。
 */

const SAFE_EVENT_FIELDS = [
  "event_id",
  "timestamp",
  "level",
  "platform",
  "logger",
  "release",
  "dist",
  "environment",
] as const;

const SAFE_TAGS = new Set(["dydata.boundary"]);

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as UnknownRecord;
}

function safeString(value: unknown, maxLength = 512): string | undefined {
  return typeof value === "string" ? value.slice(0, maxLength) : undefined;
}

function stripQueryAndFragment(value: unknown): string | undefined {
  const input = safeString(value, 2_048);
  if (!input) return undefined;
  const boundary = input.search(/[?#]/);
  return boundary === -1 ? input : input.slice(0, boundary);
}

function sanitizeFrames(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  return value.map((frame) => {
    const source = asRecord(frame);
    const sanitized: UnknownRecord = {};
    const filename = stripQueryAndFragment(source?.filename ?? source?.abs_path);
    const functionName = safeString(source?.function, 256);

    if (filename) sanitized.filename = filename;
    if (functionName) sanitized.function = functionName;
    if (typeof source?.lineno === "number") sanitized.lineno = source.lineno;
    if (typeof source?.colno === "number") sanitized.colno = source.colno;
    if (typeof source?.in_app === "boolean") sanitized.in_app = source.in_app;

    // 特别不保留 frame.vars：它可能包含密码、请求体或业务正文。
    return sanitized;
  });
}

function sanitizeException(value: unknown): UnknownRecord | undefined {
  const exception = asRecord(value);
  if (!exception || !Array.isArray(exception.values)) return undefined;

  const values = exception.values.map((rawValue) => {
    const source = asRecord(rawValue);
    const sanitized: UnknownRecord = {};
    const type = safeString(source?.type, 128);
    const mechanism = asRecord(source?.mechanism);
    const frames = sanitizeFrames(asRecord(source?.stacktrace)?.frames);

    if (type) sanitized.type = type;
    if (frames) sanitized.stacktrace = { frames };
    if (typeof mechanism?.handled === "boolean" || safeString(mechanism?.type, 128)) {
      sanitized.mechanism = {
        ...(typeof mechanism?.handled === "boolean" ? { handled: mechanism.handled } : {}),
        ...(safeString(mechanism?.type, 128) ? { type: safeString(mechanism?.type, 128) } : {}),
      };
    }

    // 特别不保留 exception.value / mechanism.data：错误文本可能直接含用户输入。
    return sanitized;
  });

  return { values };
}

/**
 * 以白名单重建事件。request 只保留去掉查询参数的 URL，transaction 只保留
 * 去掉查询参数的路由；其余请求详情、用户、业务正文和设备信息全部丢弃。
 */
export function sanitizeSentryEvent<T extends object>(event: T): T {
  const source = event as UnknownRecord;
  const sanitized: UnknownRecord = {};

  for (const field of SAFE_EVENT_FIELDS) {
    if (source[field] !== undefined) sanitized[field] = source[field];
  }

  const requestUrl = stripQueryAndFragment(asRecord(source.request)?.url);
  if (requestUrl) sanitized.request = { url: requestUrl };

  const transaction = stripQueryAndFragment(source.transaction);
  if (transaction) sanitized.transaction = transaction;

  const safeTags = asRecord(source.tags);
  if (safeTags) {
    const tags = Object.fromEntries(
      Object.entries(safeTags).filter(([key, value]) => SAFE_TAGS.has(key) && typeof value === "string"),
    );
    if (Object.keys(tags).length > 0) sanitized.tags = tags;
  }

  const exception = sanitizeException(source.exception);
  if (exception) sanitized.exception = exception;

  return sanitized as T;
}

/** 不保留请求、点击、console 等面包屑，避免用户行为与参数出站。 */
export function dropSentryBreadcrumb(): null {
  return null;
}

export const sentryPrivacyOptions = {
  sendDefaultPii: false,
  tracesSampleRate: 0,
  enableLogs: false,
  beforeSend: sanitizeSentryEvent,
  beforeBreadcrumb: dropSentryBreadcrumb,
} as const;

export const sentryClientPrivacyOptions = {
  ...sentryPrivacyOptions,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
} as const;

export function getSentryEnvironment() {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.SENTRY_ENVIRONMENT ??
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV
  );
}

export function getSentryRelease() {
  return process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA;
}
