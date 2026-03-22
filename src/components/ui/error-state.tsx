"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  className?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "加载失败",
  description = "数据获取失败，请稍后重试",
  className,
  onRetry,
}: ErrorStateProps) {
  const router = useRouter();

  function handleRetry() {
    if (onRetry) {
      onRetry();
    } else {
      router.refresh();
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-red-200/60 bg-red-50/40 px-6 py-10 text-center",
        className
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-red-100/80">
        <AlertCircle className="size-5 text-red-500" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-red-700">{title}</p>
        {description && (
          <p className="text-xs text-red-500/80 leading-relaxed max-w-[240px]">{description}</p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
        onClick={handleRetry}
      >
        重试
      </Button>
    </div>
  );
}
