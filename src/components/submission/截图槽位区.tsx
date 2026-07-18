"use client";

import { useRef, useState } from "react";
import { UploadCloud, Trash2, Eye, RefreshCw, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubmissionSlotRole, SubmissionSlotState } from "./提交状态机";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface SubmissionSlotsProps {
  slots: Record<
    SubmissionSlotRole,
    SubmissionSlotState & {
      fileName?: string;
      error?: string | null;
      assetUrl?: string | null;
      ocrSummary?: string[];
      errorCode?: string | null;
    }
  >;
  onSelectFile: (role: SubmissionSlotRole, file: File) => void;
  onUploadFiles: (files: File[]) => void;
  onDelete: (role: SubmissionSlotRole) => void;
  onRetry?: (role: SubmissionSlotRole) => void;
  onManualFill?: (role: SubmissionSlotRole) => void;
  issueCount?: number;
  screenshotsRequired?: boolean;
  focusedRole?: SubmissionSlotRole | null;
  highlightedOcrIndex?: number | null;
}

const SLOT_META: Array<{
  role: SubmissionSlotRole;
  title: string;
  description: string;
  required: boolean;
}> = [
  { role: "screenshot_1", title: "互动截图", description: "播放量 + 互动数据 + 曲线", required: true },
  { role: "screenshot_2", title: "完播截图", description: "均播/完播/跳出/留存率", required: true },
];

