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
      title="工作台内容未能加载"
      description="刚才加载时碰到了点问题，你的草稿还在，再试一次通常就好了。"
      reset={reset}
    />
  );
}
