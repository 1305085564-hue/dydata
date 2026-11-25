"use client";

import { useRef, useCallback, forwardRef, useImperativeHandle, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Eye } from "lucide-react";

import { itemVariants } from "@/lib/animations";
import { REQUIRED_METRIC_KEYS, type EditableMetricKey, type SubmissionSlotRole } from "@/components/submission/提交状态机";
import { 指标输入卡, resolveMetricCellMode } from "@/components/submission/指标输入卡";
import {
  type ConfidenceLevel,
  type EditableFieldState,
} from "@/components/submission/填报表单状态";
import {
  resolveMetricGroupViewModel,
  type FocusedFieldSnapshot,
  type MetricGroupItem,
} from "@/components/submission/metric-group-state";

import {
  getNextMetricFocusTarget,
  getPrevMetricFocusTarget,
} from "@/components/submission/metric-focus-flow";

export type MetricGroupHandle = {
  focusMetric: (key: EditableMetricKey) => void;
};

export function resolveMetricToCheckCount(
  cells: Array<{ key: EditableMetricKey; mode: ReturnType<typeof resolveMetricCellMode>; value: string }>,
) {
  return cells.filter(({ key, mode, value }) => {
    if (mode === "doubt" || mode === "missing") return true;
    return mode === "blank" && REQUIRED_METRIC_KEYS.includes(key) && !value.trim();
  }).length;
}

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
  onInspectScreenshot?: () => void;
  disabledKeys?: EditableMetricKey[];
}

import {
  METRIC_INPUT_TYPE_BY_FIELD,
} from "@/lib/dashboard-logic/metric-input-cleaner";

type MetricItem = MetricGroupItem;

const CORE_ITEMS: MetricItem[] = [
  { key: "play_count", label: "播放量", step: "1", metricType: METRIC_INPUT_TYPE_BY_FIELD.play_count },
  { key: "follower_gain", label: "涨粉数", step: "1", metricType: METRIC_INPUT_TYPE_BY_FIELD.follower_gain },
  { key: "follower_convert", label: "导粉数", step: "1", optional: true, metricType: METRIC_INPUT_TYPE_BY_FIELD.follower_convert },
  { key: "avg_play_ratio", label: "平均播放占比", step: "0.01", suffix: "%", metricType: METRIC_INPUT_TYPE_BY_FIELD.avg_play_ratio },
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
      onInspectScreenshot,
      disabledKeys = [],
    },
    ref,
  ) {
    const retentionOptional = anomalyStatus === "abnormal";
    const [frozenFocus, setFrozenFocus] = useState<FocusedFieldSnapshot | null>(null);
    const [acknowledgedRuleSignatures, setAcknowledgedRuleSignatures] = useState<
      Partial<Record<EditableMetricKey, string>>
    >({});

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
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus({ preventScroll: true });
          const highlightClasses = ["ring-2", "ring-status-warning", "ring-offset-1"];
          el.classList.add(...highlightClasses);
          const removeHighlight = () => {
            el.classList.remove(...highlightClasses);
            el.removeEventListener("input", removeHighlight);
          };
          el.addEventListener("input", removeHighlight, { once: true });
          if (highlightTimerRef.current) {
            clearTimeout(highlightTimerRef.current);
          }
          highlightTimerRef.current = setTimeout(() => {
            removeHighlight();
            highlightTimerRef.current = null;
          }, 2000);
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

    const items = [
      ...CORE_ITEMS.map((item) => (item.key === "avg_play_ratio" ? { ...item, optional: retentionOptional } : item)),
      ...INTERACTION_ITEMS,
      ...RETENTION_ITEMS.map((item) => ({ ...item, optional: retentionOptional })),
    ];
    const { cells, recognizedCount, hasSummaryWarning, summaryText } = resolveMetricGroupViewModel({
      items,
      fields,
      confidenceLevels,
      slotProcessing,
      inputsOpen,
      editing,
      frozenFocus,
      acknowledgedRuleSignatures,
    });

    return (
      <motion.div variants={itemVariants} className="space-y-2">
        <div className="flex h-5 items-center justify-between px-2 text-[12px]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[#1F1E1D]">识别结果</span>
            <span
              data-ocr-recognized={recognizedCount > 0 ? "true" : undefined}
              className={hasSummaryWarning ? "text-status-warning-text" : "text-[#78716C]"}
            >
              {summaryText}
            </span>
          </div>
          {onInspectScreenshot ? (
            <button
              type="button"
              onClick={onInspectScreenshot}
              className="flex shrink-0 items-center gap-1 text-[12px] text-[#78716C] hover:text-[#141413] transition-colors cursor-pointer"
              title="打开同屏截图对照"
              aria-label="打开同屏截图对照"
            >
              <Eye className="size-3.5 stroke-[1.6]" />
              <span>对照原图</span>
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
          {cells.map(({ item, field, mode, ruleReason, ruleSignature, ruleAcknowledged }) => (
            <指标输入卡
              key={item.key}
              label={item.label}
              field={field}
              mode={mode}
              suffix={item.suffix}
              optional={item.optional}
              metricType={item.metricType}
              disabled={disabledKeys.includes(item.key)}
              onChange={(value) => onFieldChange(item.key, value)}
              onRestoreOcr={onRestoreOcrValue ? () => onRestoreOcrValue(item.key) : undefined}
              onConfirmDoubt={() => {
                if (ruleSignature) {
                  setAcknowledgedRuleSignatures((current) => ({ ...current, [item.key]: ruleSignature }));
                }
                if (field.source === "ocr" || (field.confidenceLevel && field.confidenceLevel !== "high")) {
                  onFieldChange(item.key, field.value);
                }
              }}
              checked={ruleAcknowledged}
              onFocus={() => {
                setFrozenFocus({ key: item.key, value: field?.value ?? "" });
                onFocusField?.(item.key);
              }}
              onBlur={() => {
                setFrozenFocus((current) => (current?.key === item.key ? null : current));
                onBlurField?.(item.key);
              }}
              inputRef={setRef(item.key)}
              onKeyDown={handleKeyDown(item.key)}
              hint={disabledKeys.includes(item.key)
                ? "没绑定作品，这项改不了"
                : ruleReason ?? (editing && item.key === "avg_play_ratio" ? "留空＝保持原值，不能清空" : undefined)}
            />
          ))}
        </div>
      </motion.div>
    );
  },
);

export { MetricGroupSection as 指标分组区 };
