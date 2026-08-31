"use client";

import { useRef, useCallback } from "react";
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
  const retentionOptional = anomalyStatus === "abnormal";

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

  const playCount = Number(fields.play_count?.value || 0);
  const interactions =
    Number(fields.likes?.value || 0) +
    Number(fields.comments?.value || 0) +
    Number(fields.shares?.value || 0) +
    Number(fields.favorites?.value || 0);
  const showInteractionWarning = playCount > 0 && interactions > playCount;

  return (
    <motion.div variants={itemVariants} className="flex h-full flex-col lg:space-y-2">
      {/* 3-4-4 高密度紧密数据矩阵 (整体收拢，行间亲密) */}
      <div className="flex flex-1 flex-col gap-1.5 sm:gap-2 lg:gap-3.5">
        
        {/* 1. 核心数据网格 (4列网格占前3格，与下方严格纵向对齐，不拉宽) */}
        <div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
            {CORE_ITEMS.map((item, index) => (
              <指标输入卡
                key={item.key}
                label={item.label}
                field={fields[item.key]}
                step={item.step}
                suffix={item.suffix}
                optional={item.optional}
                onChange={(value) => onFieldChange(item.key, value)}
                onFocus={onFocusField ? () => onFocusField(item.key) : undefined}
                onBlur={onBlurField ? () => onBlurField(item.key) : undefined}
                animationDelay={index * 120}
                inputRef={setRef(item.key)}
                onKeyDown={handleKeyDown(item.key)}
              />
            ))}
          </div>
        </div>

        {/* 2. 互动数据网格 (4列紧凑排布) */}
        <div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
            {INTERACTION_ITEMS.map((item, index) => (
              <指标输入卡
                key={item.key}
                label={item.label}
                field={fields[item.key]}
                onChange={(value) => onFieldChange(item.key, value)}
                onFocus={onFocusField ? () => onFocusField(item.key) : undefined}
                onBlur={onBlurField ? () => onBlurField(item.key) : undefined}
                animationDelay={(CORE_ITEMS.length + index) * 120}
                inputRef={setRef(item.key)}
                onKeyDown={handleKeyDown(item.key)}
              />
            ))}
          </div>
          {showInteractionWarning && (
            <div className="mt-1 pl-0.5 text-[10.5px] sm:text-[11.5px] lg:mt-1.5 font-medium text-[#B98A54] transition-opacity duration-150">
              互动数据总和超过了播放量，请核对一遍
            </div>
          )}
        </div>

        {/* 3. 完播留存网格 (4列始终平铺展开) */}
        <div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
            {RETENTION_ITEMS.map((item, index) => (
              <指标输入卡
                key={item.key}
                label={item.label}
                field={fields[item.key]}
                step={item.step}
                suffix={item.suffix}
                optional={retentionOptional}
                onChange={(value) => onFieldChange(item.key, value)}
                onFocus={onFocusField ? () => onFocusField(item.key) : undefined}
                onBlur={onBlurField ? () => onBlurField(item.key) : undefined}
                animationDelay={index * 120}
                inputRef={setRef(item.key)}
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
