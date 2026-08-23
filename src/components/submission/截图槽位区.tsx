"use client";

import { useRef, useState } from "react";
import { UploadCloud, Trash2, Eye, RefreshCw, Loader2, Plus, Image as ImageIcon } from "lucide-react";
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
      ocrFallback?: boolean;
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
  shortTitle: string;
  description: string;
  required: boolean;
}> = [
  {
    role: "screenshot_1",
    title: "互动数据",
    shortTitle: "互动截图",
    description: "播放 · 点赞 · 评论 · 转发",
    required: true,
  },
  {
    role: "screenshot_2",
    title: "完播留存",
    shortTitle: "完播截图",
    description: "均播时长 · 完播率 · 留存",
    required: true,
  },
];

export function SubmissionSlotsSection({
  slots,
  onSelectFile,
  onUploadFiles,
  onDelete,
  onRetry,
  onManualFill,
  screenshotsRequired = true,
  focusedRole = null,
  highlightedOcrIndex = null,
}: SubmissionSlotsProps) {
  const [isDragOverGlobal, setIsDragOverGlobal] = useState(false);
  const [dragOverRole, setDragOverRole] = useState<SubmissionSlotRole | null>(null);
  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const slotInputRefs = useRef<Record<SubmissionSlotRole, HTMLInputElement | null>>({
    screenshot_1: null,
    screenshot_2: null,
  });

  const extractImageFiles = (fileList: FileList | null): File[] => {
    if (!fileList) return [];
    const files: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.type.startsWith("image/")) {
        files.push(file);
      }
    }
    return files;
  };

  const handleGlobalFiles = (fileList: FileList | null) => {
    const files = extractImageFiles(fileList);
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
    <div
      onPaste={handlePaste}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOverGlobal(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragOverGlobal(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOverGlobal(false);
        setDragOverRole(null);
        handleGlobalFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col h-full rounded-xl bg-zinc-100/60 p-2 transition-all duration-200",
        isDragOverGlobal
          ? "border-2 border-dashed border-[#D97757] bg-[#D97757]/[0.03] ring-2 ring-[#D97757]/20 shadow-md"
          : "border border-transparent"
      )}
    >
      {/* 隐藏的全局多图选择 input */}
      <input
        ref={globalFileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => {
          handleGlobalFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* 两个槽位上下垂直排布，填满上半区 */}
      <div className="flex flex-col gap-2.5 flex-1 justify-between min-h-0">
        {SLOT_META.map((item) => {
          const slot = slots[item.role];
          const isProcessing = slot.status === "uploading" || slot.status === "recognizing";
          const isWarning =
            slot.status === "pending_confirm" ||
            ((slot.confidenceScore ?? 1) < 0.7 && slot.status !== "failed");
          const isError = slot.status === "failed";
          const isSuccess = slot.status === "confirmed" && !isWarning && !slot.ocrFallback;
          const shouldShowManualFill =
            Boolean(onManualFill) &&
            (isError || slot.ocrFallback || slot.status === "pending_confirm");
          const canRetry =
            Boolean(onRetry) &&
            Boolean(slot.assetUrl) &&
            Boolean((slot as { file?: File | null }).file) &&
            !isProcessing &&
            (isError || slot.ocrFallback || slot.status === "pending_confirm");
          const isSlotDragTarget = dragOverRole === item.role;
          const isFocused = focusedRole === item.role;

          return (
            <div
              key={item.role}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverRole(item.role);
              }}
              onDragLeave={(e) => {
                e.stopPropagation();
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverRole(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverRole(null);
                const files = extractImageFiles(e.dataTransfer.files);
                if (files.length === 1) {
                  onSelectFile(item.role, files[0]);
                } else if (files.length > 1) {
                  onUploadFiles(files);
                }
              }}
              className={cn(
                "relative flex flex-col justify-center flex-1 min-h-[105px] rounded-xl border p-3.5 transition-colors duration-100",
                slot.status === "empty"
                  ? "border-zinc-200/70 bg-white/80 hover:border-[#D97757] hover:bg-white cursor-pointer shadow-2xs"
                  : "border-zinc-200 bg-white shadow-2xs",
                isSlotDragTarget && "border-[#D97757] bg-[#FDF9F7] ring-2 ring-[#D97757]/30",
                isFocused && "border-[#D97757]/80 ring-2 ring-[#D97757]/20 bg-[#FDF9F7]/35",
                isError && "border-[#DC2626]/40 bg-[#FFF9F8]"
              )}
              onClick={() => {
                if (slot.status === "empty") {
                  slotInputRefs.current[item.role]?.click();
                }
              }}
            >
              {/* 隐藏的单槽位 input */}
              <input
                ref={(el) => {
                  slotInputRefs.current[item.role] = el;
                }}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                  const files = extractImageFiles(e.target.files);
                  if (files.length > 0) {
                    onSelectFile(item.role, files[0]);
                  }
                  e.target.value = "";
                }}
              />

              {slot.status === "empty" ? (
                /* 空槽位态：极简图标与标题排版，高度饱满舒适 */
                <div className="flex h-full flex-col justify-center select-none py-1">
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100/90 text-zinc-400 group-hover:text-[#D97757] group-hover:bg-[#D97757]/10 transition-colors">
                        <UploadCloud className="size-5 stroke-[1.75]" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-[13px] font-semibold text-zinc-800 leading-tight">
                          {item.title}截图
                        </div>
                        <div className="text-[11.5px] text-zinc-400 truncate">
                          {item.description}
                        </div>
                      </div>
                    </div>
                    {item.role === "screenshot_1" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          globalFileInputRef.current?.click();
                        }}
                        className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-[#D97757] hover:text-[#C46A4D] hover:underline cursor-pointer shrink-0"
                        title="选择多张截图自动分流"
                      >
                        <Plus className="size-3 stroke-[2.5]" />
                        <span>多选</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* 已上传/识别中/已识别/失败态 */
                <div className="flex h-full flex-col justify-between">
                  {/* 顶栏：标题 + 状态徽标 + 操作按钮 */}
                  <div className="flex items-center justify-between gap-1.5 pb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[12px] font-medium text-zinc-800 truncate">
                        {item.shortTitle}
                      </span>
                      {isProcessing ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#D97757]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#D97757]">
                          <Loader2 className="size-2.5 animate-spin stroke-[2]" />
                          读取中
                        </span>
                      ) : isSuccess ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#16A34A]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#16A34A]">
                          已识别
                        </span>
                      ) : isWarning ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#D99E55]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#D99E55]">
                          待核对
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#DC2626]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#DC2626]">
                          识别失败
                        </span>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 shrink-0">
                      {canRetry && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetry?.(item.role);
                          }}
                          className="inline-flex size-5.5 items-center justify-center rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 transition-colors cursor-pointer"
                          title="重新识别"
                        >
                          <RefreshCw className="size-2.5" />
                        </button>
                      )}
                      {shouldShowManualFill && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onManualFill?.(item.role);
                          }}
                          className="inline-flex h-5.5 items-center justify-center rounded bg-white px-1.5 text-[10.5px] font-medium text-zinc-700 hover:bg-zinc-100 border border-zinc-200 shadow-2xs transition-colors cursor-pointer"
                        >
                          手输
                        </button>
                      )}
                      {!isProcessing && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(item.role);
                          }}
                          className="inline-flex size-5.5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-[#DC2626] transition-colors cursor-pointer"
                          title="删除截图"
                        >
                          <Trash2 className="size-2.5 stroke-[1.6]" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 中间内容：缩略图 + 描述 */}
                  <div className="flex items-center gap-2.5 my-0.5 min-w-0">
                    {slot.assetUrl ? (
                      <Dialog>
                        <DialogTrigger
                          render={
                            <div className="group/preview relative size-11 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 shadow-2xs">
                              <img
                                src={slot.assetUrl}
                                alt={item.title}
                                className="h-full w-full object-cover transition-transform duration-200 group-hover/preview:scale-105"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover/preview:opacity-100 transition-opacity">
                                <Eye className="size-3 text-white stroke-[2]" />
                              </div>
                            </div>
                          }
                        />
                        <DialogContent className="w-auto max-w-4xl overflow-hidden border-none bg-transparent p-0 shadow-none">
                          <DialogTitle className="sr-only">放大预览</DialogTitle>
                          <img
                            src={slot.assetUrl}
                            alt="放大预览"
                            className="h-auto max-h-[85vh] w-full rounded-xl object-contain shadow-2xl"
                          />
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400">
                        <ImageIcon className="size-4.5 stroke-[1.5]" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] font-medium text-zinc-700 truncate leading-tight">
                        {isProcessing
                          ? "AI 正在分析图片指标..."
                          : slot.fileName || (item.role === "screenshot_1" ? "流量指标图" : "留存完播图")}
                      </div>
                      <div className="text-[10.5px] text-zinc-400 truncate mt-0.5">
                        {item.description}
                      </div>
                    </div>
                  </div>

                  {/* 底栏：失败提示或确认说明 */}
                  {(isError || slot.ocrFallback) && (
                    <div className="text-[11px] text-[#C9604D] leading-tight mt-1">
                      {slot.error || "识别失败，截图已保留，请在右侧直接填写"}
                    </div>
                  )}
                  {slot.ocrSummary && slot.ocrSummary.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {slot.ocrSummary.slice(0, 4).map((line, index) => (
                        <span
                          key={`${item.role}-${line}-${index}`}
                          className={cn(
                            "max-w-full truncate rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10.5px] text-zinc-500 transition-colors",
                            isFocused && highlightedOcrIndex === index && "bg-[#D97757]/10 text-[#D97757]",
                          )}
                        >
                          {line}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { SubmissionSlotsSection as 截图槽位区 };
