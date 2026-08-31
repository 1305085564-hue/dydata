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
      title="成长轨迹暂时未能展开"
      description="历史数据同步稍有延迟，请检查网络连接后重新尝试。"
      reset={reset}
    />
  );
}
