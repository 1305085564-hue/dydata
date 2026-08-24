/**
 * OCR 截图上传逻辑 Hook - 从 Antigravity 提取
 * 管理截图上传、OCR 识别的状态机
 */

import { useState, useCallback } from "react";
import type { SubmissionSlotRole } from "./use-video-submit-form";

export type OcrUploadStatus = "idle" | "uploading" | "processing" | "success" | "error";

export interface OcrSlotState {
  role: SubmissionSlotRole;
  status: OcrUploadStatus;
  file?: File;
  previewUrl?: string;
  assetUrl?: string;
  error?: string;
  recognizedData?: Record<string, number>;
}

export interface UseOcrUploadOptions {
  onOcrSuccess?: (role: SubmissionSlotRole, data: Record<string, number>) => void;
  onOcrError?: (role: SubmissionSlotRole, error: string) => void;
}

/**
 * OCR 上传核心逻辑
 */
export function useOcrUpload(options: UseOcrUploadOptions = {}) {
  const [slots, setSlots] = useState<Record<SubmissionSlotRole, OcrSlotState>>({
    screenshot_1: { role: "screenshot_1", status: "idle" },
    screenshot_2: { role: "screenshot_2", status: "idle" },
  });

  // 开始上传
  const startUpload = useCallback((role: SubmissionSlotRole, file: File) => {
    setSlots((prev) => ({
      ...prev,
      [role]: {
        role,
        status: "uploading",
        file,
        previewUrl: URL.createObjectURL(file),
      },
    }));
  }, []);

  // 上传成功，开始 OCR 处理
  const uploadSuccess = useCallback((role: SubmissionSlotRole, assetUrl: string) => {
    setSlots((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        status: "processing",
        assetUrl,
      },
    }));
  }, []);

  // OCR 识别成功
  const ocrSuccess = useCallback(
    (role: SubmissionSlotRole, recognizedData: Record<string, number>) => {
      setSlots((prev) => ({
        ...prev,
        [role]: {
          ...prev[role],
          status: "success",
          recognizedData,
          error: undefined,
        },
      }));

      options.onOcrSuccess?.(role, recognizedData);
    },
    [options]
  );

  // 失败
  const fail = useCallback(
    (role: SubmissionSlotRole, error: string) => {
      setSlots((prev) => ({
        ...prev,
        [role]: {
          ...prev[role],
          status: "error",
          error,
        },
      }));

      options.onOcrError?.(role, error);
    },
    [options]
  );

  // 清空槽位
  const clearSlot = useCallback((role: SubmissionSlotRole) => {
    setSlots((prev) => ({
      ...prev,
      [role]: { role, status: "idle" },
    }));
  }, []);

  // 完整上传流程
  const uploadAndRecognize = useCallback(
    async (role: SubmissionSlotRole, file: File) => {
      startUpload(role, file);

      try {
        // 1. 上传图片
        const formData = new FormData();
        formData.append("file", file);
        formData.append("role", role);

        const uploadResponse = await fetch("/api/dashboard/screenshot", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error("图片上传失败");
        }

        const uploadData = await uploadResponse.json();
        uploadSuccess(role, uploadData.url);

        // 2. OCR 识别
        const ocrResponse = await fetch("/api/dashboard/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: uploadData.url,
            role,
          }),
        });

        if (!ocrResponse.ok) {
          throw new Error("OCR 识别失败");
        }

        const ocrData = await ocrResponse.json();

        if (!ocrData.data) {
          throw new Error("未识别到数据");
        }

        ocrSuccess(role, ocrData.data);
      } catch (error) {
        fail(role, error instanceof Error ? error.message : "上传失败");
      }
    },
    [startUpload, uploadSuccess, ocrSuccess, fail]
  );

  // 重试
  const retry = useCallback(
    (role: SubmissionSlotRole) => {
      const slot = slots[role];
      if (slot.file) {
        uploadAndRecognize(role, slot.file);
      }
    },
    [slots, uploadAndRecognize]
  );

  return {
    slots,
    uploadAndRecognize,
    clearSlot,
    retry,
  };
}
