"use client";

import Link from "next/link";
import { ArrowRight, Circle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { listItemMotion } from "@/lib/animations";
import { cn } from "@/lib/utils";
import type { ActionItem } from "@/lib/action-center/types";
import {
  getAppealTodoId,
  getTodoActionText,
  getTodoIsCompletable,
} from "@/lib/command-hub/domain/workbench-rules";

export function TodoRow({
  todo,
  index,
  focused,
  processing,
  relativeTime,
  onFocus,
  onComplete,
  onNavigate,
  onReviewAppeal,
}: {
  todo: ActionItem;
  index: number;
  focused: boolean;
  processing: boolean;
  relativeTime: string;
  onFocus?: () => void;
  onComplete: () => void;
  onNavigate: () => void;
  onReviewAppeal?: () => void;
}) {
  // 带跳转链接的普通待办也要能手动完成：缺勤提醒、权限申请等没有业务事件会自动关闭它们。
  const completable = getTodoIsCompletable(todo);
  const actionText = getTodoActionText(todo);
  const isAppeal = Boolean(getAppealTodoId(todo));

  return (
    <motion.div
      {...listItemMotion}
      id={`approval-row-${index}`}
      data-focused={focused || undefined}
      onPointerEnter={onFocus}
      className={cn(
        "flex items-start gap-3 rounded-xl px-4 py-3 transition-colors duration-150",
        focused ? "bg-[#F1F1F0]" : "hover:bg-[#F7F7F6]",
      )}
    >
      {completable ? (
        <button
          type="button"
          onClick={onComplete}
          disabled={processing}
          aria-label={`完成待办：${todo.title}`}
          title="标记完成"
          className="mt-0.5 shrink-0 cursor-pointer text-[#78716C] transition-colors hover:text-[#141413] disabled:cursor-wait"
        >
          {processing ? <Loader2 className="size-4 animate-spin" /> : <Circle className="size-4" />}
        </button>
      ) : (
        <span className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 items-baseline gap-2 text-[14px] leading-[1.4] text-[#141413]">
            {todo.priority === "P0" && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-[#1F1E1D]">
                <span className="size-1.5 rounded-full bg-status-danger" />
                紧急
              </span>
            )}
            <span className="break-words">{todo.title}</span>
          </span>
          <span className="shrink-0 text-[12px] tabular-nums text-[#78716C]">{relativeTime}</span>
        </div>
        {todo.description && <p className="mt-1 text-[12px] leading-[1.5] text-[#78716C]">{todo.description}</p>}
      </div>

      {actionText && (
        isAppeal ? (
          <button
            type="button"
            onClick={onReviewAppeal}
            className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[14px] text-[#1F1E1D] transition-colors hover:bg-[#EBEBE9]"
          >
            {actionText}
            <ArrowRight className="size-3.5 text-[#78716C]" />
          </button>
        ) : (
          <Link
            href={todo.actionUrl || "/"}
            onClick={onNavigate}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[14px] text-[#1F1E1D] transition-colors hover:bg-[#EBEBE9]"
          >
            {actionText}
            <ArrowRight className="size-3.5 text-[#78716C]" />
          </Link>
        )
      )}
    </motion.div>
  );
}
