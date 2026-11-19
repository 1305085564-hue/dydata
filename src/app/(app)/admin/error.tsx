"use client";

import { useEffect } from "react";

import { RouteErrorState } from "@/components/ui/route-error-state";
import { captureRouteError } from "@/lib/sentry/capture-route-error";

interface AdminErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: AdminErrorProps) {
  useEffect(() => {
    console.error("[admin] route error", error);
    captureRouteError(error, "admin");
  }, [error]);

  return (
    <RouteErrorState
      title="管理后台加载失败"
      description="再试一次通常就好；还不行就刷新整个页面。"
      reset={reset}
    />
  );
}
