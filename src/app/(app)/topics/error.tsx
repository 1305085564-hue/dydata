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
      description="刚才加载时碰到了点问题，再试一次通常就好了。"
      reset={reset}
    />
  );
}
