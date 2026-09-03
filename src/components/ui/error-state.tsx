"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DraftRecalibrateIllustration } from "@/components/editorial/editorial-illustrations";

interface ErrorStateProps {
  title?: string;
  description?: string;
  className?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "暂时未能连通",
  description = "内容同步稍有延迟，正在为你保留当前手稿，不妨稍作歇息后重试",
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
        "flex flex-col items-center justify-center gap-2 rounded-2xl bg-white px-6 py-10 text-center shadow-card-ring",
        className
      )}
    >
      <div className="-mt-2 -mb-1">
        <DraftRecalibrateIllustration size={80} />
      </div>
      <div className="space-y-1.5 max-w-sm">
        <h3 className="text-base font-medium text-[#1C1917]">
          {title}
        </h3>
        {description && (
          <p className="text-[12.5px] leading-[1.65] text-[#78716C]">{description}</p>
        )}
      </div>
      <Button
        variant="secondary"
        size="s"
        className="mt-3 h-7 rounded-md border border-[#ECE7DE] bg-[#F5F3EE] text-[12px] font-medium text-[#292524] hover:bg-[#ECE7DE] active:scale-[0.99] active:duration-120"
        onClick={handleRetry}
      >
        重新对齐同步
      </Button>
    </div>
  );
}
