"use client";

import { useState, type RefObject } from "react";
import { 截图槽位区 } from "@/components/submission/截图槽位区";
import type { SubmissionSlotRole } from "@/components/submission/提交状态机";
import { cn } from "@/lib/utils";
import { SUBMIT_STEPS, resolveSubmitStep } from "@/lib/video-submit/domain/submit-gaps";
import type { SlotViewState } from "../video-submit-form-model";
import { FormV2ResultsSection, type FormV2ResultsSectionProps } from "./results-section";
import { FormV2ContentSection, type FormV2ContentSectionProps } from "./content-section";
import { FormV2MoreSection, type FormV2MoreSectionProps } from "./more-section";

type SlotsUpdater = (
  updater:
    | Record<SubmissionSlotRole, SlotViewState>
    | ((current: Record<SubmissionSlotRole, SlotViewState>) => Record<SubmissionSlotRole, SlotViewState>),
) => void;

export type FormV2WorkspaceProps = Omit<FormV2ResultsSectionProps, "slotProcessing" | "inputsOpen"> &
  Omit<FormV2ContentSectionProps, "contentMissing"> &
  Omit<FormV2MoreSectionProps, "open" | "onToggle" | "topicTagMissing"> & {
    slots: Record<SubmissionSlotRole, SlotViewState>;
    slotsSectionRef: RefObject<HTMLDivElement | null>;
    handleSlotUpload: (role: SubmissionSlotRole, file: File) => void;
    handleUnifiedUpload: (files: File[]) => void;
    setDeleteTargetRole: (role: SubmissionSlotRole | null) => void;
    handleSlotRetry: (role: SubmissionSlotRole) => void;
    updateSlotsState: SlotsUpdater;
    screenshotsRequired: boolean;
    focusedRole: SubmissionSlotRole | null;
    /** 宽屏有对照栏时：点截图小图让对照栏切到这张 */
    onPreviewSlot?: (role: SubmissionSlotRole) => void;
    pulseSlots: boolean;
    isMoreOpen: boolean;
    setIsMoreOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  };

const SLOT_ROLES: SubmissionSlotRole[] = ["screenshot_1", "screenshot_2"];

/**
 * 单栏自上而下：截图 → 识别结果 → 文案 → 更多。视线顺序 = 做事顺序。
 * 两张截图没齐时只露截图这一步（第一张进来后粘贴区只换提示语）；第二张一进来，
 * 截图区换成两张卡片、下方整体出现，识别在后台继续。展开后删掉一张也不收回。
 * 另外两种入口照旧直接展开：「没有截图，直接手填」、编辑已交记录；作品异常不要求截图，也直接展开。
 */
