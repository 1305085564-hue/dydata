"use client";

import { useEffect } from "react";

import { RouteErrorState } from "@/components/ui/route-error-state";
import { captureRouteError } from "@/lib/sentry/capture-route-error";

interface FulfillmentErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function FulfillmentError({ error, reset }: FulfillmentErrorProps) {
  useEffect(() => {
    console.error("[admin/fulfillment] route error", error);
    captureRouteError(error, "admin-fulfillment");
  }, [error]);

  return (
    <RouteErrorState
      title="发布管理加载失败"
      description="再试一次通常就好；还不行就刷新整个页面。"
      reset={reset}
    />
  );
}
