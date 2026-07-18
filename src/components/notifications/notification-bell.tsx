"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useNotifications } from "./notification-store";

const NotificationPanel = dynamic(
  () => import("./notification-panel").then((mod) => mod.NotificationPanel),
  { ssr: false },
);

export function NotificationBell() {
  const { counts, activate } = useNotifications();
  const [open, setOpen] = useState(false);

  const unread = counts.unread;

  useEffect(() => {
    if (!open) return;
    void activate();
  }, [activate, open]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => setOpen(true)}
        className="relative h-8 px-2.5 sm:px-2.5"
        aria-label={unread > 0 ? `通知，${unread} 条未读` : "通知"}
      >
        <Bell className="size-3.5 stroke-[1.5]" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D97757] px-1 text-[12px] font-medium leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Button>
      {open ? <NotificationPanel open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
