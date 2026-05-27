"use client";

import { useRef } from "react";
import { Upload, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { UPLOAD_LIMITS, formatSizeLimit } from "@/lib/upload-limits";
import type { WizardFormData } from "../types";

interface StepCoreContentProps {
  data: Pick<WizardFormData, "script_text" | "screenshots" | "submissionPath">;
  onChange: (data: Partial<WizardFormData>) => void;
  isUploading: boolean;
  onUpload: (files: FileList | null) => void;
}

export function StepCoreContent({
  data,
  onChange,
  isUploading,
  onUpload,
}: StepCoreContentProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { script_text, screenshots, submissionPath } = data;

  const isViolation = submissionPath === "violation";

  return (
    <div className="space-y-5">
      {/* Script text */}
      <div className="space-y-2">
        <Label htmlFor="script_text" className="text-[13px] font-medium text-zinc-800">
          话术原文 <span className="text-[#C9604D]">*</span>
        </Label>
        <Textarea
          id="script_text"
          value={script_text}
          onChange={(e) => onChange({ script_text: e.target.value })}
          placeholder="原封不动粘贴话术内容"
          className="min-h-[170px] resize-none rounded-xl border-transparent bg-zinc-100/70 text-[14px] leading-7 focus:border-zinc-200 focus:bg-white focus:ring-1 focus:ring-zinc-950/5"
        />
      </div>

      {/* Screenshots */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[13px] font-medium text-zinc-800">
            截图
            <span className="ml-2 text-[11px] font-normal text-zinc-400">
              {isViolation ? "建议" : "可选"} · 最多 5 张
            </span>
          </Label>
          {screenshots.length ? (
            <span className="text-[11px] tabular-nums text-zinc-400">
              {screenshots.length} / 5
            </span>
          ) : null}
        </div>

        <label
          htmlFor="wizard_screenshots"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (isUploading || screenshots.length >= 5) return;
            onUpload(e.dataTransfer.files);
          }}
          className={cn(
            "flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-5 py-8 text-center transition-colors",
            isUploading || screenshots.length >= 5
              ? "cursor-not-allowed border-zinc-200 bg-zinc-50/40 opacity-70"
              : "border-zinc-300 bg-zinc-50/70 hover:border-[#D97757]/40 hover:bg-zinc-50",
          )}
        >
          <Upload className="size-5 stroke-[1.5] text-zinc-400" />
          <span className="text-[13px] font-medium text-zinc-700">
            {isUploading ? "上传中..." : "点击上传或拖拽截图到此"}
          </span>
          <span className="text-[11px] text-zinc-400">
            JPG / PNG / WEBP · 单张最大 {formatSizeLimit(UPLOAD_LIMITS.violationScreenshot)}
          </span>
        </label>
        <input
          id="wizard_screenshots"
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="sr-only"
          disabled={isUploading || screenshots.length >= 5}
          onChange={(e) => {
            onUpload(e.currentTarget.files);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />

        {screenshots.length ? (
          <div className="flex flex-wrap gap-2">
            {screenshots.map((item) => (
              <span
                key={item.path}
                className="inline-flex max-w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1 text-[12px] font-medium text-zinc-600"
              >
                <span className="truncate">{item.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      screenshots: screenshots.filter((s) => s.path !== item.path),
                    })
                  }
                  className="text-zinc-400 hover:text-zinc-800 active:translate-y-0"
                  aria-label="移除截图"
                >
                  <X className="size-3 stroke-[1.5]" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