export function SubmissionSlotsSection({
  slots,
  onSelectFile,
  onUploadFiles,
  onDelete,
  onRetry,
  onManualFill,
  screenshotsRequired = true,
}: SubmissionSlotsProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const files: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.type.startsWith("image/")) {
        files.push(file);
      }
    }
    if (files.length > 0) {
      onUploadFiles(files);
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      event.preventDefault();
      onUploadFiles(files);
    }
  };

  return (
    <div className="space-y-4">
      {/* 左右对齐结构：固定 h-[260px] 保证视觉饱满，杜绝上下留白被挤压的局促感 */}
      <div className={cn("grid gap-4 h-[260px]", screenshotsRequired ? "md:grid-cols-[1fr_280px]" : "grid-cols-1")}>
        {/* 左侧：多选上传区域 (h-full 纵向填满) */}
        {screenshotsRequired ? (
          <div
            onPaste={handlePaste}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "group relative flex h-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-5 text-center transition-all duration-150",
              isDragOver
                ? "border-[#D97757] bg-[#FDF9F7] shadow-[0_0_15px_rgba(217,119,87,0.08)]"
                : "border-[#D97757]/40 bg-[#FDF9F7]/20 hover:border-[#D97757]/70 hover:bg-[#FDF9F7]/40"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex flex-col items-center gap-2">
              <UploadCloud className="size-6 stroke-[1.5] text-[#B4532F] transition-colors" />
              <p className="text-[13px] font-medium leading-snug text-[#B4532F]">
                {isDragOver ? "松开投放到此" : "拖入、选择多张截图，亦可在此 Ctrl+V 粘贴"}
              </p>
              <div className="flex flex-col gap-0.5 text-[12px] leading-relaxed text-stone-500">
                <p>1. 互动截图 (包含播放量/数据/曲线)</p>
                <p>2. 完播截图 (包含均播/留存率/完播数据)</p>
              </div>
            </div>
          </div>
        ) : null}

        {/* 右侧：微缩 Slot 垂直堆叠卡片 (等分高度平摊，对齐左侧上下沿) */}
        <div className="flex flex-col gap-3 h-full">
          {SLOT_META.map((item) => {
            const slot = slots[item.role];
            const isProcessing = slot.status === "uploading" || slot.status === "recognizing";
            const isWarning = slot.status === "pending_confirm" || ((slot.confidenceScore ?? 1) < 0.7 && slot.status !== "failed");
            const isError = slot.status === "failed";
            const isSuccess = slot.status === "confirmed" && !isWarning;

            return (
              <div
                key={item.role}
                className={cn(
                  "relative flex flex-col justify-between flex-1 rounded-xl border bg-white p-3 transition-[border-color,box-shadow] duration-150",
                  slot.status === "empty" ? "border-stone-300 border-dashed bg-stone-100/20" : "border-stone-300 shadow-sm",
                  isError && "border-[#C9604D]/35 bg-[#FFF8F7]"
                )}
              >
                {/* 上半部：图片 + 名称状态 */}
                <div className="flex min-w-0 items-start justify-between gap-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {/* 缩略图 */}
                    {slot.status === "empty" ? (
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-100 text-stone-500">
                        <FileText className="size-4.5 stroke-[1.5]" />
                      </div>
                    ) : isProcessing ? (
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-[#B4532F]">
                        <Loader2 className="size-4.5 animate-spin stroke-[1.6]" />
                      </div>
                    ) : slot.assetUrl ? (
                      <Dialog>
                        <DialogTrigger
                          render={
                            <div className="group/preview relative size-11 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-stone-300">
                              <img
                                src={slot.assetUrl}
                                alt={item.title}
                                className="h-full w-full object-cover transition-transform duration-200 group-hover/preview:scale-105"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover/preview:opacity-100 transition-opacity">
                                <Eye className="size-3 text-white" />
                              </div>
                            </div>
                          }
                        />
                        <DialogContent className="w-auto max-w-4xl overflow-hidden border-none bg-transparent p-0 shadow-none">
                          <DialogTitle className="sr-only">放大预览</DialogTitle>
                          <img src={slot.assetUrl} alt="放大预览" className="h-auto max-h-[85vh] w-full rounded-xl object-contain" />
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-stone-200 text-stone-500">
                        <FileText className="size-4.5 stroke-[1.5]" />
                      </div>
                    )}

                    {/* 文字描述 */}
                    <div className="min-w-0">
                      <span className="text-[12px] font-medium text-stone-700 block leading-none">{item.title}</span>
                      {slot.status !== "empty" && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] font-medium leading-none mt-1.5",
                            isProcessing && "bg-[#D97757]/10 text-[#B4532F]",
                            isSuccess && "bg-[#6FAA7D]/10 text-[#3F7A4E]",
                            isWarning && "bg-[#D99E55]/10 text-[#8F641B]",
                            isError && "bg-[#C9604D]/10 text-[#B24E3E]"
                          )}
                        >
                          {isProcessing ? "读取中" : isSuccess ? "已识别" : isWarning ? "待核对" : "失败"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮组 */}
                  <div className="flex shrink-0 items-center gap-1">
                    {isError && (
                      <>
                        {onRetry && (
                          <button
                            type="button"
                            onClick={() => onRetry(item.role)}
                            className="inline-flex size-6 items-center justify-center rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 transition-colors"
                            title="重新识别"
                          >
                            <RefreshCw className="size-3" />
                          </button>
                        )}
                        {onManualFill && (
                          <button
                            type="button"
                            onClick={() => onManualFill(item.role)}
                            className="inline-flex h-6 items-center justify-center rounded-lg bg-white px-1.5 text-[12px] font-medium text-stone-700 hover:bg-stone-200 border border-stone-300 transition-colors"
                          >
                            手输
                          </button>
                        )}
                      </>
                    )}
                    {slot.status !== "empty" && !isProcessing && (
                      <button
                        type="button"
                        onClick={() => onDelete(item.role)}
                        className="inline-flex size-6 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-200 hover:text-[#B24E3E] transition-colors"
                        title="删除"
                      >
                        <Trash2 className="size-3 stroke-[1.6]" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 下半部：文件名或解析结果 */}
                <div className="text-[12px] text-stone-500 truncate mt-1">
                  {slot.status === "empty"
                    ? `待上传${item.required ? " (必传)" : ""}`
                    : isProcessing
                      ? "AI 正在分析图片数据..."
                      : slot.fileName || (item.role === "screenshot_1" ? "流量指标图已读取" : "留存完播图已读取")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { SubmissionSlotsSection as 截图槽位区 };
