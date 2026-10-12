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
      title="履约总览暂时未能展开"
      description="刚才加载时碰到了点问题，再试一次通常就好了。"
      reset={reset}
    />
  );
}
