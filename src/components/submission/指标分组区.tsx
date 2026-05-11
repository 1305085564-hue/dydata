"use client";

import { useRef, useCallback } from "react";
import { motion } from "framer-motion";

import { itemVariants } from "@/lib/animations";
import { cn } from "@/lib/utils";
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

// Tab 顺序：播放量 → 涨粉数 → 导粉数 → 点赞数 → 评论数 → 分享数 → 收藏数 → 均播时长 → 2s跳出率 → 5s完播率 → 整体完播率
const TAB_ORDER: EditableMetricKey[] = [
  "play_count",
  "follower_gain",
  "follower_convert",
  "likes",
  "comments",
  "shares",
  "favorites",
  "avg_play_duration",
  "bounce_rate_2s",
  "completion_rate_5s",
  "completion_rate",
];

export function MetricGroupSection({ fields, onFieldChange, onFocusField, onBlurField, anomalyStatus }: MetricGroupProps) {
  const retentionOptional = anomalyStatus === "限流" || anomalyStatus === "删稿";
  const inputRefs = useRef<Record<EditableMetricKey, HTMLInputElement | null>>({
    play_count: null,
    follower_gain: null,
    follower_convert: null,
    likes: null,
    comments: null,
    shares: null,
    favorites: null,
    avg_play_duration: null,
    bounce_rate_2s: null,
    completion_rate_5s: null,
    completion_rate: null,
  });

  const setRef = useCallback((key: EditableMetricKey) => (el: HTMLInputElement | null) => {
    inputRefs.current[key] = el;
  }, []);

  const focusNext = useCallback((currentKey: EditableMetricKey) => {
    const idx = TAB_ORDER.indexOf(currentKey);
    if (idx >= 0 && idx < TAB_ORDER.length - 1) {
      const nextKey = TAB_ORDER[idx + 1];
      inputRefs.current[nextKey]?.focus();
    }
  }, []);

  const focusPrev = useCallback((currentKey: EditableMetricKey) => {
    const idx = TAB_ORDER.indexOf(currentKey);
    if (idx > 0) {
      const prevKey = TAB_ORDER[idx - 1];
      inputRefs.current[prevKey]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((key: EditableMetricKey) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      focusNext(key);
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      focusPrev(key);
    }
  }, [focusNext, focusPrev]);

  const allItems = [...CORE_ITEMS, ...INTERACTION_ITEMS, ...RETENTION_ITEMS];

  return (
    <motion.div variants={itemVariants} className="flex h-full flex-col space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-[13px] font-semibold tracking-tight text-zinc-800">指标录入</h3>
          <p className="text-[12px] leading-[1.7] text-zinc-500">
            填写核心业务数据、互动数据和留存转化数据。
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-8">
        {/* 核心数据 */}
        <div className="relative pl-4">
          <div className="absolute left-0 top-[5%] bottom-[5%] w-[2px] rounded-full bg-[#D97757]/70" />
          <div className="mb-4">
            <h3 className="text-[13px] font-medium text-zinc-800">核心数据</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
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
                inputRef={{ current: inputRefs.current[item.key] } as React.RefObject<HTMLInputElement>}
                onKeyDown={handleKeyDown(item.key)}
              />
            ))}
          </div>
        </div>

        {/* 互动数据 */}
        <div className="relative pl-4">
          <div className="absolute left-0 top-[5%] bottom-[5%] w-[2px] rounded-full bg-sky-400/70" />
          <div className="mb-4">
            <h3 className="text-[13px] font-medium text-zinc-800">互动数据</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
                inputRef={{ current: inputRefs.current[item.key] } as React.RefObject<HTMLInputElement>}
                onKeyDown={handleKeyDown(item.key)}
              />
            ))}
          </div>
        </div>

        {/* 完播留存 */}
        <div className={cn("relative pl-4", retentionOptional && "opacity-50")}>
          <div className="absolute left-0 top-[5%] bottom-[5%] w-[2px] rounded-full bg-emerald-400/70" />
          <div className="mb-4">
            <h3 className="text-[13px] font-medium text-zinc-800">
              完播留存{retentionOptional && <span className="ml-1 font-normal text-zinc-500">（可选）</span>}
            </h3>
          </div>
          <div className={cn("grid grid-cols-2 gap-4 md:grid-cols-4", retentionOptional && "opacity-50")}>
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
                inputRef={{ current: inputRefs.current[item.key] } as React.RefObject<HTMLInputElement>}
                onKeyDown={handleKeyDown(item.key)}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export { MetricGroupSection as 指标分组区 };
