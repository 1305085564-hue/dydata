"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type NetworkState = "online" | "offline" | "recovered";

export function NetworkStatusBar() {
  const [state, setState] = useState<NetworkState>(
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online",
  );
  const [visible, setVisible] = useState(
    typeof navigator !== "undefined" && !navigator.onLine,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handleOffline = () => {
      clearTimer();
      setState("offline");
      setVisible(true);
    };

    const handleOnline = () => {
      clearTimer();
      setState("recovered");
      timerRef.current = setTimeout(() => {
        setVisible(false);
        timerRef.current = setTimeout(() => setState("online"), 300);
      }, 2000);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    if (!navigator.onLine) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("offline");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
    }

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearTimer();
    };
  }, []);

  if (!visible) return null;

  const isOffline = state === "offline";
  const bgColor = isOffline ? "bg-[#C9604D]" : "bg-[#6FAA7D]";
  const text = isOffline ? "网络已断开，部分功能可能不可用" : "网络已恢复";

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 z-50 flex h-8 items-center justify-center text-[13px] font-medium text-white transition-all duration-300",
        bgColor,
      )}
      role="status"
      aria-live="polite"
    >
      {text}
    </div>
  );
}
