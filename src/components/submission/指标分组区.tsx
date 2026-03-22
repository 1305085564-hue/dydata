"use client";

import { motion } from "framer-motion";

import { MotionCard } from "@/components/ui/motion-card";
import { containerVariants, itemVariants } from "@/lib/animations";
import type { SubmissionFieldState } from "@/components/submission/提交状态机";
import { 指标输入卡 } from "@/components/submission/指标输入卡";

type EditableMetricKey =
  | "play_count"
  | "follower_gain"
  | "follower_convert"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "avg_play_duration"
  | "bounce_rate_2s"
  | "completion_rate_5s"
  | "completion_rate";

type MetricItem = {
  key: EditableMetricKey;
  label: string;
  step?: string;
  suffix?: string;
};

interface MetricGroupProps {
  fields: Record<string, SubmissionFieldState>;
  onFieldChange: (key: EditableMetricKey, value: string) => void;
}

const GROUPS: Array<{ title: string; items: MetricItem[] }> = [
  {
    title: "核心数据",
    items: [
      { key: "play_count", label: "播放量", step: "0.01", suffix: "万" },
      { key: "follower_gain", label: "涨粉数" },
      { key: "follower_convert", label: "导粉数" },
    ],
  },
  {
    title: "互动数据",
    items: [
      { key: "likes", label: "点赞数" },
      { key: "comments", label: "评论数" },
      { key: "shares", label: "分享数" },
      { key: "favorites", label: "收藏数" },
    ],
  },
  {
    title: "完播留存",
    items: [
      { key: "avg_play_duration", label: "均播时长", step: "0.1", suffix: "秒" },
      { key: "bounce_rate_2s", label: "2s跳出率", step: "0.01", suffix: "%" },
      { key: "completion_rate_5s", label: "5s完播率", step: "0.01", suffix: "%" },
      { key: "completion_rate", label: "整体完播率", step: "0.01", suffix: "%" },
    ],
  },
] as const;

export function 指标分组区({ fields, onFieldChange }: MetricGroupProps) {
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
      {GROUPS.map((group, index) => (
        <motion.div key={group.title} variants={itemVariants}>
          <MotionCard index={index} className="border-none bg-white/70">
            <div className="space-y-4 p-4">
              <div>
                <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                  {group.title}
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {group.items.map((item) => (
                  <指标输入卡
                    key={item.key}
                    label={item.label}
                    field={fields[item.key]}
                    step={item.step}
                    suffix={item.suffix}
                    onChange={(value) => onFieldChange(item.key, value)}
                  />
                ))}
              </div>
            </div>
          </MotionCard>
        </motion.div>
      ))}
    </motion.div>
  );
}
