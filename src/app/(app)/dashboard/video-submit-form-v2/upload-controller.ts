"use client";

import type { MutableRefObject } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { SubmissionSlotRole } from "@/components/submission/提交状态机";
import { OCR_FAIL_MESSAGE, resolveOcrErrorMessage, toOcrErrorMessage, toScreenshotUploadErrorMessage } from "@/components/submission/截图上传错误";
import { applyOcrMetricValues } from "@/components/submission/填报表单状态";
import { buildOcrSummary, type SlotViewState } from "../video-submit-form-model";
import { uploadSubmissionScreenshot } from "@/lib/video-submit/data/screenshots";
import { resolveOcrPublishedAt } from "@/lib/video-submit-deadline";
import { toDateTimeLocalValue } from "@/lib/video-submit/domain/form-rules";
import type { OcrTaskRegistry } from "@/lib/video-submit-workflow/ocr-task";
import type { WorkflowAction } from "@/lib/video-submit-workflow/types";

type Slots = Record<SubmissionSlotRole, SlotViewState>;
type UpdateSlotsState = (updater: (current: Slots) => Slots) => void;
type OcrApiPayload = {
  data?: {
    slot_status: "pending_confirm" | "confirmed" | "failed";
    screenshot_type: "data" | "curve" | "retention";
    confidence_score: number;
    requires_manual_confirmation: boolean;
    recognized_fields: Record<string, string | number | boolean | null> | null;
    confidence?: Partial<Record<"play_count" | "likes" | "comments" | "shares" | "favorites" | "follower_gain" | "follower_convert", "high" | "medium" | "low">>;
    error?: string;
    error_code?: string;
  };
  error?: string;
  error_code?: string;
  screenshot_type_source?: "explicit" | "asset_role" | "asset_role_fallback";
  timings?: { download_ms?: number; ocr_ms?: number; parse_ms?: number; total_ms: number };
};
export type UploadControllerOptions = {
  account: { id: string } | null; userId: string;
  initialSummary: { title?: string | null; content?: string | null; reportDate: string } | null;
  supabase: SupabaseClient; ocrTasksRef: MutableRefObject<OcrTaskRegistry | null>;
  slotsRef: MutableRefObject<Slots>; blobUrlsRef: MutableRefObject<Set<string>>;
  updateSlotsState: UpdateSlotsState; dispatchWorkflow: (action: WorkflowAction) => void;
};
export function createUploadHandler({ account, userId, initialSummary, supabase, ocrTasksRef, slotsRef, blobUrlsRef, updateSlotsState, dispatchWorkflow }: UploadControllerOptions) {
  return async (role: SubmissionSlotRole, file: File) => {
      if (!account) {
        feedbackToast.error("请先选择提交账号");
        return;
      }

      const ocrTask = ocrTasksRef.current!.begin(role);
      const oldUrl = slotsRef.current[role]?.previewUrl ?? slotsRef.current[role]?.assetUrl;
      if (oldUrl && oldUrl.startsWith("blob:")) {
        URL.revokeObjectURL(oldUrl);
        blobUrlsRef.current.delete(oldUrl);
      }

      updateSlotsState((current) => ({
        ...current,
        [role]: {
          ...current[role],
          status: "uploading",
          fileName: file.name,
          file,
          error: null,
        },
      }));

      let phase: "upload" | "ocr" = "upload";
      let uploadedAssetUrl: string | null = null;
      let uploadedPreviewUrl: string | null = null;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user && !userId) {
          throw new Error("登录状态已失效，请刷新页面后重试");
        }

        const uploadStart = performance.now();
        const {
          url: assetUrl,
          bucket,
          path,
        } = await uploadSubmissionScreenshot({
          accountId: account.id,
          role,
          file,
          signal: ocrTask.signal,
        });
        const uploadMs = Math.round(performance.now() - uploadStart);
        const previewUrl = URL.createObjectURL(file);
        uploadedAssetUrl = assetUrl;
        uploadedPreviewUrl = previewUrl;
        blobUrlsRef.current.add(previewUrl);
        ocrTask.bindAsset(assetUrl);
        if (!ocrTask.isCurrent(assetUrl)) return;

        phase = "ocr";
        updateSlotsState((current) => ({
          ...current,
          [role]: {
            ...current[role],
            status: "recognizing",
            assetUrl,
            previewUrl,
          },
        }));

        const ocrRequestStart = performance.now();
        const response = await fetch("/api/ocr-screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bucket,
            path,
            asset_role: role,
          }),
          signal: ocrTask.signal,
        });
        const ocrRequestMs = Math.round(performance.now() - ocrRequestStart);

        const payload = (await response.json()) as OcrApiPayload;
        if (!ocrTask.isCurrent(assetUrl)) return;
        const totalMs = Math.round(performance.now() - uploadStart);
        const serverTimings = payload.timings;
        console.log("[OCR 耗时]", {
          role,
          upload_ms: uploadMs,
          ocr_request_ms: ocrRequestMs,
          server_download_ms: serverTimings?.download_ms,
          server_ocr_ms: serverTimings?.ocr_ms,
          server_parse_ms: serverTimings?.parse_ms,
          server_total_ms: serverTimings?.total_ms,
          total_ms: totalMs,
        });

        if (!response.ok || !payload.data) {
          throw new Error(toOcrErrorMessage(payload.error_code ?? payload.error));
        }

        const { data } = payload;
        const recognizedFields = data.recognized_fields;
        const recognizedPublishedAt = typeof recognizedFields?.published_at === "string"
          ? toDateTimeLocalValue(recognizedFields.published_at)
          : null;
        const recognizedPublishedAtText = typeof recognizedFields?.published_at_text === "string"
          ? recognizedFields.published_at_text
          : null;
        const recognizedVideoTitle = typeof recognizedFields?.video_title === "string"
          ? recognizedFields.video_title.trim()
          : "";
        // 发布时间只允许由 OCR 写入，且必须拿到**真实时间**才写：
        // 只识别到无法解析的文本时 resolveOcrPublishedAt 返回 null，不写 published_at_text，
        // 门禁继续拦 —— 避免「确认了但 72 小时判定仍用派生默认时间」绕过补交审批。
        const resolvedPublishedAt = resolveOcrPublishedAt(
          recognizedPublishedAt,
          recognizedPublishedAtText,
        );
        if (ocrTask.isCurrent(assetUrl) && resolvedPublishedAt && !initialSummary) {
          dispatchWorkflow({
            type: "ocr/commit",
            meta: (current) => ({
              ...current,
              publishedAt: resolvedPublishedAt.publishedAt,
              publishedAtText: resolvedPublishedAt.publishedAtText,
            }),
          });
        }
        if (ocrTask.isCurrent(assetUrl) && recognizedVideoTitle && !initialSummary) {
          dispatchWorkflow({
            type: "ocr/commit",
            meta: (current) => current.videoTitle.trim()
              ? current
              : { ...current, videoTitle: recognizedVideoTitle },
          });
        }
        const detectedType = data.screenshot_type;
        const usedAssetRoleFallback = payload.screenshot_type_source === "asset_role_fallback";
        const ocrSummary = buildOcrSummary(
          detectedType,
          data.recognized_fields,
        );

        const resolvedError = data.error_code
          ? resolveOcrErrorMessage(data.error_code)
          : data.error
            ? toOcrErrorMessage(data.error)
            : null;

        // 智能对调逻辑
        let targetRole: SubmissionSlotRole = role;
        if (detectedType === "data") {
          targetRole = "screenshot_1";
        } else if (detectedType === "retention") {
          targetRole = "screenshot_2";
        }

        if (!ocrTask.isCurrent(assetUrl)) return;
        updateSlotsState((current) => {
          const newSlotData = {
            ...current[role],
            status:
              data.slot_status === "failed" && assetUrl
                ? "pending_confirm"
                : data.slot_status,
            confirmed:
              data.slot_status === "confirmed" &&
              !data.requires_manual_confirmation,
            requiresManualConfirmation:
              data.requires_manual_confirmation ||
              data.slot_status === "failed" ||
              usedAssetRoleFallback,
            confidenceScore: data.confidence_score,
            error:
              data.slot_status === "failed"
                ? (resolvedError ?? OCR_FAIL_MESSAGE)
                : resolvedError,
            assetUrl,
            previewUrl,
            screenshotType: detectedType,
            recognizedFields: data.recognized_fields,
            ocrSummary,
            ocrFallback: data.slot_status === "failed" || usedAssetRoleFallback,
          };

          if (role !== targetRole) {
            const targetSlot = current[targetRole];
            const canMoveToTarget =
              targetSlot.status === "empty" || targetSlot.status === "failed";
            const canSwapWithFallback =
              !canMoveToTarget &&
              (targetSlot.status === "pending_confirm" ||
                Boolean(targetSlot.ocrFallback));

            if (canMoveToTarget) {
              return {
                ...current,
                [targetRole]: {
                  ...newSlotData,
                  role: targetRole,
                },
                [role]: {
                  role,
                  required: current[role].required,
                  status: "empty",
                  confidenceScore: null,
                  requiresManualConfirmation: false,
                  confirmed: false,
                  fileName: undefined,
                  error: null,
                  assetUrl: null,
                  previewUrl: null,
                  file: null,
                  recognizedFields: null,
                  ocrSummary: undefined,
                  ocrFallback: false,
                },
              };
            }

            if (canSwapWithFallback) {
              return {
                ...current,
                [targetRole]: {
                  ...newSlotData,
                  role: targetRole,
                  required: current[targetRole].required,
                },
                [role]: {
                  ...targetSlot,
                  role,
                  required: current[role].required,
                },
              };
            }
          }

          return {
            ...current,
            [role]: newSlotData,
          };
        });

        if (ocrTask.isCurrent(assetUrl) && detectedType === "data" && data.recognized_fields) {
          dispatchWorkflow({
            type: "ocr/commit",
            fields: (current) => applyOcrMetricValues(current, data.recognized_fields, data.confidence),
          });
        }

        if (data.slot_status === "failed") {
          feedbackToast.warning("截图已留存，部分指标请直接在右侧/下方核对或补全");
          return;
        }

        if (ocrTask.isCurrent(assetUrl) && detectedType === "retention" && data.recognized_fields) {
          const retentionMetrics = data.recognized_fields
            .retention_metrics as unknown as
            Record<string, number | null> | undefined;
          dispatchWorkflow({
            type: "ocr/commit",
            fields: (current) => applyOcrMetricValues(current, retentionMetrics),
          });
        }
      } catch (error) {
        if (!ocrTask.isCurrent(uploadedAssetUrl ?? undefined)) return;
        const message =
          phase === "upload"
            ? toScreenshotUploadErrorMessage(error)
            : toOcrErrorMessage(error);
        updateSlotsState((current) => ({
          ...current,
          [role]: {
            ...current[role],
            status: uploadedAssetUrl ? "pending_confirm" : "failed",
            confirmed: false,
            requiresManualConfirmation: true,
            assetUrl: uploadedAssetUrl ?? current[role].assetUrl ?? null,
            previewUrl: uploadedPreviewUrl ?? current[role].previewUrl ?? null,
            error: uploadedAssetUrl
              ? `${message}，截图已保留，可直接手动填写指标`
              : message,
            ocrFallback: Boolean(uploadedAssetUrl),
          },
        }));
      } finally {
        ocrTasksRef.current?.finish(role, ocrTask.requestId);
      }
  };
}
