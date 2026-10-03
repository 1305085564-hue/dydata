"use client";

import type { RefObject } from "react";
import { AlertTriangle, Check, ClipboardPaste } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 指标分组区, type MetricGroupHandle } from "@/components/submission/指标分组区";
import { 导粉话术采集区 } from "@/components/submission/导粉话术采集区";
import { TopicSelectDropdown, type SelectedTopicInfo } from "@/components/submission/TopicSelectDropdown";
import { parseMetric } from "@/lib/video-submit/domain/form-rules";
import { cn } from "@/lib/utils";
import type { ExtendedSubmissionIssueSummary } from "@/components/submission/填报表单状态";
import type { EditableMetricKey } from "@/components/submission/提交状态机";
import type {
  EditableMetricField,
  FormMetaState,
} from "../video-submit-form-model";

export interface FormV2RightColumnProps {
  metricsSectionRef: RefObject<HTMLDivElement | null>;
  issueSummary: ExtendedSubmissionIssueSummary;
  fields: Record<EditableMetricKey, EditableMetricField>;
  metricsGroupRef: RefObject<MetricGroupHandle | null>;
  updateField: (key: EditableMetricKey, value: string) => void;
  restoreOcrValue: (key: EditableMetricKey) => void;
  handleFieldFocus: (key: EditableMetricKey) => void;
  handleFieldBlur: (key: EditableMetricKey) => void;
  meta: FormMetaState;
  scriptCaptureRef: RefObject<HTMLDivElement | null>;
  scriptText: string;
  updateScriptText: (value: string) => void;
  hasAttemptedSubmit: boolean;
  hasSlotIssues: boolean;
  handlePasteContent: () => void;
  isPastedFeedback: boolean;
  metaSectionRef: RefObject<HTMLDivElement | null>;
  metaVideoTitleRef: RefObject<HTMLInputElement | null>;
  selectedTopicId: string | null;
  selectedTopicTitle: string | null;
  handleSelectTopic: (topic: SelectedTopicInfo | null) => void;
  updateMeta: <Key extends keyof FormMetaState>(
    key: Key,
    value: FormMetaState[Key],
  ) => void;
  contentTextareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function FormV2RightColumn({
  metricsSectionRef,
  issueSummary,
  fields,
  metricsGroupRef,
  updateField,
  restoreOcrValue,
  handleFieldFocus,
  handleFieldBlur,
  meta,
  scriptCaptureRef,
  scriptText,
  updateScriptText,
  hasAttemptedSubmit,
  hasSlotIssues,
  handlePasteContent,
  isPastedFeedback,
  metaSectionRef,
  metaVideoTitleRef,
  selectedTopicId,
  selectedTopicTitle,
  handleSelectTopic,
  updateMeta,
  contentTextareaRef,
}: FormV2RightColumnProps) {
  return (
    <div className="flex min-w-0 flex-col gap-6 lg:contents">
      {/* 核心数据指标 - 内部保持紧凑，头尾适度留白舒展以对齐左栏 */}
      <div ref={metricsSectionRef} className="space-y-4 pt-1 pb-1.5 lg:pb-2.5 lg:col-start-2 lg:row-start-1">
        {issueSummary.unconfirmedSlots.length > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-status-warning/[0.08] px-3 py-2 text-[12px] text-status-warning" role="status">
            <AlertTriangle className="size-3.5 shrink-0" />
            {issueSummary.unconfirmedSlots.length} 张截图识别未确认，请对照原图核对指标后提交
          </div>
        )}
        <指标分组区
          ref={metricsGroupRef}
          fields={fields}
          onFieldChange={updateField}
          onRestoreOcrValue={restoreOcrValue}
          onFocusField={handleFieldFocus}
          onBlurField={handleFieldBlur}
          anomalyStatus={meta.anomalyStatus}
          onCompleteMetrics={() => document.getElementById("video_title")?.focus()}
        />
        <div ref={scriptCaptureRef}>
          <导粉话术采集区
            visible={parseMetric(fields.follower_convert.value) > 0}
            value={scriptText}
            onChange={updateScriptText}
            hasAttemptedSubmit={hasAttemptedSubmit}
          />
        </div>
      </div>

      {/* 右栏下半：内容组（视频标题 + 文案）。lg 起与左栏设置组同处第三行，共用一条通栏发丝线 */}
      <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-3">
        {/* 视频标题 - 纯排版平铺，与文案和指标网格严格左对齐；lg 起分隔线交给通栏线 */}
        <div
          ref={metaSectionRef}
          className="space-y-1 pt-3 border-t border-[#E2E2DF]/60 lg:border-t-0 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="video_title" className="flex items-center gap-1">
              <span>视频标题</span>
              {meta.anomalyStatus !== "abnormal" && (
                <span className="text-status-danger">*</span>
              )}
              {hasAttemptedSubmit &&
                !hasSlotIssues &&
                meta.anomalyStatus !== "abnormal" &&
                issueSummary.missingRequiredMeta.includes("videoTitle") && (
                  <span className="text-[12px] font-normal text-status-danger">请填写标题</span>
                )}
            </Label>
            <TopicSelectDropdown
              selectedTopicId={selectedTopicId}
              selectedTopicTitle={selectedTopicTitle}
              onSelectTopic={handleSelectTopic}
            />
          </div>
          <Input
            id="video_title"
            ref={metaVideoTitleRef}
            value={meta.videoTitle}
            onChange={(event) => updateMeta("videoTitle", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                contentTextareaRef.current?.focus();
              }
            }}
            placeholder="输入视频标题"
            className={cn(
              "h-9 min-h-0 rounded-md bg-white text-[#1F1E1D] text-[13px] font-sans shadow-input transition-colors focus-visible:ring-1 focus-visible:ring-[#141413]/10 focus-visible:border-[#78716C]",
              hasAttemptedSubmit &&
                !hasSlotIssues &&
                meta.anomalyStatus !== "abnormal" &&
                issueSummary.missingRequiredMeta.includes("videoTitle")
                ? "border border-status-danger/40 ring-1 ring-status-danger/10 bg-white"
                : "border border-[#E2E2DF]"
            )}
          />
        </div>

