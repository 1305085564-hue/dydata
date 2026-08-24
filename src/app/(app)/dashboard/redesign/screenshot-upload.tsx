"use client";

import { useState, useCallback } from "react";
import { Upload, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScreenshotSlot {
  role: "cover" | "middle" | "ending";
  file?: File;
  url?: string;
  ocrStatus?: "idle" | "uploading" | "processing" | "success" | "error";
  ocrError?: string;
  ocrData?: {
    play_count?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
}

interface ScreenshotUploadProps {
  slots: ScreenshotSlot[];
  onSlotsChange: (slots: ScreenshotSlot[]) => void;
  onOcrDataExtracted: (data: Record<string, number>) => void;
}

const SLOT_LABELS = {
  cover: "封面截图",
  middle: "中段截图",
  ending: "结尾截图",
};

/**
 * 截图上传区 - 支持 OCR 识别
 * 3 个槽位：封面/中段/结尾
 */
export function ScreenshotUpload({
  slots,
  onSlotsChange,
  onOcrDataExtracted,
}: ScreenshotUploadProps) {
  const handleFileChange = async (
    index: number,
    file: File | null
  ) => {
    if (!file) {
      // 清空槽位
      const newSlots = [...slots];
      newSlots[index] = { role: slots[index].role };
      onSlotsChange(newSlots);
      return;
    }

    // 更新槽位状态为上传中
    const newSlots = [...slots];
    newSlots[index] = {
      ...newSlots[index],
      file,
      url: URL.createObjectURL(file),
      ocrStatus: "uploading",
    };
    onSlotsChange(newSlots);

    try {
      // 上传图片
      const formData = new FormData();
      formData.append("file", file);
      formData.append("role", slots[index].role);

      const uploadResponse = await fetch("/api/dashboard/screenshot", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("上传失败");
      }

      const uploadData = await uploadResponse.json();

      // 更新为 OCR 处理中
      newSlots[index] = {
        ...newSlots[index],
        ocrStatus: "processing",
      };
      onSlotsChange(newSlots);

      // OCR 识别
      const ocrResponse = await fetch("/api/dashboard/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: uploadData.url,
          role: slots[index].role,
        }),
      });

      if (!ocrResponse.ok) {
        throw new Error("OCR 识别失败");
      }

      const ocrData = await ocrResponse.json();

      // 更新为成功
      newSlots[index] = {
        ...newSlots[index],
        ocrStatus: "success",
        ocrData: ocrData.data,
      };
      onSlotsChange(newSlots);

      // 通知父组件提取的数据
      if (ocrData.data) {
        onOcrDataExtracted(ocrData.data);
      }
    } catch (error) {
      // 更新为失败
      newSlots[index] = {
        ...newSlots[index],
        ocrStatus: "error",
        ocrError: error instanceof Error ? error.message : "上传失败",
      };
      onSlotsChange(newSlots);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-[#E5E0D6] bg-white p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium text-[#1C1917]">截图上传</h3>
        <p className="text-[13px] text-[#78716C]">
          上传截图后自动识别数据
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {slots.map((slot, index) => (
          <div key={slot.role} className="space-y-2">
            <label className="block text-sm font-medium text-[#292524]">
              {SLOT_LABELS[slot.role]}
            </label>

            {/* 上传区域 */}
            {!slot.url ? (
              <label
                className={cn(
                  "group flex aspect-video cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all",
                  slot.ocrStatus === "error"
                    ? "border-[#C0685C] bg-[#C0685C]/5"
                    : "border-[#E5E0D6] bg-[#F5F3EE]/50 hover:border-[#D97757] hover:bg-[#D97757]/5"
                )}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    handleFileChange(index, e.target.files?.[0] || null)
                  }
                />
                <Upload
                  size={20}
                  className="mb-2 text-[#78716C] transition-colors group-hover:text-[#D97757]"
                />
                <p className="text-[13px] text-[#78716C]">点击上传</p>
              </label>
            ) : (
              <div className="relative aspect-video overflow-hidden rounded-lg border border-[#E5E0D6]">
                <img
                  src={slot.url}
                  alt={SLOT_LABELS[slot.role]}
                  className="size-full object-cover"
                />

                {/* 状态覆盖层 */}
                {slot.ocrStatus !== "idle" && (
                  <div
                    className={cn(
                      "absolute inset-0 flex items-center justify-center backdrop-blur-sm",
                      slot.ocrStatus === "success" && "bg-[#6FAA7D]/10",
                      slot.ocrStatus === "error" && "bg-[#C0685C]/10",
                      (slot.ocrStatus === "uploading" ||
                        slot.ocrStatus === "processing") &&
                        "bg-black/20"
                    )}
                  >
                    {slot.ocrStatus === "uploading" && (
                      <div className="text-center text-white">
                        <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
                        <p className="text-sm">上传中...</p>
                      </div>
                    )}
                    {slot.ocrStatus === "processing" && (
                      <div className="text-center text-white">
                        <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
                        <p className="text-sm">识别中...</p>
                      </div>
                    )}
                    {slot.ocrStatus === "success" && (
                      <CheckCircle size={24} className="text-[#6FAA7D]" />
                    )}
                    {slot.ocrStatus === "error" && (
                      <AlertCircle size={24} className="text-[#C0685C]" />
                    )}
                  </div>
                )}

                {/* 删除按钮 */}
                <button
                  type="button"
                  onClick={() => handleFileChange(index, null)}
                  className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* OCR 错误提示 */}
            {slot.ocrError && (
              <p className="text-[13px] text-[#C0685C]">{slot.ocrError}</p>
            )}

            {/* OCR 识别结果 */}
            {slot.ocrData && (
              <div className="rounded-lg bg-[#F5F3EE] p-2 text-[12px] text-[#78716C]">
                {slot.ocrData.play_count && (
                  <div>播放: {slot.ocrData.play_count.toLocaleString()}</div>
                )}
                {slot.ocrData.likes && (
                  <div>点赞: {slot.ocrData.likes.toLocaleString()}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
