"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, Trash2, Eye, RefreshCw, Loader2, Plus, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubmissionSlotRole, SubmissionSlotState } from "./提交状态机";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { extractClipboardImageFiles, isEditablePasteTarget } from "./截图粘贴";

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
  screenshotsRequired: _screenshotsRequired = true,
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

  useEffect(() => {
    const handleDocumentPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || isEditablePasteTarget(event.target)) return;

      const files = extractClipboardImageFiles(event.clipboardData?.items);
      if (files.length === 0) return;

      event.preventDefault();
      onUploadFiles(files);
    };

    document.addEventListener("paste", handleDocumentPaste);
    return () => document.removeEventListener("paste", handleDocumentPaste);
  }, [onUploadFiles]);

  return (
    <div
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
        "flex flex-col h-full rounded-xl transition-all duration-200",
        isDragOverGlobal
          ? "border-2 border-dashed border-[#D97757] bg-[#D97757]/[0.03] ring-2 ring-[#D97757]/20 shadow-sm p-1.5"
          : ""
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

      {/* 两个槽位在移动端横向并排，在桌面端垂直排布 */}
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:flex lg:flex-col lg:gap-2.5 lg:justify-between flex-1 min-h-0">
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
                "group relative flex flex-col justify-center flex-1 min-h-[58px] sm:min-h-[64px] lg:min-h-[105px] rounded-xl border p-2 sm:p-2.5 lg:p-3.5 transition-all duration-150",
                slot.status === "empty"
                  ? "border-dashed border-[#ECE7DE] bg-[#FAF8F4]/40 hover:border-[#D97757]/60 hover:bg-[#FAF8F4] cursor-pointer shadow-2xs hover:shadow-sm"
                  : "border-[#ECE7DE] bg-white shadow-2xs",
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
                <div className="flex h-full flex-col justify-center select-none py-0.5 sm:py-1">
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2.5">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className="flex size-7.5 sm:size-8.5 lg:size-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-[#F5F3EE]/90 text-[#78716C] group-hover:text-[#D97757] group-hover:bg-[#D97757]/10 transition-colors">
                        <UploadCloud className="size-4 sm:size-4.5 lg:size-5 stroke-[1.75]" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-[12px] sm:text-[13px] font-semibold text-[#292524] leading-tight truncate">
                          <span className="lg:hidden">{item.shortTitle}</span>
                          <span className="hidden lg:inline">{item.title}截图</span>
                        </div>
                        <div className="text-[10.5px] sm:text-[11.5px] text-[#78716C] truncate hidden sm:block">
                          <span className="group-hover:hidden">{item.description}</span>
                          <span className="hidden group-hover:inline text-[#D97757]">
                            也可直接 ⌘V / Ctrl+V
                          </span>
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
                        className="inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 lg:min-h-0 lg:min-w-0 lg:px-0 lg:py-0 items-center justify-center lg:justify-start gap-0.5 text-[11px] sm:text-[12px] lg:text-[11.5px] font-medium text-[#D97757] hover:text-[#C46A4D] hover:underline cursor-pointer shrink-0 py-0.5 px-1.5"
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
                  <div className="flex items-center justify-between gap-1 lg:gap-1.5 pb-0.5">
                    <div className="flex items-center gap-1 lg:gap-1.5 min-w-0">
                      <span className="text-[11.5px] sm:text-[12px] font-medium text-[#292524] truncate">
                        {item.shortTitle}
                      </span>
                      {isProcessing ? (
                        <span className="inline-flex items-center gap-0.5 lg:gap-1 rounded-full bg-[#D97757]/10 px-1.5 py-0.2 lg:py-0.5 text-[10px] sm:text-[11px] font-medium text-[#D97757]">
                          <Loader2 className="size-2 lg:size-2.5 animate-spin stroke-[2]" />
                          读取中
                        </span>
                      ) : isSuccess ? (
                        <span className="inline-flex items-center gap-0.5 lg:gap-1 rounded-full bg-[#6FAA7D]/10 px-1.5 py-0.2 lg:py-0.5 text-[10px] sm:text-[11px] font-medium text-[#6FAA7D]">
                          已识别
                        </span>
                      ) : isWarning ? (
                        <span className="inline-flex items-center gap-0.5 lg:gap-1 rounded-full bg-[#D99E55]/10 px-1.5 py-0.2 lg:py-0.5 text-[10px] sm:text-[11px] font-medium text-[#D99E55]">
                          待核对
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 lg:gap-1 rounded-full bg-[#C0685C]/10 px-1.5 py-0.2 lg:py-0.5 text-[10px] sm:text-[11px] font-medium text-[#C0685C]">
                          失败
                        </span>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-0.5 lg:gap-1 shrink-0">
                      {canRetry && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetry?.(item.role);
                          }}
                          className="inline-flex size-7 sm:size-5.5 min-h-[28px] min-w-[28px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded bg-[#F5F3EE] hover:bg-[#ECE7DE] text-[#292524] border border-[#ECE7DE] transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
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
                          className="inline-flex h-7 sm:h-5.5 min-h-[28px] sm:min-h-0 lg:text-[10.5px] items-center justify-center rounded bg-white px-1.5 text-[10px] sm:text-[11px] font-medium text-[#292524] hover:bg-[#F5F3EE] border border-[#ECE7DE] shadow-2xs transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
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
                          className="inline-flex size-7 sm:size-5.5 min-h-[28px] min-w-[28px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#C0685C] transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
                          title="删除截图"
                        >
                          <Trash2 className="size-2.5 stroke-[1.6]" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 中间内容：缩略图 + 描述 */}
                  <div className="flex items-center gap-2 lg:gap-2.5 my-0.5 min-w-0">
                    {slot.assetUrl ? (
                      <Dialog>
                        <DialogTrigger
                          render={
                            <div className="group/preview relative size-8 sm:size-9 lg:size-11 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-[#E5E0D6] bg-[#F5F3EE] shadow-2xs">
                              <img
                                src={slot.assetUrl}
                                alt={item.title}
                                className="h-full w-full object-cover transition-transform duration-200 group-hover/preview:scale-105"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover/preview:opacity-100 transition-opacity">
                                <Eye className="size-2.5 sm:size-3 text-white stroke-[2]" />
                              </div>
                            </div>
                          }
                        />
                        <DialogContent className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden border-none bg-transparent p-0 shadow-none">
                          <DialogTitle className="sr-only">放大预览</DialogTitle>
                          <img
                            src={slot.assetUrl}
                            alt="放大预览"
                            className="h-auto max-h-[calc(100dvh-2rem)] w-full rounded-xl object-contain shadow-claude-dialog"
                          />
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <div className="flex size-8 sm:size-9 lg:size-10 shrink-0 items-center justify-center rounded-lg bg-[#F5F3EE] text-[#78716C]">
                        <ImageIcon className="size-3.5 sm:size-4 lg:size-4.5 stroke-[1.5]" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] sm:text-[11.5px] font-medium text-[#292524] truncate leading-tight">
                        {isProcessing
                          ? <><span className="lg:hidden">AI 分析中...</span><span className="hidden lg:inline">AI 正在分析图片指标...</span></>
                          : slot.fileName || <><span className="lg:hidden">{item.role === "screenshot_1" ? "流量图" : "留存图"}</span><span className="hidden lg:inline">{item.role === "screenshot_1" ? "流量指标图" : "留存完播图"}</span></>}
                      </div>
                      <div className="text-[10px] sm:text-[10.5px] text-[#78716C] truncate mt-0.5 hidden xs:block">
                        {item.description}
                      </div>
                    </div>
                  </div>

                  {/* 底栏：失败提示或确认说明 */}
                  {(isError || slot.ocrFallback) && (
                    <div className="text-[10.5px] sm:text-[11px] text-[#C9604D] leading-tight mt-0.5 lg:mt-1 truncate lg:whitespace-normal lg:overflow-visible lg:text-clip">
                      {slot.error || <><span className="lg:hidden">识别失败，请手输</span><span className="hidden lg:inline">识别失败，截图已保留，请在右侧直接填写</span></>}
                    </div>
                  )}
                  {slot.ocrSummary && slot.ocrSummary.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {slot.ocrSummary.slice(0, 4).map((line, index) => (
                        <span
                          key={`${item.role}-${line}-${index}`}
                          className={cn(
                            "max-w-full truncate rounded-md bg-[#F5F3EE] px-1.5 py-0.5 text-[10.5px] text-[#78716C] transition-colors",
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
