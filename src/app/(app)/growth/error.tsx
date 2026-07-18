"use client";

import { useEffect } from "react";

import { RouteErrorState } from "@/components/ui/route-error-state";

interface GrowthErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GrowthError({ error, reset }: GrowthErrorProps) {
  useEffect(() => {
    console.error("[growth] route error", error);
  }, [error]);

  return (
    <RouteErrorState
      title="成长数据加载失败"
      description="暂时无法取得成长数据，请检查网络后重试。"
      reset={reset}
    />
  );
}
