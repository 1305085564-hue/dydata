"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

export const COPY_FEEDBACK_MS = 2000;

export interface CopyButtonProps {
  text?: string;
  getText?: () => string;
  label?: string;
  copiedLabel?: string;
  errorMessage?: string;
  className?: string;
  iconClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * 全站统一一键复制按钮：点击成功原地切换为小对勾与「已复制」，2 秒后安静复原（不弹成功横幅）。
 */
export function CopyButton({
  text,
  getText,
  label = "复制",
  copiedLabel = "已复制",
  errorMessage = "复制失败，请重试",
  className,
  iconClassName,
  ariaLabel,
  disabled = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const value = getText ? getText() : text;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      setCopied(true);
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, COPY_FEEDBACK_MS);
    } catch {
      feedbackToast.error(errorMessage);
    }
  }, [errorMessage, getText, text]);

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      disabled={disabled}
      aria-label={ariaLabel}
      data-copied={copied ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-md text-[12px] font-normal text-[#78716C] transition-colors hover:text-[#141413] cursor-pointer",
        className,
      )}
    >
      {copied ? (
        <>
          <Check className={cn("size-3.5 text-status-success", iconClassName)} aria-hidden />
          <span className="text-[#1F1E1D]">{copiedLabel}</span>
        </>
      ) : (
        <>
          <Copy className={cn("size-3.5 text-[#78716C]", iconClassName)} aria-hidden />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
