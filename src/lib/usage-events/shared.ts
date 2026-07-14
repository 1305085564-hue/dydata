const USAGE_EVENT_TYPES = [
  "page_view",
  "submit_daily_report",
  "apply_exemption",
  "submit_work_submission",
  "submit_review_draft",
  "submit_violation_case",
  "review_violation_case",
  "rewrite_generate",
  "mark_fulfillment_status",
] as const;

const TRACKED_PAGE_PREFIXES = [
  "/dashboard",
  "/growth",
  "/violations",
  "/video-review",
  "/content-tools",
  "/admin",
] as const;

const UUID_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

export type UsageEventPayload = {
  path: string;
  eventType: UsageEventType;
};

function normalizePathSegments(pathname: string) {
  const segments = pathname.split("/");
  return segments.map((segment) => (UUID_SEGMENT_PATTERN.test(segment) ? "[id]" : segment)).join("/");
}

export function normalizeUsagePath(input: string) {
  const raw = input.trim();
  if (!raw) return "/";

  const [pathname] = raw.split(/[?#]/, 1);
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const compacted = withLeadingSlash.replace(/\/{2,}/g, "/");
  const trimmedTrailingSlash =
    compacted.length > 1 && compacted.endsWith("/") ? compacted.slice(0, -1) : compacted;

  return normalizePathSegments(trimmedTrailingSlash || "/");
}

export function isUsageEventType(value: string): value is UsageEventType {
  return (USAGE_EVENT_TYPES as readonly string[]).includes(value);
}

export function isTrackedUsagePath(path: string) {
  const normalizedPath = normalizeUsagePath(path);
  return TRACKED_PAGE_PREFIXES.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
}

export function parseUsageEventPayload(input: unknown):
  | { ok: true; data: UsageEventPayload }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "payload 必须是对象" };
  }

  const record = input as Record<string, unknown>;
  const path = typeof record.path === "string" ? normalizeUsagePath(record.path) : "";
  const eventType = typeof record.eventType === "string" ? record.eventType.trim() : "";

  if (!path || path === "/") {
    return { ok: false, error: "path 不合法" };
  }

  if (!isTrackedUsagePath(path)) {
    return { ok: false, error: "path 不在埋点范围内" };
  }

  if (!isUsageEventType(eventType)) {
    return { ok: false, error: "eventType 不支持" };
  }

  return {
    ok: true,
    data: {
      path,
      eventType,
    },
  };
}
