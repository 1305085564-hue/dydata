"use client";

import { useEffect } from "react";

import { RouteErrorState } from "@/components/ui/route-error-state";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("[dashboard] route error", error);
  }, [error]);

  return (
    <RouteErrorState
      title="数据台加载失败"
      description="暂时无法取得数据台内容，请检查网络后重试。"
      reset={reset}
    />
  );
}
