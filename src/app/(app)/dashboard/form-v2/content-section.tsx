"use client";

import type { RefObject } from "react";
import { Check, ClipboardPaste } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FormMetaState } from "../video-submit-form-model";

export interface FormV2ContentSectionProps {
  meta: FormMetaState;
  metaSectionRef: RefObject<HTMLDivElement | null>;
  contentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  contentMissing: boolean;
  hasAttemptedSubmit: boolean;
  handlePasteContent: () => void;
  isPastedFeedback: boolean;
  updateMeta: <Key extends keyof FormMetaState>(key: Key, value: FormMetaState[Key]) => void;
}

/** 文案：截图里没有、唯一要人动手的一项，一键粘贴是主动作。 */
export function FormV2ContentSection({
  meta,
  metaSectionRef,
  contentTextareaRef,
  contentMissing,
  hasAttemptedSubmit,
  handlePasteContent,
  isPastedFeedback,
  updateMeta,
}: FormV2ContentSectionProps) {
  const showMissing = hasAttemptedSubmit && contentMissing;
  return (
    <div ref={metaSectionRef} className="space-y-2">
      <div className="flex h-7 items-center justify-between gap-2 px-2">
        <Label htmlFor="content" className="flex min-w-0 items-baseline gap-2 font-normal">
          <span className="text-[14px] text-[#1F1E1D]">文案</span>
          <span className="truncate text-[12px] text-[#78716C]">截图里没有，这一项要你来</span>
        </Label>
        <button
          type="button"
          onClick={handlePasteContent}
          className={cn(
            "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center gap-1 rounded-md border px-2 h-7 text-[12px] transition-colors cursor-pointer",
            isPastedFeedback
              ? "border-status-success/40 text-status-success"
              : "border-[#E2E2DF] bg-white text-[#1F1E1D] hover:bg-[#EBEBE9]",
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
        placeholder="把视频文案粘贴到这里"
        className={cn(
          "min-h-[120px] w-full resize-none rounded-md border bg-white p-3 text-[14px] leading-relaxed text-[#1F1E1D] shadow-input outline-none transition-colors placeholder:text-[#A8A29E]",
          showMissing
            ? "border-status-warning/50 ring-1 ring-status-warning/10"
            : "border-[#E2E2DF] focus:border-[#78716C] focus:ring-1 focus:ring-[#141413]/10",
        )}
      />
    </div>
  );
}
