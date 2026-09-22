"use client";

import { useRef, useCallback } from "react";
import { motion } from "framer-motion";

import { itemVariants } from "@/lib/animations";
import type { EditableMetricKey, SubmissionFieldState } from "@/components/submission/提交状态机";
import { 指标输入卡 } from "@/components/submission/指标输入卡";

import {
  getNextMetricFocusTarget,
  getPrevMetricFocusTarget,
} from "@/components/submission/metric-focus-flow";

interface MetricGroupProps {
  fields: Record<string, SubmissionFieldState>;
  onFieldChange: (key: EditableMetricKey, value: string) => void;
  onFocusField?: (key: EditableMetricKey) => void;
  onBlurField?: (key: EditableMetricKey) => void;
  anomalyStatus?: string;
  onCompleteMetrics?: () => void;
}

import {
  METRIC_INPUT_TYPE_BY_FIELD,
  type MetricInputType,
} from "@/lib/dashboard-logic/metric-input-cleaner";

type MetricItem = {
  key: EditableMetricKey;
  label: string;
  step?: string;
  suffix?: string;
  optional?: boolean;
  metricType?: MetricInputType;
};

const CORE_ITEMS: MetricItem[] = [
  { key: "play_count", label: "播放量", step: "1", metricType: METRIC_INPUT_TYPE_BY_FIELD.play_count },
  { key: "follower_gain", label: "涨粉数", step: "1", metricType: METRIC_INPUT_TYPE_BY_FIELD.follower_gain },
  { key: "follower_convert", label: "导粉数", step: "1", optional: true, metricType: METRIC_INPUT_TYPE_BY_FIELD.follower_convert },
];

const INTERACTION_ITEMS: MetricItem[] = [
  { key: "likes", label: "点赞数", step: "1", metricType: METRIC_INPUT_TYPE_BY_FIELD.likes },
  { key: "comments", label: "评论数", step: "1", metricType: METRIC_INPUT_TYPE_BY_FIELD.comments },
  { key: "shares", label: "分享数", step: "1", metricType: METRIC_INPUT_TYPE_BY_FIELD.shares },
  { key: "favorites", label: "收藏数", step: "1", metricType: METRIC_INPUT_TYPE_BY_FIELD.favorites },
];

const RETENTION_ITEMS: MetricItem[] = [
  { key: "avg_play_duration", label: "均播时长", step: "0.1", suffix: "秒", metricType: METRIC_INPUT_TYPE_BY_FIELD.avg_play_duration },
  { key: "bounce_rate_2s", label: "2s跳出率", step: "0.01", suffix: "%", metricType: METRIC_INPUT_TYPE_BY_FIELD.bounce_rate_2s },
  { key: "completion_rate_5s", label: "5s完播率", step: "0.01", suffix: "%", metricType: METRIC_INPUT_TYPE_BY_FIELD.completion_rate_5s },
  { key: "completion_rate", label: "整体完播率", step: "0.01", suffix: "%", metricType: METRIC_INPUT_TYPE_BY_FIELD.completion_rate },
];

export function MetricGroupSection({
  fields,
  onFieldChange,
  onFocusField,
  onBlurField,
  anomalyStatus,
  onCompleteMetrics,
}: MetricGroupProps) {
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

  const handleKeyDown = useCallback(
    (key: EditableMetricKey) => (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const next = getNextMetricFocusTarget(key);
        if (next === "video_title") {
          onCompleteMetrics?.();
        } else if (next && next !== "content") {
          inputRefs.current[next]?.focus();
        }
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        const prev = getPrevMetricFocusTarget(key);
        if (prev) {
          inputRefs.current[prev]?.focus();
        }
      }
    },
    [onCompleteMetrics],
  );

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
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-3">
            {CORE_ITEMS.map((item, index) => (
              <指标输入卡
                key={item.key}
                label={item.label}
                field={fields[item.key]}
                step={item.step}
                suffix={item.suffix}
                optional={item.optional}
                metricType={item.metricType}
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
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-3">
            {INTERACTION_ITEMS.map((item, index) => (
              <指标输入卡
                key={item.key}
                label={item.label}
                field={fields[item.key]}
                metricType={item.metricType}
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
            <div className="mt-1 pl-0.5 text-[11px] sm:text-[12px] lg:mt-1.5 font-medium text-[#B98A54] transition-opacity duration-150">
              互动数据总和超过了播放量，请核对一遍
            </div>
          )}
        </div>

        {/* 3. 完播留存网格 (4列始终平铺展开) */}
        <div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-3">
            {RETENTION_ITEMS.map((item, index) => (
              <指标输入卡
                key={item.key}
                label={item.label}
                field={fields[item.key]}
                step={item.step}
                suffix={item.suffix}
                optional={retentionOptional}
                metricType={item.metricType}
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
