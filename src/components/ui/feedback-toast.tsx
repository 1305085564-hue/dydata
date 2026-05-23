"use client";

import { useState } from "react";
import { toast, type ExternalToast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedbackOptions extends ExternalToast {
  description?: string;
  details?: string;
}

function DetailToast({
  message,
  description,
  details,
}: {
  message: string;
  description?: string;
  details?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = details && details.trim().length > 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium">{message}</div>
      {description && (
        <div className="text-sm opacity-90">{description}</div>
      )}
      {hasDetails && (
        <div className="mt-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-0.5 text-[12px] opacity-80 transition-opacity hover:opacity-100"
          >
            {expanded ? (
              <>
                收起详情 <ChevronUp className="size-3" />
              </>
            ) : (
              <>
                查看详情 <ChevronDown className="size-3" />
              </>
            )}
          </button>
          <div
            className={cn(
              "overflow-hidden text-[12px] opacity-80 transition-[background-color,color,border-color,transform,box-shadow] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
              expanded ? "mt-1.5 max-h-[300px]" : "max-h-0",
            )}
          >
            <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/10 p-2">
              {details}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function buildToastContent(
  message: string,
  options: FeedbackOptions | undefined,
  type: "success" | "error" | "warning" | "loading",
) {
  const { details, description, ...rest } = options ?? {};

  // 开发环境下，error toast 自动附加堆栈
  let finalDetails = details;
  if (
    type === "error" &&
    !finalDetails &&
    process.env.NODE_ENV === "development"
  ) {
    const stack = new Error().stack;
    if (stack) {
      finalDetails = stack;
    }
  }

  const hasDetails = finalDetails && finalDetails.trim().length > 0;

  // 只有存在 details 时，才用 DetailToast 包装；否则保持原有行为
  if (hasDetails) {
    return {
      ...rest,
      description: (
        <DetailToast
          message={message}
          description={description}
          details={finalDetails}
        />
      ),
    };
  }

  return { ...rest, description };
}

function success(message: string, options?: FeedbackOptions) {
  const toastOptions = buildToastContent(message, options, "success");
  return toast.success(message, toastOptions);
}

function error(message: string, options?: FeedbackOptions) {
  const toastOptions = buildToastContent(message, options, "error");
  return toast.error(message, toastOptions);
}

function warning(message: string, options?: FeedbackOptions) {
  const toastOptions = buildToastContent(message, options, "warning");
  return toast.warning(message, toastOptions);
}

function loading(message: string, options?: FeedbackOptions) {
  const toastOptions = buildToastContent(message, options, "loading");
  return toast.loading(message, toastOptions);
}

function dismiss(toastId?: string | number) {
  return toast.dismiss(toastId);
}

export const feedbackToast = {
  success,
  error,
  warning,
  loading,
  dismiss,
};
