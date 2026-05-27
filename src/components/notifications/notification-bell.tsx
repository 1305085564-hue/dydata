"use client";

import { useState } from "react";
import { Bell, Check, CheckCheck, ChevronRight, Inbox } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { NotificationSeverity } from "@/lib/notifications/types";

import {
  isLocalNotification,
  useNotifications,
  type AnyNotificationRow,
} from "./notification-store";

function severityDotClass(severity: NotificationSeverity) {
  switch (severity) {
    case "critical":
      return "bg-[#C9604D]";
    case "warning":
      return "bg-[#D99E55]";
    case "success":
      return "bg-[#6FAA7D]";
    default:
      return "bg-zinc-300";
  }
}

function relativeTime(iso: string) {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function NotificationCard({
  row,
  onRead,
  onDone,
  onClose,
}: {
  row: AnyNotificationRow;
  onRead: (id: string) => void;
  onDone: (id: string, reason?: "done" | "ignored") => void;
  onClose: () => void;
}) {
  const isUnread = row.status === "unread";
  const isTodo = row.category === "todo";
  const isLocal = isLocalNotification(row);
  const handleClick = () => {
    if (isUnread) onRead(row.id);
  };

  return (
    <button
      type="button"
      className="block w-full text-left"
      onClick={handleClick}
    >
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border p-3 transition-colors",
          isUnread
            ? "border-zinc-200 bg-white"
            : "border-zinc-100 bg-zinc-50/60",
        )}
      >
        <span
          className={cn(
            "mt-1 inline-flex h-2 w-2 shrink-0 rounded-full",
            isUnread ? "bg-[#D97757]" : "bg-zinc-300",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 text-[12px] font-medium text-zinc-700">
              <span
                className={cn("inline-block size-1.5 rounded-full", severityDotClass(row.severity))}
                aria-hidden
              />
              {row.category === "todo" ? "待办" : "动态"}
            </span>
            <span className="text-[12px] text-zinc-400">{relativeTime(row.created_at)}</span>
          </div>
          <div
            className={cn(
              "mt-1.5 truncate text-[13px] leading-5",
              isUnread ? "font-medium text-zinc-800" : "text-zinc-600",
            )}
          >
            {row.title}
          </div>
          {row.body ? (
            <div className="mt-0.5 line-clamp-2 text-[12px] leading-[1.6] text-zinc-500">
              {row.body}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!isLocal && row.action_url ? (
              <Link
                href={row.action_url}
                className="active:translate-y-0 inline-flex h-7 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[12px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isUnread) onRead(row.id);
                  onClose();
                }}
              >
                {row.action_label ?? "查看"}
                <ChevronRight className="size-3 stroke-[1.75]" />
              </Link>
            ) : null}
            {isLocal && row.primaryActionLabel ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  row.primaryAction?.();
                  onClose();
                }}
                className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#D97757] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#C96442]"
              >
                {row.primaryActionLabel}
              </button>
            ) : null}
            {isLocal && row.secondaryActionLabel ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  row.secondaryAction?.();
                  onDone(row.id, "ignored");
                }}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[12px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                {row.secondaryActionLabel}
              </button>
            ) : null}
            {!isLocal && isTodo ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDone(row.id, "done");
                }}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-transparent px-2 text-[12px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              >
                <Check className="size-3 stroke-[1.75]" />
                已处理
              </button>
            ) : null}
            {!isLocal && !isTodo ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDone(row.id, "ignored");
                }}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-transparent px-2 text-[12px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
              >
                忽略
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

export function NotificationBell() {
  const { notifications, counts, markRead, markAllRead, markDone } = useNotifications();
  const [open, setOpen] = useState(false);

  const unread = counts.unread;
  const list = notifications;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="relative h-8 px-2.5 sm:px-2.5"
            aria-label={unread > 0 ? `通知，${unread} 条未读` : "通知"}
          />
        }
      >
        <Bell className="size-3.5 stroke-[1.5]" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D97757] px-1 text-[12px] font-medium leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-md sm:w-[420px]">
        <SheetHeader className="flex-row items-center justify-between">
          <SheetTitle>通知</SheetTitle>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-transparent px-2 text-[12px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            >
              <CheckCheck className="size-3 stroke-[1.75]" />
              全部标已读
            </button>
          ) : null}
        </SheetHeader>
        <SheetBody className="space-y-2">
          {list.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center text-zinc-400">
              <Inbox className="size-8 stroke-[1.25]" />
              <div className="text-[13px]">暂无通知</div>
              <div className="text-[12px] text-zinc-300">有待办或动态会出现在这里</div>
            </div>
          ) : (
            list.map((row) => (
              <NotificationCard
                key={row.id}
                row={row}
                onRead={(id) => void markRead(id)}
                onDone={(id, reason) => void markDone(id, reason)}
                onClose={() => setOpen(false)}
              />
            ))
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
