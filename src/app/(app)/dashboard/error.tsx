"use client";

import { useEffect } from "react";

import { RouteErrorState } from "@/components/ui/route-error-state";
import { captureRouteError } from "@/lib/sentry/capture-route-error";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("[dashboard] route error", error);
    captureRouteError(error, "dashboard");
  }, [error]);

  return (
    <RouteErrorState
      title="工作台加载失败"
      description="你的草稿还在，再试一次通常就好。"
      reset={reset}
    />
  );
}
