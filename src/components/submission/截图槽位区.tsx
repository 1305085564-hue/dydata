"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, Trash2, Eye, RefreshCw, Loader2, Plus, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubmissionSlotRole, SubmissionSlotState } from "./提交状态机";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { extractClipboardImageFiles, isEditablePasteTarget } from "./截图粘贴";
import { shouldRequestScreenshotReplacement } from "@/app/(app)/dashboard/video-submit-form-state";

interface SubmissionSlotsProps {
  slots: Record<
    SubmissionSlotRole,
    SubmissionSlotState & {
      fileName?: string;
      error?: string | null;
      assetUrl?: string | null;
      previewUrl?: string | null;
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
  pulseEmptySlots?: boolean;
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
  pulseEmptySlots = false,
}: SubmissionSlotsProps) {
  const [isDragOverGlobal, setIsDragOverGlobal] = useState(false);
  const [dragOverRole, setDragOverRole] = useState<SubmissionSlotRole | null>(null);
  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const latestSlotsRef = useRef(slots);
  const [pendingReplacementFile, setPendingReplacementFile] = useState<File | null>(null);
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

  useEffect(() => {
    latestSlotsRef.current = slots;
  }, [slots]);

  const handleImplicitFiles = (files: File[]) => {
    if (files.length === 0) return;
    if (shouldRequestScreenshotReplacement(latestSlotsRef.current, files.length)) {
      setPendingReplacementFile(files[0]);
      return;
    }
    onUploadFiles(files);
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
      handleImplicitFiles(files);
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
        handleImplicitFiles(extractImageFiles(e.dataTransfer.files));
      }}
      className={cn(
        "flex flex-col h-full rounded-xl transition-all duration-200",
        isDragOverGlobal
          ? "border-2 border-dashed border-[#D97757] bg-[#D97757]/[0.03] ring-2 ring-[#D97757]/20 shadow-input p-1.5"
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
      <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-col lg:justify-between flex-1 min-h-0">
        {SLOT_META.map((item) => {
          const slot = slots[item.role];
          const isProcessing = slot.status === "uploading" || slot.status === "recognizing";
          // 只要有图，哪怕 OCR 解析有缺失或置信度不高，也归为待核对，绝不亮红灯误导用户重传
          const hasImage = Boolean(slot.assetUrl || slot.previewUrl);
          const isWarning =
            hasImage &&
            (slot.status === "pending_confirm" ||
              Boolean(slot.ocrFallback) ||
              ((slot.confidenceScore ?? 1) < 0.7 && slot.status !== "failed"));
          // 仅在完全没有成功上传图片或无图可用时才算真正错误
          const isError = slot.status === "failed" && !hasImage;
          const isSuccess = (slot.status === "confirmed" || (slot.status === "pending_confirm" && !slot.ocrFallback)) && !isWarning && !isError;
          const shouldShowManualFill =
            Boolean(onManualFill) &&
            (isError || slot.ocrFallback || slot.status === "pending_confirm" || slot.status === "failed");
          const canRetry =
            Boolean(onRetry) &&
            Boolean(slot.assetUrl) &&
            Boolean((slot as { file?: File | null }).file) &&
            !isProcessing &&
            (isError || slot.ocrFallback || slot.status === "pending_confirm" || slot.status === "failed");
          const isSlotDragTarget = dragOverRole === item.role;
          const isFocused = focusedRole === item.role;

          return (
            <div
              key={item.role}
              role={slot.status === "empty" ? "button" : undefined}
              tabIndex={slot.status === "empty" ? 0 : undefined}
              aria-label={slot.status === "empty" ? `${item.title}截图，点击选择文件` : undefined}
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
                "group relative flex flex-col justify-center flex-1 min-h-[58px] sm:min-h-[64px] lg:min-h-[104px] lg:h-[104px] rounded-xl border p-2 sm:p-2.5 lg:p-3.5 transition-all duration-300",
                slot.status === "empty"
                  ? pulseEmptySlots
                    ? "border-[#D97757]/70 bg-[#D97757]/[0.04] ring-2 ring-[#D97757]/20 cursor-pointer shadow-input"
                    : "border border-[#E2E2DF]/60 bg-[#F1F1F0] hover:bg-[#EBEBE9] hover:border-[#78716C]/40 cursor-pointer shadow-input"
                  : "border-[#E2E2DF] bg-white shadow-input",
                isSlotDragTarget && "border-[#78716C] bg-[#EBEBE9] ring-2 ring-[#78716C]/20",
                isFocused && "border-[#78716C]/80 ring-2 ring-[#78716C]/20 bg-[#EBEBE9]/40",
                isError && "border-status-danger/40 bg-status-danger/[0.06]"
              )}
              onClick={() => {
                if (slot.status === "empty") {
                  slotInputRefs.current[item.role]?.click();
                }
              }}
              onKeyDown={(e) => {
                if (slot.status !== "empty") return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
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
                /* 空槽位态：发丝下沉微槽与暖墨单线图标，弱化未上传视觉重量 */
                <div className="flex h-full flex-col justify-center select-none py-0.5 sm:py-1">
                  <div className="flex items-center justify-between gap-1 sm:gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className={cn(
                        "flex size-7.5 sm:size-8.5 lg:size-10 shrink-0 items-center justify-center rounded-md sm:rounded-xl transition-colors",
                        pulseEmptySlots
                          ? "bg-[#D97757]/10 text-[#D97757]"
                          : "bg-[#EBEBE9] text-[#78716C] group-hover:text-[#141413] group-hover:bg-[#E4E4E1]"
                      )}>
                        <UploadCloud className={cn(
                          "size-4 sm:size-4.5 lg:size-5 stroke-[1.5]",
                          pulseEmptySlots
                            ? "stroke-[#D97757]"
                            : "stroke-[#78716C] group-hover:stroke-[#141413]"
                        )} />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-[12px] sm:text-[13px] font-normal text-[#1F1E1D] leading-tight truncate">
                          <span className="lg:hidden">{item.shortTitle}</span>
                          <span className="hidden lg:inline">{item.title}截图</span>
                          {!screenshotsRequired && (
                            <span className="ml-1 rounded-full bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] font-normal text-[#78716C]">
                              选填
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] sm:text-[12px] text-[#78716C] truncate hidden sm:block">
                          <span className="group-hover:hidden">
                            {!screenshotsRequired ? "异常提交可不带截图" : item.description}
                          </span>
                          <span className="hidden group-hover:inline text-[#1F1E1D]">
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
                        className="inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 lg:min-h-0 lg:min-w-0 lg:px-0 lg:py-0 items-center justify-center lg:justify-start gap-0.5 text-[12px] font-normal text-[#78716C] hover:text-[#141413] hover:underline cursor-pointer shrink-0 py-0.5 px-1.5"
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
                  <div className="flex items-center justify-between gap-1 pb-0.5">
                    <div className="flex items-center gap-1 min-w-0" aria-live="polite">
                      <span className="text-[12px] font-normal text-[#1F1E1D] truncate">
                        {item.shortTitle}
                      </span>
                      {isProcessing ? (
                        <Badge variant="warning" className="gap-0.5">
                          <Loader2 className="size-2.5 animate-spin stroke-[2]" />
                          读取中
                        </Badge>
                      ) : isSuccess ? (
                        <Badge variant="success" className="gap-0.5">
                          已识别
                        </Badge>
                      ) : isWarning ? (
                        <Badge variant="warning" className="gap-0.5">
                          待核对
                        </Badge>
                      ) : (
                        <Badge variant="danger" className="gap-0.5">
                          失败
                        </Badge>
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
                          aria-label={`重新识别${item.shortTitle}`}
                          className="hidden sm:inline-flex sm:size-5.5 items-center justify-center rounded-md bg-[#F1F1F0] hover:bg-[#EBEBE9] text-[#1F1E1D] border border-[#E2E2DF] transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
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
                          aria-label={`手动填写${item.shortTitle}指标`}
                          className="inline-flex h-7 sm:h-5.5 min-h-[28px] sm:min-h-0 items-center justify-center rounded-md bg-white px-1.5 text-[12px] font-normal text-[#1F1E1D] hover:bg-[#EBEBE9] border border-[#E2E2DF] shadow-input transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
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
                          aria-label={`删除${item.shortTitle}`}
                          className="inline-flex size-9 sm:size-5.5 min-h-9 min-w-9 sm:min-h-0 sm:min-w-0 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-status-danger transition-colors active:scale-[0.99] active:duration-120 cursor-pointer"
                          title="删除截图"
                        >
                          <Trash2 className="size-2.5 stroke-[1.6]" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 中间内容：缩略图 + 描述 */}
                  <div className="flex items-center gap-2 my-0.5 min-w-0">
                    {slot.assetUrl ? (
                      <Dialog>
                        <DialogTrigger
                          render={
                            <div className="group/preview relative size-8 sm:size-9 lg:size-11 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-[#E2E2DF] bg-[#F1F1F0] shadow-input">
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
                        <DialogContent className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden border-none bg-transparent p-0 shadow-none ring-0">
                          <DialogTitle className="sr-only">放大预览</DialogTitle>
                          <img
                            src={slot.assetUrl}
                            alt="放大预览"
                            className="h-auto max-h-[calc(100dvh-2rem)] w-full rounded-xl object-contain shadow-claude-dialog"
                          />
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <div className="flex size-8 sm:size-9 lg:size-10 shrink-0 items-center justify-center rounded-md bg-[#F1F1F0] text-[#78716C]">
                        <ImageIcon className="size-3.5 sm:size-4 lg:size-4.5 stroke-[1.5]" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-normal text-[#1F1E1D] truncate leading-tight">
                        {isProcessing
                          ? <><span className="lg:hidden">AI 分析中...</span><span className="hidden lg:inline">AI 正在分析图片指标...</span></>
                          : slot.fileName || <><span className="lg:hidden">{item.role === "screenshot_1" ? "流量图" : "留存图"}</span><span className="hidden lg:inline">{item.role === "screenshot_1" ? "流量指标图" : "留存完播图"}</span></>}
                      </div>
                      <div className="text-[12px] text-[#78716C] truncate mt-0.5 hidden xs:block">
                        {item.description}
                      </div>
                    </div>
                  </div>

                  {/* 底栏：核对提示与引导说明 */}
                  {(isWarning || isError || slot.ocrFallback) && (
                    <div className={cn(
                      "text-[12px] leading-tight mt-1 truncate lg:whitespace-normal lg:overflow-visible lg:text-clip",
                      isError ? "text-status-danger" : "text-[#78716C]"
                    )} title={slot.error ?? undefined}>
                      {isError ? (
                        slot.error || "未识别到图片内容，请点击重新上传"
                      ) : slot.error ? (
                        <><span className="lg:hidden">{slot.error}</span><span className="hidden lg:inline">{slot.error} · 请核对右侧指标</span></>
                      ) : (
                        <><span className="lg:hidden">已就位，请核对右侧指标</span><span className="hidden lg:inline">截图已就位，请核对右侧指标</span></>
                      )}
                    </div>
                  )}

                  {/* 识别摘要行：提供焦点到截图的证据链高亮 */}
                  {slot.ocrSummary && slot.ocrSummary.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {slot.ocrSummary.slice(0, 4).map((line, index) => {
                        const isHighlighted = isFocused && highlightedOcrIndex === index;
                        return (
                          <span
                            key={`${item.role}-${line}-${index}`}
                            className={cn(
                              "max-w-full truncate rounded-md px-1.5 py-0.5 text-[12px] transition-colors duration-150",
                              isHighlighted
                                ? "bg-[#D97757]/15 text-[#D97757] ring-1 ring-[#D97757]/30"
                                : "bg-[#F1F1F0] text-[#78716C]",
                            )}
                          >
                            {line}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog
        open={pendingReplacementFile !== null}
        onOpenChange={(open) => !open && setPendingReplacementFile(null)}
      >
        <DialogContent className="max-w-md rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog">
          <DialogHeader>
            <DialogTitle>这张要替换哪张？</DialogTitle>
            <DialogDescription>
              选好后会直接覆盖对应截图，并重新上传和识别。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const file = pendingReplacementFile;
                setPendingReplacementFile(null);
                if (file) onSelectFile("screenshot_1", file);
              }}
            >
              互动截图
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() => {
                const file = pendingReplacementFile;
                setPendingReplacementFile(null);
                if (file) onSelectFile("screenshot_2", file);
              }}
            >
              完播截图
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingReplacementFile(null)}
            >
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { SubmissionSlotsSection as 截图槽位区 };
