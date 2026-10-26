"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { shouldRenewGrant } from "@/lib/screenshot-grant-client";

type GrantState = {
  ready: boolean;
  exp: number | null;
  mode: "fast" | "slow";
  reason?: string;
};

const ScreenshotGrantContext = createContext<GrantState>({
  ready: true,
  exp: null,
  mode: "slow",
});

export function ScreenshotGrantProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GrantState>({ ready: false, exp: null, mode: "slow" });

  const requestGrant = useCallback(async () => {
    try {
      const response = await fetch("/api/submission-screenshots/grant", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        const reason = body.error ?? `grant_http_${response.status}`;
        console.info("[screenshot-grant]", JSON.stringify({ event: reason === "grant_oversize" ? "grant_oversize" : "grant_slow_fallback", reason }));
        setState({ ready: true, exp: null, mode: "slow", reason });
        return null;
      }
      const body = await response.json() as { exp?: number | null; mode?: "fast" | "slow"; reason?: string };
      if (body.mode === "slow") {
        setState({ ready: true, exp: null, mode: "slow", reason: body.reason });
        return null;
      }
      if (!body.exp) throw new Error("grant_missing_exp");
      setState({ ready: true, exp: body.exp, mode: "fast" });
      return body.exp;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "grant_request_failed";
      console.info("[screenshot-grant]", JSON.stringify({ event: "grant_slow_fallback", reason }));
      setState({ ready: true, exp: null, mode: "slow", reason });
      return null;
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const schedule = (exp: number | null) => {
      if (!active) return;
      if (!exp) return;
      const delay = Math.max(1_000, (exp - Math.floor(Date.now() / 1000) - 5 * 60) * 1000);
      timer = setTimeout(() => {
        if (active && shouldRenewGrant(exp)) void requestGrant().then(schedule);
      }, delay);
    };
    void requestGrant().then(schedule);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [requestGrant]);

  const value = useMemo(() => state, [state]);
  return <ScreenshotGrantContext.Provider value={value}>{children}</ScreenshotGrantContext.Provider>;
}

export function useScreenshotGrant() {
  return useContext(ScreenshotGrantContext);
}

export async function clearScreenshotGrant() {
  await fetch("/api/submission-screenshots/grant", {
    method: "DELETE",
    credentials: "include",
    cache: "no-store",
  }).catch(() => undefined);
}
