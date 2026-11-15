"use client";

import { useRef, useState, useCallback, forwardRef, useImperativeHandle, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { itemVariants } from "@/lib/animations";
import { ScreenshotImage } from "@/components/screenshot/screenshot-image";
import { REQUIRED_METRIC_KEYS, type EditableMetricKey, type SubmissionSlotRole } from "@/components/submission/提交状态机";
import { getSlotRoleForMetric } from "@/lib/video-submit/domain/form-rules";
import { 指标输入卡, resolveMetricCellMode } from "@/components/submission/指标输入卡";
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
  editing?: boolean;
  confidenceLevels?: Partial<Record<EditableMetricKey, ConfidenceLevel>>;
  /** 每张截图是否还在上传/识别：识别中的格子只占位，不画框 */
  slotProcessing: Record<SubmissionSlotRole, boolean>;
  /** 每张截图对应的必填格是否该画成输入框（截图已处理完、转手填、编辑或异常提交） */
  inputsOpen: Record<SubmissionSlotRole, boolean>;
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
  { key: "avg_play_ratio", label: "平均播放占比", step: "0.01", suffix: "%", metricType: METRIC_INPUT_TYPE_BY_FIELD.avg_play_ratio },
  { key: "bounce_rate_2s", label: "2s跳出率", step: "0.01", suffix: "%", metricType: METRIC_INPUT_TYPE_BY_FIELD.bounce_rate_2s },
  { key: "completion_rate_5s", label: "5s完播率", step: "0.01", suffix: "%", metricType: METRIC_INPUT_TYPE_BY_FIELD.completion_rate_5s },
  { key: "completion_rate", label: "整体完播率", step: "0.01", suffix: "%", metricType: METRIC_INPUT_TYPE_BY_FIELD.completion_rate },
];

export const MetricGroupSection = forwardRef<MetricGroupHandle, MetricGroupProps>(
  function MetricGroupSection(
    {
      fields,
      editing = false,
      confidenceLevels,
      slotProcessing,
      inputsOpen,
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
      avg_play_ratio: null,
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
        // 左侧大图悬浮检视窗（pip-inspector）已展开时，不再弹出 220x220 局部放大镜，避免双浮层打架
        if (document.querySelector('[data-testid="pip-inspector"]')) {
          setMagnifier((prev) => (prev.active ? { ...prev, active: false } : prev));
          return;
        }

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

    const items = [
      ...CORE_ITEMS,
      ...INTERACTION_ITEMS,
      ...RETENTION_ITEMS.map((item) => ({ ...item, optional: retentionOptional })),
    ];
    const cells = items.map((item) => {
      const field = fields[item.key];
      const confidenceLevel = field?.confidenceLevel ?? confidenceLevels?.[item.key] ?? null;
      const role = getSlotRoleForMetric(item.key);
      const mode = resolveMetricCellMode({
        field,
        confidenceLevel,
        // 只有状态机认定的必填项才画成「请填」框，和提交按钮的「还差」同一来源
        optional: !REQUIRED_METRIC_KEYS.includes(item.key),
        slotProcessing: slotProcessing[role],
        inputsOpen: editing || inputsOpen[role],
      });
      return { item, field, mode };
    });
    const recognizedCount = cells.filter(({ field }) => Boolean(field?.ocrValue)).length;
    const toCheckCount = cells.filter(({ mode }) => mode === "doubt" || mode === "missing").length;
    const pendingCount = cells.filter(({ mode }) => mode === "pending").length;
    const summaryText = showInteractionWarning
      ? "互动数加起来超过了播放量，请核对一遍"
      : pendingCount > 0
        ? "正在识别截图里的数字…"
        : toCheckCount > 0
          ? `${items.length} 项认出 ${recognizedCount} 项，${toCheckCount} 项请核对`
          : recognizedCount > 0
            ? `${items.length} 项已全部核对`
            : "数字填在下面，点一下就能改";

    return (
      <motion.div variants={itemVariants} className="space-y-2">
        <div className="flex h-5 items-center gap-2 px-2 text-[12px]">
          <span className="text-[#1F1E1D]">识别结果</span>
          <span className={showInteractionWarning || toCheckCount > 0 ? "text-status-warning-text" : "text-[#78716C]"}>
            {summaryText}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          {cells.map(({ item, field, mode }) => (
            <指标输入卡
              key={item.key}
              label={item.label}
              field={field}
              mode={mode}
              suffix={item.suffix}
              optional={item.optional}
              metricType={item.metricType}
              onChange={(value) => handleFieldChange(item.key, value)}
              onRestoreOcr={onRestoreOcrValue ? () => onRestoreOcrValue(item.key) : undefined}
              onFocus={() => handleFocus(item.key)}
              onBlur={() => handleBlur(item.key)}
              inputRef={setRef(item.key)}
              onKeyDown={handleKeyDown(item.key)}
              hint={editing && item.key === "avg_play_ratio" ? "留空＝保持原值，不能清空" : undefined}
            />
          ))}
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
              className="pointer-events-none z-30 flex size-[220px] flex-col overflow-hidden rounded-lg border border-border bg-white p-1.5 shadow-lg"
            >
              <div className="relative flex-1 w-full overflow-hidden rounded bg-surface-row-hover flex items-center justify-center">
                <ScreenshotImage
                  src={magnifier.imgUrl}
                  alt="截图核对参考"
                  variant="panel"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="pt-1 flex items-center justify-between text-[12px] text-[#78716C] px-0.5">
                <span>截图核对</span>
                <span className="font-mono text-[12px] text-[#78716C]">
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
