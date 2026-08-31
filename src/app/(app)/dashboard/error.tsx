"use client";

import { useEffect } from "react";

import { RouteErrorState } from "@/components/ui/route-error-state";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("[dashboard] route error", error);
  }, [error]);

  return (
    <RouteErrorState
      title="工作台暂时未能展开"
      description="卷宗同步稍有延迟，手稿已在本地妥帖保留，不妨稍作歇息后再试。"
      reset={reset}
    />
  );
}
