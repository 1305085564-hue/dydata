"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface VideoReviewTabsProps {
  isAdmin: boolean;
}

export function VideoReviewTabs({ isAdmin }: VideoReviewTabsProps) {
  const pathname = usePathname();

  const tabs = [
    ...(isAdmin
      ? [{ href: "/video-review", label: "产量看板" }]
      : []),
    { href: "/video-review/submit", label: "提交作品" },
    { href: "/video-review/exemption", label: "申请豁免" },
    { href: "/video-review/archive", label: "已发案例" },
  ];

  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-stone-200/50 p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex items-center justify-center rounded-lg px-4 py-1.5 text-[13px] font-medium transition duration-150 ease-out focus-visible:outline-none",
              active
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-900"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
