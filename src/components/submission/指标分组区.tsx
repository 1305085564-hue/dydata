"use client";

import { motion } from "framer-motion";

import { MotionCard } from "@/components/ui/motion-card";
import { itemVariants } from "@/lib/animations";
import type { EditableMetricKey, SubmissionFieldState } from "@/components/submission/提交状态机";
import { 指标输入卡 } from "@/components/submission/指标输入卡";

interface MetricGroupProps {
  fields: Record<string, SubmissionFieldState>;
  onFieldChange: (key: EditableMetricKey, value: string) => void;
  anomalyStatus?: string;
}

type MetricItem = { key: EditableMetricKey; label: string; step?: string; suffix?: string; optional?: boolean };

const CORE_ITEMS: MetricItem[] = [
  { key: "play_count", label: "播放量", step: "0.01" },
  { key: "follower_gain", label: "涨粉数" },
  { key: "follower_convert", label: "导粉数", optional: true },
];

const INTERACTION_ITEMS: MetricItem[] = [
  { key: "likes", label: "点赞数" },
  { key: "comments", label: "评论数" },
  { key: "shares", label: "分享数" },
  { key: "favorites", label: "收藏数" },
];

const RETENTION_ITEMS: MetricItem[] = [
  { key: "avg_play_duration", label: "均播时长", step: "0.1", suffix: "秒" },
  { key: "bounce_rate_2s", label: "2s跳出率", step: "0.01", suffix: "%" },
  { key: "completion_rate_5s", label: "5s完播率", step: "0.01", suffix: "%" },
  { key: "completion_rate", label: "整体完播率", step: "0.01", suffix: "%" },
];

const DIVIDER = <div className="my-2 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />;

export function 指标分组区({ fields, onFieldChange, anomalyStatus }: MetricGroupProps) {
  const retentionOptional = anomalyStatus === "限流" || anomalyStatus === "删稿";

  return (
    <motion.div variants={itemVariants}>
      <MotionCard index={0} className="border-none bg-white/70">
        <div className="space-y-0 p-4">
          <div className="mb-4">
            <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">指标录入</h3>
            
          </div>

          <div className="mb-1">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">核心数据</p>
            <div className="grid grid-cols-3 gap-3">
              {CORE_ITEMS.map((item) => (
                <指标输入卡
                  key={item.key}
                  label={item.label}
                  field={fields[item.key]}
                  step={item.step}
                  suffix={item.suffix}
                  size="primary"
                  optional={item.optional}
                  onChange={(value) => onFieldChange(item.key, value)}
                />
              ))}
            </div>
          </div>

          {DIVIDER}

          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">互动数据</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {INTERACTION_ITEMS.map((item) => (
                <指标输入卡
                  key={item.key}
                  label={item.label}
                  field={fields[item.key]}
                  size="secondary"
                  onChange={(value) => onFieldChange(item.key, value)}
                />
              ))}
            </div>
          </div>

          {DIVIDER}

          <div className={retentionOptional ? "opacity-50" : ""}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              完播留存{retentionOptional && <span className="ml-1 normal-case">（可选）</span>}
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {RETENTION_ITEMS.map((item) => (
                <指标输入卡
                  key={item.key}
                  label={item.label}
                  field={fields[item.key]}
                  step={item.step}
                  suffix={item.suffix}
                  size="secondary"
                  optional={retentionOptional}
                  onChange={(value) => onFieldChange(item.key, value)}
                />
              ))}
            </div>
          </div>
        </div>
      </MotionCard>
    </motion.div>
  );
}
