"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type NetworkState = "online" | "offline" | "recovered";

export function NetworkStatusBar() {
  const [state, setState] = useState<NetworkState>("online");
  const [visible, setVisible] = useState(false);
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
      setVisible(true);
    }

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearTimer();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      document.documentElement.style.setProperty("--network-bar-offset", "2rem");
    } else {
      document.documentElement.style.setProperty("--network-bar-offset", "0px");
    }
    return () => {
      document.documentElement.style.setProperty("--network-bar-offset", "0px");
    };
  }, [visible]);

  if (!visible) return null;

  const isOffline = state === "offline";
  const text = isOffline ? "网络已断开，部分功能可能受阻" : "网络连接已恢复";

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 z-[60] flex h-8 items-center justify-center gap-2 text-[12.5px] font-medium text-[#292524] bg-[#FBF9F5]/95 backdrop-blur-md border-b border-[#ECE7DE] shadow-claude-float transition-all duration-200",
      )}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex size-2">
        {isOffline && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#C0685C]/40 animate-ping opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            isOffline ? "bg-[#C0685C]" : "bg-[#6FAA7D]"
          )}
        />
      </span>
      <span>{text}</span>
    </div>
  );
}
