"use client";

import { ShieldAlert, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepTypeSelectProps {
  value: "violation" | "conversion";
  onChange: (value: "violation" | "conversion") => void;
}

const OPTIONS: Array<{
  key: "violation" | "conversion";
  title: string;
  description: string;
  icon: typeof ShieldAlert;
}> = [
  {
    key: "violation",
    title: "我遭遇了平台处罚",
    description: "记录处罚事实和证据，由管理员判断违规点和应对建议。",
    icon: ShieldAlert,
  },
  {
    key: "conversion",
    title: "我跑出了效果数据",
    description: "把跑出效果的话术交给团队验证，效果数据后续在详情页记录。",
    icon: TrendingUp,
  },
];

export function StepTypeSelect({ value, onChange }: StepTypeSelectProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {OPTIONS.map((option) => {
        const active = value === option.key;
        const Icon = option.icon;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={cn(
              "flex flex-col items-start gap-3 rounded-xl border p-6 text-left transition-all active:translate-y-0",
              active
                ? "border-[#D97757] bg-zinc-50"
                : "border-zinc-200 bg-white hover:border-zinc-300",
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-lg border border-zinc-200 bg-white">
              <Icon className="size-5 stroke-[1.5] text-zinc-600" />
            </span>
            <div>
              <p className="text-[14px] font-medium text-zinc-800">
                {option.title}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-zinc-500">
                {option.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
