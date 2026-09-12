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
      description="数据同步稍有延迟，本地草稿已妥善保存，请检查网络后重试。"
      reset={reset}
    />
  );
}
