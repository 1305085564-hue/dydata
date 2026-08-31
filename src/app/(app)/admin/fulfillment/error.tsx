"use client";

import { useEffect } from "react";

import { RouteErrorState } from "@/components/ui/route-error-state";

interface FulfillmentErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function FulfillmentError({ error, reset }: FulfillmentErrorProps) {
  useEffect(() => {
    console.error("[admin/fulfillment] route error", error);
  }, [error]);

  return (
    <RouteErrorState
      title="履约总览暂时未能展开"
      description="发布与履约数据同步稍有延迟，请检查网络连接后重新尝试。"
      reset={reset}
    />
  );
}
