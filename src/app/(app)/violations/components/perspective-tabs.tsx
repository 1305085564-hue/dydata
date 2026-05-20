"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useCallback, useMemo, useTransition } from "react";
import { ShieldAlert, TrendingUp } from "lucide-react";

export type PerspectiveKey = "violation" | "conversion" | "review";

const TABS: Array<{
  key: PerspectiveKey;
  label: string;
  hint: string;
  icon: typeof ShieldAlert;
}> = [
  { key: "violation", label: "话术案例", hint: "风险 · 积累", icon: ShieldAlert },
  { key: "conversion", label: "转化中心", hint: "导粉 · 复用", icon: TrendingUp },
  { key: "review", label: "合规审核", hint: "审核 · 确认", icon: TrendingUp },
];

export function PerspectiveTabs({ active, canManageViolations }: { active: PerspectiveKey; canManageViolations?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleSelect = useCallback(
    (key: PerspectiveKey) => {
      if (key === active) return;
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      next.set("perspective", key);
      // 切换视角时重置上下文无关的筛选项，避免状态错位
      for (const k of ["status", "category", "q", "format", "minUsage", "tab", "sort"]) {
        next.delete(k);
      }
      startTransition(() => {
        router.replace(`/violations?${next.toString()}`);
      });
    },
    [active, router, searchParams],
  );

  const tabs = useMemo(() => {
    if (!canManageViolations) {
      return TABS.filter((t) => t.key !== "review");
    }
    return TABS;
  }, [canManageViolations]);

  return (
    <div className="relative flex w-full items-end gap-1 border-b border-zinc-200">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleSelect(tab.key)}
            aria-pressed={isActive}
            disabled={isPending && isActive}
            className={`group relative flex-1 px-4 pb-3 pt-2 text-left transition-colors sm:flex-none sm:min-w-[180px] ${
              isActive ? "text-zinc-800" : "text-zinc-400 hover:text-zinc-700"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex size-7 items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? tab.key === "violation"
                      ? "bg-[#D97757]/10 text-[#D97757]"
                      : "bg-[#6FAA7D]/10 text-[#6FAA7D]"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200"
                }`}
              >
                <Icon className="size-4" strokeWidth={2.25} />
              </span>
              <div className="leading-tight">
                <div className="text-sm font-semibold">{tab.label}</div>
                <div className="text-[11px] font-medium tracking-wide text-zinc-400">
                  {tab.hint}
                </div>
              </div>
            </div>
            {isActive ? (
              <motion.div
                layoutId="perspective-underline"
                className={`absolute inset-x-3 -bottom-px h-[2px] rounded-full ${
                  tab.key === "violation" ? "bg-[#D97757]" : "bg-[#6FAA7D]"
                }`}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
