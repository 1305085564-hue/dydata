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
      title="发布管理加载失败"
      description="暂时无法取得履约数据，请检查网络后重试。"
      reset={reset}
    />
  );
}
