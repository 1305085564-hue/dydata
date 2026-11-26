"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { parseCachedScreenshotGrant, shouldRenewGrant } from "@/lib/screenshot-grant-client";

const SCREENSHOT_GRANT_SESSION_KEY = "dydata:screenshot-grant";
const FALLBACK_WAIT_FOR_USER_MS = 1_500;

type GrantState = {
  ready: boolean;
  exp: number | null;
  mode: "fast" | "slow";
  reason?: string;
};

type GrantContextValue = GrantState & {
  syncUserId: (userId: string) => void;
};

const ScreenshotGrantContext = createContext<GrantContextValue>({
  ready: true,
  exp: null,
  mode: "slow",
  syncUserId: () => undefined,
});

function readSessionGrant(userId: string) {
  try {
    return parseCachedScreenshotGrant(window.sessionStorage.getItem(SCREENSHOT_GRANT_SESSION_KEY), userId);
  } catch {
    return null;
  }
}

function writeSessionGrant(userId: string, exp: number) {
  try {
    window.sessionStorage.setItem(
      SCREENSHOT_GRANT_SESSION_KEY,
      JSON.stringify({ userId, exp, mode: "fast" }),
    );
  } catch {
    // 隐私模式或存储受限时降级为仅内存态，不影响正常截图展示。
  }
}

function removeSessionGrant() {
  try {
    window.sessionStorage.removeItem(SCREENSHOT_GRANT_SESSION_KEY);
  } catch {
    // 忽略存储受限异常
  }
}

export function ScreenshotGrantProvider({
  children,
  userId: initialUserId,
}: {
  children: React.ReactNode;
  userId?: string | null;
}) {
  const [state, setState] = useState<GrantState>({ ready: false, exp: null, mode: "slow" });
  const [syncedUserId, setSyncedUserId] = useState<string | null>(initialUserId ?? null);
  const activeUserId = initialUserId ?? syncedUserId;

  const syncUserId = useCallback((nextUserId: string) => {
    if (!nextUserId) return;
    setSyncedUserId((prev) => (prev === nextUserId ? prev : nextUserId));
  }, []);

  const requestGrant = useCallback(async (expectedUserId: string | null) => {
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
      const body = await response.json() as { exp?: number | null; mode?: "fast" | "slow"; reason?: string; userId?: string };
      if (body.mode === "slow") {
        setState({ ready: true, exp: null, mode: "slow", reason: body.reason });
        return null;
      }
      if (!body.exp) throw new Error("grant_missing_exp");
      if (expectedUserId && body.userId && body.userId !== expectedUserId) {
        removeSessionGrant();
        throw new Error("grant_user_mismatch");
      }
      const cacheUserId = body.userId ?? expectedUserId;
      if (cacheUserId) writeSessionGrant(cacheUserId, body.exp);
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
    let renewTimer: ReturnType<typeof setTimeout> | undefined;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let active = true;

    const schedule = (exp: number | null, userIdForRenew: string | null) => {
      if (!active || !exp) return;
      const delay = Math.max(1_000, (exp - Math.floor(Date.now() / 1000) - 5 * 60) * 1000);
      renewTimer = setTimeout(() => {
        if (active && shouldRenewGrant(exp)) {
          void requestGrant(userIdForRenew).then((nextExp) => schedule(nextExp, userIdForRenew));
        }
      }, delay);
    };

    if (activeUserId) {
      const cached = readSessionGrant(activeUserId);
      if (cached && !shouldRenewGrant(cached.exp)) {
        queueMicrotask(() => {
          if (!active) return;
          setState({ ready: true, exp: cached.exp, mode: "fast" });
        });
        schedule(cached.exp, activeUserId);
      } else {
        removeSessionGrant();
        void requestGrant(activeUserId).then((nextExp) => schedule(nextExp, activeUserId));
      }
    } else {
      // 等待 NavBar 流式注水回传当前 userId；若页面无导航栏则兜底发起一次签发，不阻塞截图加载。
      fallbackTimer = setTimeout(() => {
        if (!active) return;
        void requestGrant(null).then((nextExp) => schedule(nextExp, null));
      }, FALLBACK_WAIT_FOR_USER_MS);
    }

    return () => {
      active = false;
      if (renewTimer) clearTimeout(renewTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [activeUserId, requestGrant]);

  const value = useMemo<GrantContextValue>(() => ({ ...state, syncUserId }), [state, syncUserId]);
  return <ScreenshotGrantContext.Provider value={value}>{children}</ScreenshotGrantContext.Provider>;
}

export function useScreenshotGrant() {
  return useContext(ScreenshotGrantContext);
}

export function useSyncScreenshotGrantUser(userId: string | null | undefined) {
  const { syncUserId } = useContext(ScreenshotGrantContext);
  useEffect(() => {
    if (userId) syncUserId(userId);
  }, [syncUserId, userId]);
}

export async function clearScreenshotGrant() {
  if (typeof window !== "undefined") removeSessionGrant();
  await fetch("/api/submission-screenshots/grant", {
    method: "DELETE",
    credentials: "include",
    cache: "no-store",
  }).catch(() => undefined);
}
