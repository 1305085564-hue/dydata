"use client";

import { useEffect } from "react";

import { RouteErrorState } from "@/components/ui/route-error-state";

interface AdminErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: AdminErrorProps) {
  useEffect(() => {
    console.error("[admin] route error", error);
  }, [error]);

  return (
    <RouteErrorState
      title="管理后台加载失败"
      description="暂时无法取得管理后台内容，请检查网络后重试。"
      reset={reset}
    />
  );
}
