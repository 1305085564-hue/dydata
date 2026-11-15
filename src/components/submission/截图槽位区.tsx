"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Eye, RefreshCw, Loader2, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScreenshotImage } from "@/components/screenshot/screenshot-image";
import type { SubmissionSlotRole, SubmissionSlotState } from "./提交状态机";
import { extractClipboardImageFiles } from "./截图粘贴";
import { ScreenshotInspector } from "./截图检视器";
import { getUploadProgress } from "@/lib/video-submit-workflow/upload-progress";

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
      startedAt?: number;
      phaseStartedAt?: number;
      finishedAt?: number;
      batchStartedAt?: number;
      itemId?: string;
      screenshotType?: "data" | "curve" | "retention" | null;
    }
  >;
  onSelectFile: (role: SubmissionSlotRole, file: File) => void;
  onUploadFiles: (files: File[]) => void;
  onDelete: (role: SubmissionSlotRole) => void;
  onRetry?: (role: SubmissionSlotRole) => void;
  onManualFill?: (role: SubmissionSlotRole) => void;
  /** true 时显示两张卡片；false 时显示大粘贴区（两张没齐前）。由工作区按「两槽齐过 / 编辑」决定 */
  showCards: boolean;
  screenshotsRequired?: boolean;
  focusedRole?: SubmissionSlotRole | null;
  pulseEmptySlots?: boolean;
}

const SLOT_META: Array<{ role: SubmissionSlotRole; title: string; shortTitle: string }> = [
  { role: "screenshot_1", title: "互动数据", shortTitle: "互动截图" },
  { role: "screenshot_2", title: "完播留存", shortTitle: "完播截图" },
];

const ACCEPT = ".jpg,.jpeg,.png,.webp";

function extractImageFiles(fileList: FileList | null): File[] {
  if (!fileList) return [];
  return Array.from(fileList).filter((file) => file.type.startsWith("image/"));
}

/**
 * 截图区：全页唯一的大入口。类型只由位置定：第一张是互动、第二张是留存。
 * 两张没齐时是一块大粘贴区，提示语只看槽位里有没有图（不等识别）：
 * 空 →「把互动截图粘贴或拖进来」；互动已有 →「请再上传留存截图」。
 * 齐了换成两张固定高度的卡片：点卡片空白处换这一张，点小图看大图。整块高度不变，下方不位移。
 */
