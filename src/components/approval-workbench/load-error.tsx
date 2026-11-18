"use client";

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-status-danger-bg px-4 py-2 text-[14px] text-status-danger-text">
      <span className="inline-flex items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-status-danger" />
        {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="h-7 shrink-0 cursor-pointer rounded-md px-3 text-[14px] text-[#1F1E1D] transition-colors hover:bg-[#EBEBE9]"
      >
        重试
      </button>
    </div>
  );
}
