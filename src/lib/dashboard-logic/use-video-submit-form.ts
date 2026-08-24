/**
 * 表单状态管理 Hook - 从 Antigravity 提取的纯逻辑
 * 管理视频提交表单的所有状态和验证逻辑
 */

import { useState, useCallback, useMemo } from "react";
import type { AnomalyStatus } from "@/types";

// ==================== 类型定义 ====================

export type SubmissionSlotRole = "screenshot_1" | "screenshot_2";
export type ScreenshotType = "data" | "curve" | "retention";
export type FieldSource = "manual" | "ocr" | "prefill";

export interface SubmissionFieldState {
  key: string;
  value: string;
  source: FieldSource;
  ocrConfidence?: "high" | "medium" | "low";
}

export interface SubmissionSlotState {
  role: SubmissionSlotRole;
  status: "empty" | "uploading" | "processing" | "success" | "error";
  file?: File;
  assetUrl?: string;
  previewUrl?: string;
  screenshotType?: ScreenshotType;
  recognizedFields?: Record<string, string | number | boolean | null>;
  ocrConfidence?: Partial<Record<string, "high" | "medium" | "low">>;
  error?: string;
}

export interface FormMetaState {
  videoUrl: string;
  videoTitle: string;
  content: string;
  bizDate: string;
  publishedAt: string;
  anomalyStatus: AnomalyStatus;
  operatorUserId: string | null;
  scriptAuthorUserId: string | null;
  videoEditorUserId: string | null;
}

export interface SubmissionState {
  meta: FormMetaState;
  fields: Record<string, SubmissionFieldState>;
  slots: Record<SubmissionSlotRole, SubmissionSlotState>;
}

// ==================== 工具函数 ====================

export function parseMetric(value: string, fallback = 0): number {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeOptionalText(value: string | null | undefined): string {
  return value?.trim() || "";
}

export function createFieldState(
  key: string,
  value = "",
  source: FieldSource = "manual"
): SubmissionFieldState {
  return { key, value, source };
}

// ==================== 初始化函数 ====================

export function createInitialMeta(today: string, userId: string): FormMetaState {
  const now = new Date();
  const publishedAt = now.toISOString().slice(0, 16);

  return {
    videoUrl: "",
    videoTitle: "",
    content: "",
    bizDate: today,
    publishedAt,
    anomalyStatus: "normal",
    operatorUserId: userId,
    scriptAuthorUserId: userId,
    videoEditorUserId: userId,
  };
}

export function createInitialSlots(): Record<SubmissionSlotRole, SubmissionSlotState> {
  return {
    screenshot_1: {
      role: "screenshot_1",
      status: "empty",
    },
    screenshot_2: {
      role: "screenshot_2",
      status: "empty",
    },
  };
}

export function createInitialSubmissionState(
  today: string,
  userId: string
): SubmissionState {
  return {
    meta: createInitialMeta(today, userId),
    fields: {
      play_count: createFieldState("play_count", ""),
      likes: createFieldState("likes", ""),
      comments: createFieldState("comments", ""),
      shares: createFieldState("shares", ""),
      favorites: createFieldState("favorites", ""),
      follower_gain: createFieldState("follower_gain", ""),
      follower_convert: createFieldState("follower_convert", ""),
      completion_rate: createFieldState("completion_rate", ""),
      avg_play_duration: createFieldState("avg_play_duration", ""),
    },
    slots: createInitialSlots(),
  };
}

// ==================== 验证逻辑 ====================

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export function validateSubmission(state: SubmissionState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 必填：视频链接
  if (!state.meta.videoUrl.trim()) {
    issues.push({
      field: "videoUrl",
      message: "请填写视频链接",
      severity: "error",
    });
  }

  // 必填：播放量
  if (!state.fields.play_count.value.trim()) {
    issues.push({
      field: "play_count",
      message: "请填写播放量",
      severity: "error",
    });
  }

  // 校验：播放量必须是正数
  const playCount = parseMetric(state.fields.play_count.value, -1);
  if (playCount < 0) {
    issues.push({
      field: "play_count",
      message: "播放量必须大于等于 0",
      severity: "error",
    });
  }

  return issues;
}

export function canSubmit(state: SubmissionState): boolean {
  const issues = validateSubmission(state);
  return issues.filter((i) => i.severity === "error").length === 0;
}

// ==================== Hook ====================

export function useVideoSubmitForm(today: string, userId: string) {
  const [state, setState] = useState<SubmissionState>(() =>
    createInitialSubmissionState(today, userId)
  );

  const updateMeta = useCallback(
    <K extends keyof FormMetaState>(key: K, value: FormMetaState[K]) => {
      setState((prev) => ({
        ...prev,
        meta: { ...prev.meta, [key]: value },
      }));
    },
    []
  );

  const updateField = useCallback(
    (key: string, value: string, source: FieldSource = "manual") => {
      setState((prev) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [key]: { key, value, source },
        },
      }));
    },
    []
  );

  const updateSlot = useCallback(
    (role: SubmissionSlotRole, updates: Partial<SubmissionSlotState>) => {
      setState((prev) => ({
        ...prev,
        slots: {
          ...prev.slots,
          [role]: { ...prev.slots[role], ...updates },
        },
      }));
    },
    []
  );

  const applyOcrData = useCallback(
    (
      role: SubmissionSlotRole,
      recognizedFields: Record<string, string | number | boolean | null>
    ) => {
      setState((prev) => {
        const newFields = { ...prev.fields };

        // 自动填充 OCR 识别的数据
        Object.entries(recognizedFields).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            newFields[key] = {
              key,
              value: String(value),
              source: "ocr",
            };
          }
        });

        return {
          ...prev,
          fields: newFields,
          slots: {
            ...prev.slots,
            [role]: {
              ...prev.slots[role],
              recognizedFields,
              status: "success",
            },
          },
        };
      });
    },
    []
  );

  const resetForm = useCallback(() => {
    setState(createInitialSubmissionState(today, userId));
  }, [today, userId]);

  const validationIssues = useMemo(() => validateSubmission(state), [state]);

  const isValid = useMemo(
    () => validationIssues.filter((i) => i.severity === "error").length === 0,
    [validationIssues]
  );

  return {
    state,
    updateMeta,
    updateField,
    updateSlot,
    applyOcrData,
    resetForm,
    validationIssues,
    isValid,
    canSubmit: isValid,
  };
}
