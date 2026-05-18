"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type NetworkState = "online" | "offline" | "recovered";

export function NetworkStatusBar() {
  const [state, setState] = useState<NetworkState>(
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online",
  );
  const [visible, setVisible] = useState(
    typeof navigator !== "undefined" && !navigator.onLine,
  );

  useEffect(() => {
    const handleOffline = () => {
      setState("offline");
      setVisible(true);
    };

    const handleOnline = () => {
      setState("recovered");
      // 保持显示 2 秒后自动消失
      const timer = setTimeout(() => {
        setVisible(false);
        // 动画结束后重置状态
        setTimeout(() => setState("online"), 300);
      }, 2000);
      return () => clearTimeout(timer);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // 首次加载时如果已离线，立即显示
    if (!navigator.onLine) {
      setState("offline");
      setVisible(true);
    }

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
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
