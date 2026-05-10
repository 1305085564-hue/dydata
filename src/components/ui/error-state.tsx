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
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/50 px-6 py-10 text-center",
        className
      )}
    >
      <div className="relative flex size-2 items-center justify-center">
        <span className="absolute inline-flex size-2 rounded-full bg-[#C9604D]" />
        <span className="absolute inline-flex size-3 rounded-full bg-[#C9604D]/15" />
      </div>
      <div className="mt-2 space-y-1">
        <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold tracking-tight text-zinc-800">
          <AlertCircle className="size-4 stroke-[1.5] text-[#C9604D]" />
          {title}
        </p>
        {description && (
          <p className="max-w-[240px] text-[12px] leading-[1.7] text-zinc-400">{description}</p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-1"
        onClick={handleRetry}
      >
        重试
      </Button>
    </div>
  );
}
