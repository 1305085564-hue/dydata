"use client";

import { useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
  const [isRetentionExpanded, setIsRetentionExpanded] = useState(!retentionOptional);
  const [prevOptional, setPrevOptional] = useState(retentionOptional);

  // 同步重置折叠状态：当异常状态变化时自动切换折叠表现
  if (retentionOptional !== prevOptional) {
    setPrevOptional(retentionOptional);
    setIsRetentionExpanded(!retentionOptional);
  }

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
    <motion.div variants={itemVariants} className="flex h-full flex-col space-y-4">
      {/* 彻底去除最上方的“指标录入”标题和描述段落，直接平铺核心和互动数据 */}
      <div className="flex flex-1 flex-col gap-6">
        
        {/* 1. 核心数据网格 (移除标题占行) */}
        <div className="relative pl-3.5">
          <div className="absolute left-0 top-[5%] bottom-[5%] w-[2px] rounded-full bg-[#D97757]/70" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
                animationDelay={index * 120}
                inputRef={setRef(item.key)}
                onKeyDown={handleKeyDown(item.key)}
              />
            ))}
          </div>
        </div>

        {/* 2. 互动数据网格 (移除标题占行，警告提示改为底部紧凑漂浮) */}
        <div className="relative pl-3.5">
          <div className="absolute left-0 top-[5%] bottom-[5%] w-[2px] rounded-full bg-[#D99E55]/70" />
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
                animationDelay={(CORE_ITEMS.length + index) * 120}
                inputRef={setRef(item.key)}
                onKeyDown={handleKeyDown(item.key)}
              />
            ))}
          </div>
          {showInteractionWarning && (
            <div className="mt-2 pl-1 text-[12px] font-medium text-[#D99E55] transition-opacity duration-150">
              ⚠️ 互动数据总和已超过播放量，请核对输入
            </div>
          )}
        </div>

        {/* 3. 完播留存网格 (支持异常状态折叠，且完全移除标题及说明占行) */}
        <div className="relative pl-3.5">
          <div
            className={cn(
              "absolute left-0 top-[5%] bottom-[5%] w-[2px] rounded-full transition-colors duration-150",
              retentionOptional ? "bg-stone-200" : "bg-[#6FAA7D]/70"
            )}
          />
          
          {/* 折叠触发条：仅在异常状态且未展开时显示 */}
          {retentionOptional && !isRetentionExpanded && (
            <button
              type="button"
              onClick={() => setIsRetentionExpanded(true)}
              className="flex items-center gap-1.5 py-1 text-[12px] font-medium text-stone-500 hover:text-[#D97757] transition-colors focus:outline-none"
            >
              <span>[+] 展开完播留存指标录入 (可选)</span>
            </button>
          )}

          {/* 完播内容呈现区 */}
          {isRetentionExpanded && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
                    animationDelay={index * 120}
                    inputRef={setRef(item.key)}
                    onKeyDown={handleKeyDown(item.key)}
                  />
                ))}
              </div>
              
              {/* 收起按钮：仅在异常状态已展开时可见 */}
              {retentionOptional && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsRetentionExpanded(false)}
                    className="text-[12px] font-medium text-stone-500 hover:text-stone-700 transition-colors focus:outline-none"
                  >
                    [-] 收起完播指标
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export { MetricGroupSection as 指标分组区 };
