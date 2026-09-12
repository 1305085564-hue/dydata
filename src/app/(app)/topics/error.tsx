"use client";

import { useEffect } from "react";

import { RouteErrorState } from "@/components/ui/route-error-state";
import { captureRouteError } from "@/lib/sentry/capture-route-error";

interface TopicsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TopicsError({ error, reset }: TopicsErrorProps) {
  useEffect(() => {
    console.error("[topics] route error", error);
    captureRouteError(error, "topics");
  }, [error]);

  return (
    <RouteErrorState
      title="选题库加载失败"
      description="暂时无法取得选题库内容，请检查网络后重试。"
      reset={reset}
    />
  );
}
