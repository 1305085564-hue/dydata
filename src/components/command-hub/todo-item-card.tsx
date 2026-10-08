"use client";

import { ArrowRight, Circle, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ItemHeading } from "@/components/ui/item-heading";
import type { ActionItem } from "@/lib/action-center/types";

export interface TodoItemCardProps {
  todo: ActionItem;
  isProcessing: boolean;
  onToggleTodo?: (todo: ActionItem) => void;
  relativeTime?: (iso: string) => string;
  onMarkRead?: (todoId: string) => void;
  onOpenChange?: (open: boolean) => void;
}

export function TodoItemCard({
  todo,
  isProcessing,
  onToggleTodo,
  relativeTime = (iso) => iso,
  onMarkRead,
  onOpenChange,
}: TodoItemCardProps) {
  const isCritical = todo.priority === "P0";
  const isWarning = todo.priority === "P1";
  const canMarkDone = todo.source !== "exemption";

  return (
    <Card className="p-4 sm:p-4.5 flex flex-row items-start gap-3 transition-all group">
      {canMarkDone ? (
        <button
          type="button"
          onClick={() => void onToggleTodo?.(todo)}
          disabled={isProcessing}
          aria-label={`完成待办：${todo.title}`}
          className="mt-0.5 shrink-0 text-[#78716C] hover:text-[#D97757] transition-colors cursor-pointer"
        >
          {isProcessing ? (
            <Loader2 className="size-4 animate-spin text-[#D97757]" />
          ) : (
            <Circle className="size-4 stroke-[1.8]" />
          )}
        </button>
      ) : (
        <div className="mt-0.5 size-4 text-status-warning shrink-0">
          <TriangleAlert className="size-4" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[12px] font-normal tracking-wide",
              isCritical
                ? "bg-status-danger/10 text-status-danger"
                : isWarning
                  ? "bg-status-warning/10 text-status-warning"
                  : "bg-[#F1F1F0] text-[#78716C]",
            )}
          >
            {isCritical ? "P0 紧急" : isWarning ? "P1 待跟进" : "P2 常规"}
          </span>
          <span className="text-[12px] text-[#78716C] tabular-nums">
            {relativeTime(todo.createdAt)}
          </span>
        </div>

        <ItemHeading as="h4" className="mt-1">
          {todo.title}
        </ItemHeading>
        {todo.description && (
          <p className="text-[12px] text-[#78716C] mt-0.5 leading-relaxed">
            {todo.description}
          </p>
        )}

        {todo.actionUrl && (
          <div className="mt-2.5 flex justify-end opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
            <Link
              href={todo.actionUrl}
              onClick={() => {
                if (todo.source !== "exemption") onMarkRead?.(todo.id);
                onOpenChange?.(false);
              }}
              className="inline-flex h-6.5 items-center gap-1 rounded-md bg-[#F1F1F0] hover:bg-[#EBEBE9] px-2.5 text-[12px] font-normal text-[#1F1E1D] transition-colors"
            >
              <span>{todo.actionLabel}</span>
              <ArrowRight className="size-3 text-[#78716C]" />
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
