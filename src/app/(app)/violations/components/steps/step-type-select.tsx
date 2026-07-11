"use client";

import { motion } from "framer-motion";
import { ShieldAlert, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepTypeSelectProps {
  value: "violation" | "conversion" | null;
  onPick: (value: "violation" | "conversion") => void;
}

const OPTIONS: Array<{
  key: "violation" | "conversion";
  title: string;
  description: string;
  icon: typeof ShieldAlert;
  accent: string;
  accentSoft: string;
}> = [
  {
    key: "violation",
    title: "我遭遇了平台处罚",
    description: "记录处罚事实和证据，由管理员判断违规点和应对建议。",
    icon: ShieldAlert,
    accent: "#C9604D",
    accentSoft: "#C9604D14",
  },
  {
    key: "conversion",
    title: "我跑出了效果数据",
    description: "把跑出效果的话术交给团队验证，效果数据后续在详情页记录。",
    icon: TrendingUp,
    accent: "#6FAA7D",
    accentSoft: "#6FAA7D14",
  },
];

export function StepTypeSelect({ value, onPick }: StepTypeSelectProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
          起步
        </p>
        <h2 className="text-[18px] font-medium leading-tight text-stone-900">
          先告诉我们这一条的来由
        </h2>
        <p className="text-[12px] leading-[1.7] text-stone-500">
          点击对应卡片，下一步会自动展开。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const active = value === option.key;
          const Icon = option.icon;
          return (
            <motion.button
              key={option.key}
              type="button"
              onClick={() => onPick(option.key)}
              initial={false}
              animate={
                active
                  ? { scale: 1.01, y: -1 }
                  : { scale: 1, y: 0 }
              }
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.99 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className={cn(
                "group relative flex flex-col items-start gap-3 overflow-hidden rounded-xl border bg-white p-5 text-left",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300",
                active
                  ? "border-stone-300 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.12)]"
                  : "border-stone-200 hover:border-stone-300",
              )}
              style={
                active
                  ? { backgroundColor: option.accentSoft }
                  : undefined
              }
            >
              {active ? (
                <motion.span
                  layoutId="type-accent"
                  className="absolute inset-y-3 left-0 w-[2px] rounded-r-full"
                  style={{ backgroundColor: option.accent }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                />
              ) : null}
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg border bg-white transition-colors",
                  active ? "border-stone-200" : "border-stone-200",
                )}
                style={
                  active
                    ? { color: option.accent, borderColor: `${option.accent}55` }
                    : undefined
                }
              >
                <Icon
                  className="size-[18px] stroke-[1.5]"
                  style={!active ? { color: "#78716C" } : undefined}
                />
              </span>
              <div>
                <p className="text-[13px] font-medium text-stone-900">
                  {option.title}
                </p>
                <p className="mt-1 text-[12px] leading-[1.7] text-stone-500">
                  {option.description}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>

      <p className="text-[12px] text-stone-500">
        点错了？再点另一张卡片即可切换。
      </p>
    </div>
  );
}
