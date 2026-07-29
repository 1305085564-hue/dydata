"use client";

import { useEffect } from "react";

import { RouteErrorState } from "@/components/ui/route-error-state";

interface ViolationsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ViolationsError({ error, reset }: ViolationsErrorProps) {
  useEffect(() => {
    console.error("[violations] route error", error);
  }, [error]);

  return (
    <RouteErrorState
      title="避坑案例加载失败"
      description="暂时无法取得避坑案例内容，请检查网络后重试。"
      reset={reset}
    />
  );
}
