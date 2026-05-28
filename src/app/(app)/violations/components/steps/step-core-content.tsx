"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Upload, X, GripVertical } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageLightbox } from "@/components/image-lightbox";
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
  const dragIndexRef = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { script_text, screenshots, submissionPath } = data;

  const isViolation = submissionPath === "violation";

  const removeAt = useCallback(
    (path: string) => {
      onChange({ screenshots: screenshots.filter((s) => s.path !== path) });
    },
    [onChange, screenshots],
  );

  const reorder = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const next = [...screenshots];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onChange({ screenshots: next });
    },
    [onChange, screenshots],
  );

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
          autoFocus
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
            // 缩略图重排时也会触发 drop，但 dataTransfer.files 为空
            if (e.dataTransfer.files?.length) {
              onUpload(e.dataTransfer.files);
            }
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
          <div className="space-y-1.5">
            <p className="text-[11px] text-zinc-400">
              拖动卡片可重排，第一张默认作为封面。
            </p>
            <div className="flex flex-wrap gap-2.5">
              <AnimatePresence initial={false}>
                {screenshots.map((item, idx) => {
                  const isOver = overIndex === idx;
                  return (
                    <motion.div
                      key={item.path}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ type: "spring", stiffness: 360, damping: 26 }}
                      draggable
                      onDragStart={(e) => {
                        dragIndexRef.current = idx;
                        // @ts-expect-error framer 转发的 e 没暴露 dataTransfer 类型，但运行时有
                        e.dataTransfer?.setData("text/plain", String(idx));
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (overIndex !== idx) setOverIndex(idx);
                      }}
                      onDragLeave={() => {
                        if (overIndex === idx) setOverIndex(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const from = dragIndexRef.current;
                        if (from !== null && from !== idx) reorder(from, idx);
                        dragIndexRef.current = null;
                        setOverIndex(null);
                      }}
                      onDragEnd={() => {
                        dragIndexRef.current = null;
                        setOverIndex(null);
                      }}
                      className={cn(
                        "group/thumb relative h-[88px] w-[68px] cursor-grab overflow-hidden rounded-lg border bg-zinc-100 transition-all active:cursor-grabbing",
                        isOver
                          ? "border-[#D97757] ring-2 ring-[#D97757]/40"
                          : "border-zinc-200 hover:border-zinc-300",
                        idx === 0 && "ring-1 ring-zinc-300",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(idx)}
                        className="block size-full"
                        aria-label={`查看截图 ${idx + 1}`}
                      >
                        <Image
                          src={`/api/violations/screenshot/${encodeURI(item.path)}`}
                          alt={item.name}
                          fill
                          unoptimized
                          sizes="80px"
                          className="object-cover"
                        />
                      </button>

                      {idx === 0 ? (
                        <span className="absolute left-1 top-1 inline-flex items-center rounded bg-zinc-900/70 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
                          封面
                        </span>
                      ) : null}

                      <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/thumb:opacity-100">
                        <GripVertical className="size-2.5 stroke-[2]" />
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAt(item.path);
                        }}
                        className="absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-all hover:bg-[#C9604D] group-hover/thumb:opacity-100"
                        aria-label="删除截图"
                      >
                        <X className="size-3 stroke-[2]" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        ) : null}
      </div>

      {lightboxIndex !== null ? (
        <ImageLightbox
          paths={screenshots.map((s) => s.path)}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={(i) => setLightboxIndex(i)}
        />
      ) : null}
    </div>
  );
}
