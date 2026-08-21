"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { UsageTimeline, type UsageRecordItem } from "./usage-timeline";
import { EventList, type EventItem } from "./event-list";

export type DetailTabKey = "usage" | "events" | "tests";

interface DetailTabsProps {
  purpose: string;
  usageRecords: UsageRecordItem[];
  events: EventItem[];
  testsSlot: React.ReactNode;
}

const MOTION_VARIANTS = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

export function DetailTabs({ purpose, usageRecords, events, testsSlot }: DetailTabsProps) {
  const defaultTab: DetailTabKey = purpose === "conversion" ? "usage" : "tests";
  const [active, setActive] = useState<DetailTabKey>(defaultTab);

  const showTests = purpose === "violation";
  const tabs: Array<{ key: DetailTabKey; label: string; count?: number }> = [
    { key: "usage", label: "使用记录", count: usageRecords.length },
    { key: "events", label: "违规事件", count: events.length },
  ];
  if (showTests) tabs.push({ key: "tests", label: "测试记录" });

  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <div
        role="tablist"
        aria-label="详情切换"
        className="flex items-center gap-1.5 px-4 pt-4 pb-2"
      >
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors duration-100",
                isActive
                  ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100",
              )}
            >
              {tab.label}
              {typeof tab.count === "number" ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[12px] font-medium tabular-nums",
                    isActive ? "text-[#D97757]/70" : "text-zinc-400",
                  )}
                >
                  ({tab.count})
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="p-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            variants={MOTION_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {active === "usage" ? <UsageTimeline records={usageRecords} /> : null}
            {active === "events" ? <EventList events={events} /> : null}
            {active === "tests" && showTests ? testsSlot : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