        {/* 视频文案 - 与视频标题同属内容组，不再单独加分隔线（底纸纯排版解套，消灭纸内卡片套娃） */}
        <div
          className="flex flex-col min-h-0 bg-white transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <Label htmlFor="content" className="flex items-center gap-1">
              <span>文案</span>
              <span className="text-status-danger">*</span>
              {hasAttemptedSubmit &&
                !hasSlotIssues &&
                issueSummary.missingRequiredMeta.includes("content") && (
                  <span className="text-[12px] font-normal text-status-danger">请填写文案</span>
                )}
            </Label>
            <button
              type="button"
              onClick={handlePasteContent}
              className={cn(
                "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center sm:justify-start gap-1 text-[12px] font-normal transition-colors cursor-pointer py-1 px-2 sm:p-0",
                isPastedFeedback
                  ? "text-status-success"
                  : "text-[#78716C] hover:text-[#1F1E1D]"
              )}
            >
              {isPastedFeedback ? (
                <>
                  <Check size={13} className="stroke-[2.5]" />
                  已粘贴
                </>
              ) : (
                <>
                  <ClipboardPaste size={13} />
                  一键粘贴
                </>
              )}
            </button>
          </div>
          <textarea
            ref={contentTextareaRef}
            id="content"
            value={meta.content}
            onChange={(event) => updateMeta("content", event.target.value)}
            placeholder="粘贴视频文案..."
            className={cn(
              "min-h-[140px] w-full resize-none rounded-md p-3 bg-white border shadow-input text-[13px] leading-relaxed text-[#1F1E1D] placeholder:text-[#78716C]/60 outline-none transition-colors lg:min-h-[120px]",
              hasAttemptedSubmit &&
                !hasSlotIssues &&
                issueSummary.missingRequiredMeta.includes("content")
                ? "border-status-danger/40 ring-1 ring-status-danger/10 bg-white"
                : "border-[#E2E2DF]/60 focus:border-[#78716C] focus:ring-1 focus:ring-[#141413]/10"
            )}
          />
        </div>
      </div>
    </div>
  );
}
