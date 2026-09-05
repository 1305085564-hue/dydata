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

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 z-[60] flex h-8 items-center justify-center gap-2 border border-[#ECE7DE] bg-white/92 px-4 text-[13px] text-[#292524] backdrop-blur-md shadow-2xs transition-all duration-200",
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isOffline ? "bg-[#C0685C] animate-pulse" : "bg-[#6FAA7D]",
        )}
      />
      <span className="font-medium text-[#1C1917]">
        {isOffline ? "网络已断开" : "网络已恢复"}
      </span>
      {isOffline && (
        <span className="text-[#78716C]">· 部分功能可能暂不可用</span>
      )}
    </div>
  );
}
