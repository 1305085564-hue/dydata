"use client";

import { useRef, useState, useCallback, forwardRef, useImperativeHandle, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { itemVariants } from "@/lib/animations";
import { ScreenshotImage } from "@/components/screenshot/screenshot-image";
import type { EditableMetricKey, SubmissionSlotRole } from "@/components/submission/提交状态机";
import { getSlotRoleForMetric } from "@/lib/video-submit/domain/form-rules";
import { 指标输入卡 } from "@/components/submission/指标输入卡";
import {
  isInteractionExceedingPlayCount,
  type ConfidenceLevel,
  type EditableFieldState,
} from "@/components/submission/填报表单状态";

import {
  getNextMetricFocusTarget,
  getPrevMetricFocusTarget,
} from "@/components/submission/metric-focus-flow";

export type MetricGroupHandle = {
  focusMetric: (key: EditableMetricKey) => void;
};

interface MetricGroupProps {
  fields: Record<string, EditableFieldState>;
  confidenceLevels?: Partial<Record<EditableMetricKey, ConfidenceLevel>>;
  onFieldChange: (key: EditableMetricKey, value: string) => void;
  onRestoreOcrValue?: (key: EditableMetricKey) => void;
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

export const MetricGroupSection = forwardRef<MetricGroupHandle, MetricGroupProps>(
  function MetricGroupSection(
    {
      fields,
      confidenceLevels,
      onFieldChange,
      onRestoreOcrValue,
      onFocusField,
      onBlurField,
      anomalyStatus,
      onCompleteMetrics,
    },
    ref,
  ) {
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

    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      return () => {
        if (highlightTimerRef.current) {
          clearTimeout(highlightTimerRef.current);
        }
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        focusMetric: (key: EditableMetricKey) => {
          const el = inputRefs.current[key];
          if (!el) return;
          el.focus();
          const highlightClasses = ["ring-2", "ring-[#D97757]/60", "ring-offset-1"];
          el.classList.add(...highlightClasses);
          if (highlightTimerRef.current) {
            clearTimeout(highlightTimerRef.current);
          }
          highlightTimerRef.current = setTimeout(() => {
            el.classList.remove(...highlightClasses);
            highlightTimerRef.current = null;
          }, 1500);
        },
      }),
      [],
    );

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

    const [magnifier, setMagnifier] = useState<{
      active: boolean;
      role: SubmissionSlotRole | null;
      imgUrl: string | null;
      position: { top: number; left: number };
    }>({
      active: false,
      role: null,
      imgUrl: null,
      position: { top: 0, left: 0 },
    });

    useEffect(() => {
      const handleScroll = () => {
        setMagnifier((prev) => (prev.active ? { ...prev, active: false } : prev));
      };
      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => {
        window.removeEventListener("scroll", handleScroll);
      };
    }, []);

    const handleFocus = useCallback(
      (key: EditableMetricKey) => {
        onFocusField?.(key);
        if (typeof window === "undefined" || window.innerWidth < 640) return;

        const role = getSlotRoleForMetric(key);
        const imgEl = document.querySelector<HTMLImageElement>(
          `img[data-submission-slot-role="${role}"]`,
        );
        const imgUrl = imgEl?.getAttribute("data-slot-asset-url") || imgEl?.src || null;

        if (imgUrl && inputRefs.current[key]) {
          const rect = inputRefs.current[key]!.getBoundingClientRect();
          const left = rect.left >= 236 ? rect.left - 228 : rect.right + 8;
          const top = Math.max(16, Math.min(window.innerHeight - 236, rect.top - 20));
          setMagnifier({
            active: true,
            role,
            imgUrl,
            position: { top, left },
          });
        } else {
          setMagnifier((prev) => (prev.active ? { ...prev, active: false } : prev));
        }
      },
      [onFocusField],
    );

    const handleBlur = useCallback(
      (key: EditableMetricKey) => {
        onBlurField?.(key);
        setMagnifier((prev) => (prev.active ? { ...prev, active: false } : prev));
      },
      [onBlurField],
    );

    const handleFieldChange = useCallback(
      (key: EditableMetricKey, value: string) => {
        setMagnifier((prev) => (prev.active ? { ...prev, active: false } : prev));
        onFieldChange(key, value);
      },
      [onFieldChange],
    );

    const { exceeded: showInteractionWarning } = isInteractionExceedingPlayCount({
      play_count: fields.play_count?.value ?? null,
      likes: fields.likes?.value ?? null,
      comments: fields.comments?.value ?? null,
      shares: fields.shares?.value ?? null,
      favorites: fields.favorites?.value ?? null,
    });

    return (
      <motion.div variants={itemVariants} className="flex h-full flex-col lg:space-y-2">
        {/* 数据矩阵：核心3项 + 互动4项 + 完播4项 */}
        <div className="flex flex-1 flex-col gap-2 sm:gap-3">
          
          {/* 1. 核心数据网格 (移动端两列，桌面端3列) */}
          <div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-2 lg:gap-3">
              {CORE_ITEMS.map((item, index) => (
                <指标输入卡
                  key={item.key}
                  label={item.label}
                  field={fields[item.key]}
                  confidenceLevel={fields[item.key]?.confidenceLevel ?? confidenceLevels?.[item.key] ?? null}
                  step={item.step}
                  suffix={item.suffix}
                  optional={item.optional}
                  metricType={item.metricType}
                  onChange={(value) => handleFieldChange(item.key, value)}
                  onRestoreOcr={
                    onRestoreOcrValue ? () => onRestoreOcrValue(item.key) : undefined
                  }
                  onFocus={() => handleFocus(item.key)}
                  onBlur={() => handleBlur(item.key)}
                  animationDelay={index * 120}
                  inputRef={setRef(item.key)}
                  onKeyDown={handleKeyDown(item.key)}
                />
              ))}
            </div>
          </div>

          {/* 2. 互动数据网格 (移动端两列，桌面端4列) */}
          <div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 sm:gap-2 lg:gap-3">
              {INTERACTION_ITEMS.map((item, index) => (
                <指标输入卡
                  key={item.key}
                  label={item.label}
                  field={fields[item.key]}
                  confidenceLevel={fields[item.key]?.confidenceLevel ?? confidenceLevels?.[item.key] ?? null}
                  metricType={item.metricType}
                  onChange={(value) => handleFieldChange(item.key, value)}
                  onRestoreOcr={
                    onRestoreOcrValue ? () => onRestoreOcrValue(item.key) : undefined
                  }
                  onFocus={() => handleFocus(item.key)}
                  onBlur={() => handleBlur(item.key)}
                  animationDelay={(CORE_ITEMS.length + index) * 120}
                  inputRef={setRef(item.key)}
                  onKeyDown={handleKeyDown(item.key)}
                />
              ))}
            </div>
            {showInteractionWarning && (
              <div className="mt-1 pl-0.5 text-[12px] font-normal text-status-warning transition-opacity duration-150">
                互动数据总和超过了播放量，请核对一遍
              </div>
            )}
          </div>

          {/* 3. 完播留存网格 (移动端两列，桌面端4列) */}
          <div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 sm:gap-2 lg:gap-3">
              {RETENTION_ITEMS.map((item, index) => (
                <指标输入卡
                  key={item.key}
                  label={item.label}
                  field={fields[item.key]}
                  confidenceLevel={fields[item.key]?.confidenceLevel ?? confidenceLevels?.[item.key] ?? null}
                  step={item.step}
                  suffix={item.suffix}
                  optional={retentionOptional}
                  metricType={item.metricType}
                  onChange={(value) => handleFieldChange(item.key, value)}
                  onRestoreOcr={
                    onRestoreOcrValue ? () => onRestoreOcrValue(item.key) : undefined
                  }
                  onFocus={() => handleFocus(item.key)}
                  onBlur={() => handleBlur(item.key)}
                  animationDelay={index * 120}
                  inputRef={setRef(item.key)}
                  onKeyDown={handleKeyDown(item.key)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 跟随放大镜（桌面端指标核对浮动预览） */}
        <AnimatePresence>
          {magnifier.active && magnifier.imgUrl && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{
                position: "fixed",
                top: magnifier.position.top,
                left: magnifier.position.left,
              }}
              className="pointer-events-none z-30 flex size-[220px] flex-col overflow-hidden rounded-lg border border-[#E5E5E0] bg-white p-1.5 shadow-lg"
            >
              <div className="relative flex-1 w-full overflow-hidden rounded bg-[#F7F7F5] flex items-center justify-center">
                <ScreenshotImage
                  src={magnifier.imgUrl}
                  alt="截图核对参考"
                  variant="panel"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="pt-1 flex items-center justify-between text-[12px] text-[#78716C] px-0.5">
                <span>截图核对</span>
                <span className="font-mono text-[12px] text-[#A8A29E]">
                  {magnifier.role === "screenshot_1" ? "基础数据" : "完播留存"}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  },
);

export { MetricGroupSection as 指标分组区 };
