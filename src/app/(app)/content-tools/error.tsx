"use client";

import { useEffect } from "react";

import { RouteErrorState } from "@/components/ui/route-error-state";

interface ContentToolsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ContentToolsError({ error, reset }: ContentToolsErrorProps) {
  useEffect(() => {
    console.error("[content-tools] route error", error);
  }, [error]);

  return (
    <RouteErrorState
      title="内容工具加载失败"
      description="暂时无法取得工具所需数据，请检查网络后重试。"
      reset={reset}
    />
  );
}
