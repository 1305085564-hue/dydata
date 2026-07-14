"use client";

import { parseUsageEventPayload, type UsageEventPayload } from "./shared";

const USAGE_EVENTS_ENDPOINT = "/api/usage-events";

export function trackUsageEvent(payload: UsageEventPayload) {
  const parsed = parseUsageEventPayload(payload);
  if (!parsed.ok) return;

  const body = JSON.stringify(parsed.data);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(USAGE_EVENTS_ENDPOINT, blob)) {
        return;
      }
    }
  } catch {
    // 忽略 beacon 异常，继续走 fetch 兜底。
  }

  void fetch(USAGE_EVENTS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "include",
    cache: "no-store",
  }).catch(() => {});
}
