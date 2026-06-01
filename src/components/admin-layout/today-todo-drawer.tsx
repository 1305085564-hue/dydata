"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const AiAlertPanel = dynamic(
  () => import("@/app/(app)/admin/components/ai-alert-panel").then((mod) => mod.AiAlertPanel),
  { ssr: false },
);

const AdminQueueSection = dynamic(
  () => import("@/app/(app)/admin/components/admin-cockpit").then((mod) => mod.AdminQueueSection),
  { ssr: false },
);

interface TodayTodoDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TodayTodoDrawer({ open, onOpenChange }: TodayTodoDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previous;
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        onClick={() => onOpenChange(false)}
        className={cn(
          "absolute inset-0 bg-zinc-950/20 transition-opacity duration-200 ease-out",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="今日待办"
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-zinc-200 bg-[#FAFAFB] shadow-[-12px_0_32px_-12px_rgba(0,0,0,0.08)]",
          "transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5 py-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">Today</div>
            <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-zinc-800">今日待办</h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="关闭"
            className="inline-flex size-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition-[color,background-color,border-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 active:translate-y-0"
          >
            <X className="size-4 stroke-[1.5]" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="space-y-8">
            <AiAlertPanel initialData={null} initialUpdatedAt={null} />
            <AdminQueueSection date={today} />
          </div>
        </div>
      </aside>
    </div>
  );
}
