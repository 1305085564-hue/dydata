"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { trackUsageEvent } from "@/lib/usage-events/client";
import { isTrackedUsagePath, normalizeUsagePath } from "@/lib/usage-events/shared";

export function PageViewTracker() {
  const pathname = usePathname();
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;

    const normalizedPath = normalizeUsagePath(pathname);
    if (!isTrackedUsagePath(normalizedPath)) return;
    if (lastTrackedPathRef.current === normalizedPath) return;

    lastTrackedPathRef.current = normalizedPath;
    trackUsageEvent({
      path: normalizedPath,
      eventType: "page_view",
    });
  }, [pathname]);

  return null;
}