export function SubmissionSlotsSection({
  slots,
  onSelectFile,
  onUploadFiles,
  onDelete,
  onRetry,
  onManualFill,
  showCards,
  screenshotsRequired = true,
  focusedRole = null,
  pulseEmptySlots = false,
}: SubmissionSlotsProps) {
  const [isDragOverGlobal, setIsDragOverGlobal] = useState(false);
  const [dragOverRole, setDragOverRole] = useState<SubmissionSlotRole | null>(null);
  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const slotInputRefs = useRef<Record<SubmissionSlotRole, HTMLInputElement | null>>({
    screenshot_1: null,
    screenshot_2: null,
  });
  const [inspectingRole, setInspectingRole] = useState<SubmissionSlotRole | null>(null);
  const triggerRefs = useRef<Record<SubmissionSlotRole, HTMLButtonElement | null>>({
    screenshot_1: null,
    screenshot_2: null,
  });

  const [now, setNow] = useState(() => Date.now());
  const hasActiveSlots = Object.values(slots).some(
    (s) => s.status === "uploading" || s.status === "recognizing",
  );
  useEffect(() => {
    if (!hasActiveSlots) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasActiveSlots]);
  const uploadProgress = getUploadProgress(slots, now);

  const handleImplicitFiles = (files: File[]) => {
    if (files.length === 0) return;
    onUploadFiles(files);
  };

  useEffect(() => {
    const handleDocumentPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      const files = extractClipboardImageFiles(event.clipboardData?.items);
      if (files.length === 0) return;
      event.preventDefault();
      handleImplicitFiles(files);
    };
    document.addEventListener("paste", handleDocumentPaste);
    return () => document.removeEventListener("paste", handleDocumentPaste);
  }, [onUploadFiles]);

  const dataReceived = slots.screenshot_1.status !== "empty";
  const openGlobalPicker = () => globalFileInputRef.current?.click();

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOverGlobal(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOverGlobal(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOverGlobal(false);
        setDragOverRole(null);
        handleImplicitFiles(extractImageFiles(e.dataTransfer.files));
      }}
      className="flex h-[136px] flex-col"
    >
      <input
        ref={globalFileInputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const files = extractImageFiles(e.target.files);
          if (files.length > 0) onUploadFiles(files);
          e.target.value = "";
        }}
      />

      {!showCards ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="粘贴或选择截图"
          title="点击选择，或直接粘贴截图（⌘V / Ctrl+V）"
          onClick={openGlobalPicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openGlobalPicker();
            }
          }}
          className={cn(
            "flex h-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center transition-colors",
            isDragOverGlobal || pulseEmptySlots
              ? "border-[#D97757]/60 bg-[#D97757]/[0.04]"
              : "border-[#D6D3D1] bg-white hover:border-[#78716C]/60",
          )}
        >
          <div className="font-serif text-[20px] leading-tight text-[#141413]">
            {!screenshotsRequired
              ? "作品异常时截图可以不交"
              : dataReceived
                ? "请再上传留存截图"
                : "把互动截图粘贴或拖进来"}
          </div>
          <div className="text-[12px] text-[#78716C] truncate hidden sm:block">
            {dataReceived ? "互动截图已收到" : "一次传两张时，请按互动、留存的顺序上传"}
          </div>
          <span className="inline-flex min-h-[44px] sm:min-h-0 h-8 items-center rounded-md bg-[#D97757] px-4 text-[14px] text-white">
            选择截图
          </span>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {SLOT_META.map((item) => {
            const slot = slots[item.role];
            const isEmpty = slot.status === "empty";
            const isUploading = slot.status === "uploading";
            const isRecognizing = slot.status === "recognizing";
            const isProcessing = isUploading || isRecognizing;
            const hasImage = Boolean(slot.assetUrl || slot.previewUrl);
            // 只要有图，哪怕识别有缺失，也归为待核对，不亮红灯误导用户重传
            const isError = slot.status === "failed" && !hasImage;
            const isWarning =
              hasImage &&
              (slot.status === "pending_confirm" ||
                Boolean(slot.ocrFallback) ||
                ((slot.confidenceScore ?? 1) < 0.7 && slot.status !== "failed"));
            const needsAction = isError || Boolean(slot.ocrFallback) || slot.status === "pending_confirm" || slot.status === "failed";
            const canRetry = Boolean(onRetry) && Boolean(slot.assetUrl) && Boolean((slot as { file?: File | null }).file) && !isProcessing && needsAction;
            const elapsed = Math.max(1, Math.round((uploadProgress[item.role]?.elapsedMs ?? 0) / 1000));
            const isLongWaiting = Boolean(uploadProgress[item.role]?.isLongWaiting);

            const statusText = isUploading
              ? "上传中…"
              : isRecognizing
                ? isLongWaiting
                  ? `识别中，已等 ${elapsed} 秒，可以先填文案`
                  : "识别中…"
                : isError
                  ? slot.error || "未识别到图片内容，请点击重新上传"
                  : slot.ocrFallback
                    ? slot.error ? `${slot.error} · 数字请手填` : "这张没认出来，数字请手填"
                    : isWarning
                      ? slot.error ? `${slot.error} · 请核对下方数字` : "已识别，有几项请核对"
                      : "已识别";

            return (
              <div
                key={item.role}
                role="button"
                tabIndex={0}
                aria-label={isEmpty ? `${item.title}截图，点击选择文件` : `${item.title}截图，点击换一张`}
                title={isEmpty ? "点击上传，或直接粘贴截图（⌘V / Ctrl+V）" : "点击换一张；点小图看大图"}
                onClick={() => slotInputRefs.current[item.role]?.click()}
                onKeyDown={(e) => {
                  // 只响应卡片本身，卡片里的小图、删除等按钮各管各的
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    slotInputRefs.current[item.role]?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverRole(item.role);
                }}
                onDragLeave={(e) => {
                  e.stopPropagation();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverRole(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverRole(null);
                  const files = extractImageFiles(e.dataTransfer.files);
                  if (files.length === 1) onSelectFile(item.role, files[0]);
                  else if (files.length > 1) onUploadFiles(files);
                }}
                className={cn(
                  "group relative flex min-h-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border px-3 transition-colors",
                  isEmpty
                    ? pulseEmptySlots
                      ? "border-dashed border-[#D97757]/60 bg-[#D97757]/[0.04]"
                      : "border-dashed border-[#D6D3D1] bg-white hover:border-[#78716C]/60"
                    : "border-[#E2E2DF] bg-white hover:border-[#78716C]/60",
                  dragOverRole === item.role && "border-[#78716C] bg-[#EBEBE9]",
                  focusedRole === item.role && "border-[#78716C]/80 bg-[#F7F7F6]",
                  isError && "border-status-danger/40 bg-status-danger/[0.04]",
                )}
              >
                <input
                  ref={(el) => {
                    slotInputRefs.current[item.role] = el;
                  }}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const files = extractImageFiles(e.target.files);
                    if (files.length > 0) onSelectFile(item.role, files[0]);
                    e.target.value = "";
                  }}
                />

                {slot.assetUrl ? (
                  <button
                    ref={(el) => {
                      triggerRefs.current[item.role] = el;
                    }}
                    type="button"
                    data-slot-trigger={item.role}
                    onClick={(e) => {
                      e.stopPropagation();
                      setInspectingRole(item.role);
                    }}
                    className="group/preview relative size-10 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-[#E2E2DF] bg-[#F1F1F0] outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/20"
                    title="点击同屏核对原图"
                    aria-label={`同屏核对${item.title}原图`}
                  >
                    <ScreenshotImage
                      src={slot.assetUrl}
                      alt={item.title}
                      variant="thumb"
                      data-submission-slot-role={item.role}
                      data-slot-asset-url={slot.assetUrl}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover/preview:opacity-100">
                      <Eye className="size-3 text-white" />
                    </span>
                  </button>
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[#F1F1F0] text-[#78716C]">
                    {isProcessing ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4 stroke-[1.5]" />}
                  </span>
                )}

                <div className="min-w-0 flex-1" aria-live="polite">
                  <div className="text-[14px] text-[#1F1E1D] truncate">{item.shortTitle}</div>
                  <div
                    className={cn(
                      "text-[12px] truncate",
                      isError ? "text-status-danger" : isWarning || slot.ocrFallback ? "text-status-warning-text" : "text-[#78716C]",
                    )}
                    title={slot.error ?? undefined}
                  >
                    {isEmpty
                      ? screenshotsRequired
                        ? "还差这张 · 点击选择，或直接粘贴"
                        : "作品异常时可以不交"
                      : statusText}
                  </div>
                </div>

                {!isEmpty && (
                  <div className="flex shrink-0 items-center gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    {canRetry && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRetry?.(item.role);
                        }}
                        aria-label={`重新识别${item.shortTitle}`}
                        title="重新识别"
                        className="inline-flex size-9 sm:size-7 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] cursor-pointer"
                      >
                        <RefreshCw className="size-3.5" />
                      </button>
                    )}
                    {onManualFill && needsAction && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onManualFill(item.role);
                        }}
                        aria-label={`手动填写${item.shortTitle}指标`}
                        className="inline-flex min-h-[44px] sm:min-h-0 h-7 items-center rounded-md px-2 text-[12px] text-[#1F1E1D] hover:bg-[#EBEBE9] cursor-pointer"
                      >
                        手填
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
                        title="删除截图"
                        className="inline-flex size-9 sm:size-7 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-status-danger cursor-pointer"
                      >
                        <Trash2 className="size-3.5 stroke-[1.6]" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {inspectingRole && slots[inspectingRole]?.assetUrl && (
        <ScreenshotInspector
          url={slots[inspectingRole]!.assetUrl!}
          label={`${SLOT_META.find((s) => s.role === inspectingRole)?.shortTitle || "截图"} · 同屏核对`}
          onClose={() => setInspectingRole(null)}
          onReturnFocus={() => triggerRefs.current[inspectingRole]?.focus()}
          extraActions={SLOT_META.filter(
            (s) => s.role !== inspectingRole && Boolean(slots[s.role]?.assetUrl),
          ).map((s) => (
            <button
              key={s.role}
              type="button"
              onClick={() => setInspectingRole(s.role)}
              className="rounded-md border border-[#E2E2DF] bg-white px-2 py-0.5 text-[12px] text-[#1F1E1D] hover:bg-[#EBEBE9] cursor-pointer"
              title={`切换查看${s.shortTitle}`}
            >
              看{s.shortTitle.slice(0, 2)}
            </button>
          ))}
        />
      )}

    </div>
  );
}

export { SubmissionSlotsSection as 截图槽位区 };
