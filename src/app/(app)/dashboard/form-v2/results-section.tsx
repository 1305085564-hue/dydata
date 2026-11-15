"use client";

import type { RefObject } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 指标分组区, type MetricGroupHandle } from "@/components/submission/指标分组区";
import type { EditableMetricKey, SubmissionSlotRole } from "@/components/submission/提交状态机";
import type { ExtendedSubmissionIssueSummary } from "@/components/submission/填报表单状态";
import { isPublishedAtConfirmed } from "@/lib/video-submit-deadline";
import { normalizePublishedAtInputValue } from "@/lib/日报";
import { cn } from "@/lib/utils";
import type { EditableMetricField, FormMetaState } from "../video-submit-form-model";

export interface FormV2ResultsSectionProps {
  editing?: boolean;
  metricsSectionRef: RefObject<HTMLDivElement | null>;
  publishedAtSectionRef: RefObject<HTMLDivElement | null>;
  metaVideoTitleRef: RefObject<HTMLInputElement | null>;
  contentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  metricsGroupRef: RefObject<MetricGroupHandle | null>;
  fields: Record<EditableMetricKey, EditableMetricField>;
  meta: FormMetaState;
  issueSummary: ExtendedSubmissionIssueSummary;
  slotProcessing: Record<SubmissionSlotRole, boolean>;
  inputsOpen: Record<SubmissionSlotRole, boolean>;
  hasAttemptedSubmit: boolean;
  publishedAtUnconfirmedReason: string;
  updateField: (key: EditableMetricKey, value: string) => void;
  restoreOcrValue: (key: EditableMetricKey) => void;
  handleFieldFocus: (key: EditableMetricKey) => void;
  handleFieldBlur: (key: EditableMetricKey) => void;
  updateMeta: <Key extends keyof FormMetaState>(key: Key, value: FormMetaState[Key]) => void;
}

/** 识别结果：数字、标题、发布时间都以读出来的字呈现；只有没认准、没认出的才是输入框。 */
export function FormV2ResultsSection({
  editing = false,
  metricsSectionRef,
  publishedAtSectionRef,
  metaVideoTitleRef,
  contentTextareaRef,
  metricsGroupRef,
  fields,
  meta,
  issueSummary,
  slotProcessing,
  inputsOpen,
  hasAttemptedSubmit,
  publishedAtUnconfirmedReason,
  updateField,
  restoreOcrValue,
  handleFieldFocus,
  handleFieldBlur,
  updateMeta,
}: FormV2ResultsSectionProps) {
  const titleRequired = meta.anomalyStatus !== "abnormal";
  const titleMissing = titleRequired && !meta.videoTitle.trim();
  const titleBoxed = titleMissing && (editing || inputsOpen.screenshot_1 || hasAttemptedSubmit);
  const publishedConfirmed = isPublishedAtConfirmed(meta.publishedAtText);
  const publishedText = publishedConfirmed
    ? normalizePublishedAtInputValue(meta.publishedAt).replace("T", " ") || meta.publishedAtText
    : null;

  return (
    <div className="space-y-3">
      <div ref={metricsSectionRef}>
        <指标分组区
          ref={metricsGroupRef}
          editing={editing}
          fields={fields}
          slotProcessing={slotProcessing}
          inputsOpen={inputsOpen}
          onFieldChange={updateField}
          onRestoreOcrValue={restoreOcrValue}
          onFocusField={handleFieldFocus}
          onBlurField={handleFieldBlur}
          anomalyStatus={meta.anomalyStatus}
          onCompleteMetrics={() => document.getElementById("video_title")?.focus()}
        />
      </div>

      <div className="space-y-1 pt-1">
        <div className="flex h-9 items-center gap-3 px-2">
          <Label htmlFor="video_title" className="w-16 shrink-0 text-[12px] font-normal text-[#78716C]">
            视频标题
          </Label>
          <Input
            id="video_title"
            ref={metaVideoTitleRef}
            value={meta.videoTitle}
            onChange={(event) => updateMeta("videoTitle", event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
              if (event.key === "Enter") {
                event.preventDefault();
                contentTextareaRef.current?.focus();
              }
            }}
            placeholder={slotProcessing.screenshot_1 ? "识别中…" : "截图里认出标题后会自动带出"}
            className={cn(
              "h-9 min-h-0 flex-1 rounded-md px-2 font-sans text-[14px] text-[#141413] transition-colors placeholder:text-[#A8A29E] focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-[#141413]/10",
              titleBoxed
                ? "border border-status-warning/50 bg-white shadow-input"
                : "border border-transparent bg-transparent shadow-none hover:bg-[#F1F1F0]",
            )}
          />
        </div>

        <div ref={publishedAtSectionRef} className="flex h-9 items-center gap-3 px-2">
          <span className="w-16 shrink-0 text-[12px] text-[#78716C]">发布时间</span>
          <div
            className={cn(
              "flex h-9 min-h-0 flex-1 items-center rounded-md px-2 font-sans text-[14px] transition-colors",
              publishedText
                ? "tabular-nums text-[#141413]"
                : issueSummary.publishedAtUnconfirmed && (inputsOpen.screenshot_2 || hasAttemptedSubmit)
                  ? "border border-status-warning/50 bg-white text-[12px] text-status-warning-text shadow-input"
                  : "text-[#A8A29E]",
            )}
          >
            {publishedText ? (
              publishedText
            ) : slotProcessing.screenshot_2 ? (
              "识别中…"
            ) : issueSummary.publishedAtUnconfirmed && (inputsOpen.screenshot_2 || hasAttemptedSubmit) ? (
              <span className="truncate" title={publishedAtUnconfirmedReason}>
                {publishedAtUnconfirmedReason}
              </span>
            ) : (
              "从完播截图识别"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