export function FormV2Workspace(props: FormV2WorkspaceProps) {
  const {
    slots,
    slotsSectionRef,
    metricsSectionRef,
    handleSlotUpload,
    handleUnifiedUpload,
    setDeleteTargetRole,
    handleSlotRetry,
    updateSlotsState,
    screenshotsRequired,
    focusedRole,
    onPreviewSlot,
    pulseSlots,
    isMoreOpen,
    setIsMoreOpen,
    editing = false,
    issueSummary,
    hasAttemptedSubmit,
    meta,
    updateMeta,
  } = props;
  const [manualEntry, setManualEntry] = useState(false);
  const bothSlotsFilled = SLOT_ROLES.every((role) => slots[role].status !== "empty");
  // 只看槽位里有没有图，不等识别结果；一旦两槽齐过就保持展开
  const [slotsExpanded, setSlotsExpanded] = useState(bothSlotsFilled);
  if (bothSlotsFilled && !slotsExpanded) setSlotsExpanded(true);

  const slotProcessing = Object.fromEntries(
    SLOT_ROLES.map((role) => [role, slots[role].status === "uploading" || slots[role].status === "recognizing"]),
  ) as Record<SubmissionSlotRole, boolean>;
  const inputsOpen = Object.fromEntries(
    SLOT_ROLES.map((role) => [
      role,
      manualEntry || !screenshotsRequired || Boolean(slots[role].ocrFallback) || (slots[role].status !== "empty" && !slotProcessing[role]),
    ]),
  ) as Record<SubmissionSlotRole, boolean>;
  const showDetails = editing || slotsExpanded || manualEntry || !screenshotsRequired;
  // 截图区何时换成两张卡片：两槽齐过；编辑已交记录且有图；只有留存槽有图（如恢复的旧草稿），没有对应提示语，直接给卡片
  const anySlotFilled = SLOT_ROLES.some((role) => slots[role].status !== "empty");
  const showSlotCards = slotsExpanded
    || (editing && anySlotFilled)
    || (slots.screenshot_1.status === "empty" && slots.screenshot_2.status !== "empty");
  const currentStep = resolveSubmitStep(issueSummary);
  const moreOpen = isMoreOpen || (hasAttemptedSubmit && issueSummary.topicTagMissing);

  return (
    <div className="space-y-5">
      <div ref={slotsSectionRef} className="space-y-2">
        <截图槽位区
          slots={slots}
          onSelectFile={handleSlotUpload}
          onUploadFiles={handleUnifiedUpload}
          onDelete={(role) => setDeleteTargetRole(role)}
          onRetry={handleSlotRetry}
          showCards={showSlotCards}
          onManualFill={(role) => {
            updateSlotsState((current) => {
              const hasUploadedScreenshot = Boolean(current[role].assetUrl);
              return {
                ...current,
                [role]: {
                  ...current[role],
                  status: hasUploadedScreenshot ? "confirmed" : "empty",
                  confirmed: hasUploadedScreenshot,
                  requiresManualConfirmation: false,
                  error: null,
                  assetUrl: hasUploadedScreenshot ? current[role].assetUrl : null,
                  previewUrl: hasUploadedScreenshot ? current[role].previewUrl : null,
                  file: hasUploadedScreenshot ? current[role].file : null,
                  fileName: hasUploadedScreenshot ? current[role].fileName : undefined,
                  recognizedFields: null,
                  ocrSummary: undefined,
                  ocrFallback: hasUploadedScreenshot,
                },
              };
            });
            setManualEntry(true);
            metricsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          screenshotsRequired={screenshotsRequired}
          focusedRole={focusedRole}
          onPreviewSlot={onPreviewSlot}
          pulseEmptySlots={pulseSlots}
        />
        <div className="flex h-6 items-center justify-between gap-3 px-2 text-[12px]">
          <ol className="flex min-w-0 items-center gap-2 overflow-hidden text-[#A8A29E]" aria-label="提交步骤">
            {SUBMIT_STEPS.map((step, index) => (
              <li key={step} className="flex shrink-0 items-center gap-2">
                {index > 0 ? <span aria-hidden>→</span> : null}
                <span
                  aria-current={index === currentStep ? "step" : undefined}
                  className={cn(index === currentStep ? "text-[#141413]" : index < currentStep ? "text-[#78716C]" : "")}
                >
                  {step}
                </span>
              </li>
            ))}
          </ol>
          {manualEntry ? (
            <div className="flex shrink-0 items-center gap-2 text-[#78716C]">
              <button
                type="button"
                onClick={() => setManualEntry(false)}
                className="hover:text-[#141413] hover:underline cursor-pointer"
              >
                返回上传截图
              </button>
              <span aria-hidden className="text-[#A8A29E]">·</span>
              <button
                type="button"
                onClick={() => {
                  setManualEntry(false);
                  updateMeta("anomalyStatus", "abnormal");
                  setIsMoreOpen(true);
                }}
                className="hover:text-[#141413] hover:underline cursor-pointer"
              >
                作品被限流或删了
              </button>
            </div>
          ) : !showDetails && (
            <div className="flex shrink-0 items-center gap-2 text-[#78716C]">
              <button type="button" onClick={() => setManualEntry(true)} className="hover:text-[#141413] hover:underline cursor-pointer">
                没有截图，直接手填
              </button>
              <span aria-hidden className="text-[#A8A29E]">·</span>
              <button
                type="button"
                onClick={() => {
                  updateMeta("anomalyStatus", "abnormal");
                  setIsMoreOpen(true);
                }}
                className="hover:text-[#141413] hover:underline cursor-pointer"
              >
                作品被限流或删了
              </button>
            </div>
          )}
        </div>
      </div>

      {showDetails && (
        <>
          <FormV2ResultsSection {...props} slotProcessing={slotProcessing} inputsOpen={inputsOpen} />
          <FormV2ContentSection {...props} contentMissing={issueSummary.missingRequiredMeta.includes("content")} />
          <FormV2MoreSection
            {...props}
            open={moreOpen}
            onToggle={() => setIsMoreOpen((current) => !current)}
            topicTagMissing={issueSummary.topicTagMissing}
            meta={meta}
          />
        </>
      )}
    </div>
  );
}
