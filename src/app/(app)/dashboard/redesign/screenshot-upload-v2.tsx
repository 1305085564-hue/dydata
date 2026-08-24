"use client";

import { useCallback } from "react";
import { Upload, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOcrUpload } from "@/lib/dashboard-logic/use-ocr-upload";
import type { SubmissionSlotRole } from "@/lib/dashboard-logic/use-video-submit-form";

interface ScreenshotUploadV2Props {
  onOcrDataExtracted: (role: SubmissionSlotRole, data: Record<string, number>) => void;
}

const SLOT_CONFIG = {
  screenshot_1: {
    label: "完播截图",
    description: "识别播放量、完播率、平均播放时长",
    fields: ["play_count", "completion_rate", "avg_play_duration"],
  },
  screenshot_2: {
    label: "互动截图",
    description: "识别点赞、评论、转发、收藏数",
    fields: ["likes", "comments", "shares", "favorites"],
  },
} as const;

/**
 * 截图上传区 v2 - 修正为 2 个槽位
 * screenshot_1: 完播截图
 * screenshot_2: 互动截图
 */
export function ScreenshotUploadV2({ onOcrDataExtracted }: ScreenshotUploadV2Props) {
  const ocr = useOcrUpload({
    onOcrSuccess: (role, data) => {
      onOcrDataExtracted(role, data);
    },
  });

  const handleFileChange = useCallback(
    (role: SubmissionSlotRole, file: File | null) => {
      if (!file) {
        ocr.clearSlot(role);
        return;
      }
      ocr.uploadAndRecognize(role, file);
    },
    [ocr]
  );

  return (
    <div className="space-y-4 rounded-2xl border border-[#E5E0D6] bg-white p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium text-[#1C1917]">截图上传</h3>
        <p className="text-[13px] text-[#78716C]">
          上传截图后自动识别数据
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(["screenshot_1", "screenshot_2"] as const).map((role) => {
          const config = SLOT_CONFIG[role];
          const slot = ocr.slots[role];

          return (
            <div key={role} className="space-y-2">
              <div>
                <label className="block text-sm font-medium text-[#292524]">
                  {config.label}
                </label>
                <p className="text-[12px] text-[#78716C]">{config.description}</p>
              </div>

              {/* 上传区域 */}
              {!slot.previewUrl ? (
                <label
                  className={cn(
                    "group flex aspect-video cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all",
                    slot.status === "error"
                      ? "border-[#C0685C] bg-[#C0685C]/5"
                      : "border-[#E5E0D6] bg-[#F5F3EE]/50 hover:border-[#D97757] hover:bg-[#D97757]/5"
                  )}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      handleFileChange(role, e.target.files?.[0] || null)
                    }
                  />
                  <Upload
                    size={20}
                    className="mb-2 text-[#78716C] transition-colors group-hover:text-[#D97757]"
                  />
                  <p className="text-[13px] text-[#78716C]">点击上传截图</p>
                </label>
              ) : (
                <div className="relative aspect-video overflow-hidden rounded-lg border border-[#E5E0D6]">
                  <img
                    src={slot.previewUrl}
                    alt={config.label}
                    className="size-full object-cover"
                  />

                  {/* 状态覆盖层 */}
                  {slot.status !== "idle" && slot.status !== "success" && (
                    <div
                      className={cn(
                        "absolute inset-0 flex items-center justify-center backdrop-blur-sm",
                        slot.status === "error" && "bg-[#C0685C]/10",
                        (slot.status === "uploading" ||
                          slot.status === "processing") &&
                          "bg-black/20"
                      )}
                    >
                      {slot.status === "uploading" && (
                        <div className="text-center text-white">
                          <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
                          <p className="text-sm">上传中...</p>
                        </div>
                      )}
                      {slot.status === "processing" && (
                        <div className="text-center text-white">
                          <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
                          <p className="text-sm">识别中...</p>
                        </div>
                      )}
                      {slot.status === "error" && (
                        <div className="text-center">
                          <AlertCircle size={24} className="mx-auto mb-2 text-[#C0685C]" />
                          <p className="text-sm text-[#C0685C]">
                            {slot.error || "识别失败"}
                          </p>
                          <button
                            type="button"
                            onClick={() => ocr.retry(role)}
                            className="mt-2 text-sm text-[#D97757] underline"
                          >
                            重试
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 成功标记 */}
                  {slot.status === "success" && (
                    <div className="absolute right-2 top-2 rounded-full bg-[#6FAA7D] p-1">
                      <CheckCircle size={16} className="text-white" />
                    </div>
                  )}

                  {/* 删除按钮 */}
                  <button
                    type="button"
                    onClick={() => handleFileChange(role, null)}
                    className="absolute left-2 top-2 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* OCR 识别结果 */}
              {slot.recognizedData && (
                <div className="rounded-lg bg-[#6FAA7D]/5 p-3 text-[12px] text-[#6FAA7D]">
                  <p className="mb-1 font-medium">已识别数据：</p>
                  {Object.entries(slot.recognizedData).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span>{key}:</span>
                      <span className="tabular-nums">{value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
