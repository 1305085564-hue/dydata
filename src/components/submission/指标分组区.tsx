"use client";

import { motion } from "framer-motion";

import { itemVariants } from "@/lib/animations";
import type { EditableMetricKey, SubmissionFieldState } from "@/components/submission/提交状态机";
import { 指标输入卡 } from "@/components/submission/指标输入卡";

interface MetricGroupProps {
  fields: Record<string, SubmissionFieldState>;
  onFieldChange: (key: EditableMetricKey, value: string) => void;
  onFocusField?: (key: EditableMetricKey) => void;
  onBlurField?: (key: EditableMetricKey) => void;
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

const DIVIDER = <div className="my-2 h-px bg-zinc-200" />;

export function MetricGroupSection({ fields, onFieldChange, onFocusField, onBlurField, anomalyStatus }: MetricGroupProps) {
  const retentionOptional = anomalyStatus === "限流" || anomalyStatus === "删稿";

  return (
    <motion.div variants={itemVariants} className="flex h-full flex-col space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-black tracking-tight text-zinc-950">指标录入</h3>
          <p className="text-sm text-zinc-500">
            填写核心业务数据、互动数据和留存转化数据。
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400">核心数据</p>
            <div className="grid grid-cols-3 gap-3">
              {CORE_ITEMS.map((item, index) => (
                <指标输入卡
                  key={item.key}
                  label={item.label}
                  field={fields[item.key]}
                  step={item.step}
                  suffix={item.suffix}
                  size="primary"
                  optional={item.optional}
                  onChange={(value) => onFieldChange(item.key, value)}
                  onFocus={onFocusField ? () => onFocusField(item.key) : undefined}
                  onBlur={onBlurField ? () => onBlurField(item.key) : undefined}
                  animationDelay={index * 150}
                />
              ))}
            </div>
          </div>

          {DIVIDER}

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400">互动数据</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {INTERACTION_ITEMS.map((item, index) => (
                <指标输入卡
                  key={item.key}
                  label={item.label}
                  field={fields[item.key]}
                  size="secondary"
                  onChange={(value) => onFieldChange(item.key, value)}
                  onFocus={onFocusField ? () => onFocusField(item.key) : undefined}
                  onBlur={onBlurField ? () => onBlurField(item.key) : undefined}
                  animationDelay={(CORE_ITEMS.length + index) * 150}
                />
              ))}
            </div>
          </div>

          {DIVIDER}

          <div className={retentionOptional ? "rounded-2xl border border-zinc-200 bg-white p-4 opacity-50" : "rounded-2xl border border-zinc-200 bg-white p-4"}>
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400">
              完播留存{retentionOptional && <span className="ml-1 normal-case">（可选）</span>}
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {RETENTION_ITEMS.map((item, index) => (
                <指标输入卡
                  key={item.key}
                  label={item.label}
                  field={fields[item.key]}
                  step={item.step}
                  suffix={item.suffix}
                  size="secondary"
                  optional={retentionOptional}
                  onChange={(value) => onFieldChange(item.key, value)}
                  onFocus={onFocusField ? () => onFocusField(item.key) : undefined}
                  onBlur={onBlurField ? () => onBlurField(item.key) : undefined}
                  animationDelay={index * 150}
                />
              ))}
            </div>
          </div>

        </div>
    </motion.div>
  );
}

export { MetricGroupSection as 指标分组区 };
