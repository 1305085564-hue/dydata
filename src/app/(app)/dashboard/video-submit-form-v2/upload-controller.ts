"use client";

import type { MutableRefObject } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { SubmissionSlotRole } from "@/components/submission/提交状态机";
import { OCR_FAIL_MESSAGE, resolveOcrErrorMessage, toOcrErrorMessage, toScreenshotUploadErrorMessage } from "@/components/submission/截图上传错误";
import { applyOcrMetricValues } from "@/components/submission/填报表单状态";
import {
  buildOcrSummary,
  deriveSlotsFromItems,
  type ScreenshotItem,
  type SlotViewState,
} from "../video-submit-form-model";
import { uploadSubmissionScreenshot } from "@/lib/video-submit/data/screenshots";
import { resolveOcrPublishedAt } from "@/lib/video-submit-deadline";
import { toDateTimeLocalValue } from "@/lib/video-submit/domain/form-rules";
import type { OcrTaskRegistry } from "@/lib/video-submit-workflow/ocr-task";
import type { WorkflowAction } from "@/lib/video-submit-workflow/types";

type Slots = Record<SubmissionSlotRole, SlotViewState>;
type UpdateItemsState = (updater: (current: ScreenshotItem[]) => ScreenshotItem[]) => void;

type OcrApiPayload = {
  data?: {
    slot_status: "pending_confirm" | "confirmed" | "failed";
    screenshot_type: "data" | "retention" | null;
    confidence_score: number;
    requires_manual_confirmation: boolean;
    recognized_fields: Record<string, unknown> | null;
    confidence?: Partial<Record<"play_count" | "likes" | "comments" | "shares" | "favorites" | "follower_gain", "high" | "medium" | "low">>;
    error?: string;
    error_code?: string;
  };
  error?: string;
  error_code?: string;
  screenshot_type_source?: "explicit" | "asset_role" | "auto" | "auto_unknown";
  timings?: { download_ms?: number; ocr_ms?: number; parse_ms?: number; total_ms: number };
};

/** 默认自动模式；只有“这是互动/这是完播”重试时才显式传类型。 */
export function buildOcrStorageRequestBody(input: {
  bucket: string;
  path: string;
  role: SubmissionSlotRole;
  screenshotType?: "data" | "retention";
}) {
  return {
    bucket: input.bucket,
    path: input.path,
    asset_role: input.role,
    ...(input.screenshotType ? { screenshot_type: input.screenshotType } : {}),
  } as const;
}

export type UploadControllerOptions = {
  account: { id: string } | null;
  userId: string;
  initialSummary: { title?: string | null; content?: string | null; reportDate: string } | null;
  supabase: SupabaseClient;
  ocrTasksRef: MutableRefObject<OcrTaskRegistry | null>;
  slotsRef: MutableRefObject<Slots>;
  itemsRef: MutableRefObject<ScreenshotItem[]>;
  blobUrlsRef: MutableRefObject<Set<string>>;
  updateItemsState: UpdateItemsState;
  dispatchWorkflow: (action: WorkflowAction) => void;
};

export type UploadHandler = ((
  preferredRole: SubmissionSlotRole | null,
  file: File,
  batchStartedAt?: number,
) => Promise<void>) & {
  retryItem: (itemId: string) => Promise<void>;
  recognizeType: (itemId: string, screenshotType: "data" | "retention") => Promise<void>;
};

function nextItemId(seq: number) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `screenshot-${seq}-${Date.now()}`;
}

function resolveStorageRole(
  items: readonly ScreenshotItem[],
  preferredRole: SubmissionSlotRole | null,
): SubmissionSlotRole {
  if (preferredRole) return preferredRole;
  const slots = deriveSlotsFromItems(items);
  if (slots.screenshot_1.status === "empty") return "screenshot_1";
  if (slots.screenshot_2.status === "empty") return "screenshot_2";
  return items.length % 2 === 0 ? "screenshot_1" : "screenshot_2";
}

function revokePreview(item: ScreenshotItem, blobUrlsRef: MutableRefObject<Set<string>>) {
  if (item.previewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(item.previewUrl);
    blobUrlsRef.current.delete(item.previewUrl);
  }
}

export function createUploadHandler({
  account,
  userId,
  initialSummary,
  supabase,
  ocrTasksRef,
  slotsRef,
  itemsRef,
  blobUrlsRef,
  updateItemsState,
  dispatchWorkflow,
}: UploadControllerOptions): UploadHandler {
  const updateItem = (id: string, updater: (item: ScreenshotItem) => ScreenshotItem) => {
    updateItemsState((current) => current.map((item) => item.id === id ? updater(item) : item));
  };

  const requestOcr = async (input: {
    item: ScreenshotItem;
    itemId: string;
    bucket: string;
    path: string;
    screenshotType?: "data" | "retention";
    ocrTask: ReturnType<OcrTaskRegistry["begin"]>;
    uploadMs?: number;
  }) => {
    const requestStart = performance.now();
    const response = await fetch("/api/ocr-screenshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildOcrStorageRequestBody({
        bucket: input.bucket,
        path: input.path,
        role: input.item.storageRole,
        screenshotType: input.screenshotType,
      })),
      signal: input.ocrTask.signal,
    });
    const requestMs = Math.round(performance.now() - requestStart);
    const payload = (await response.json()) as OcrApiPayload;
    if (!input.ocrTask.isCurrent(input.item.assetUrl ?? undefined)) return;
    const serverTimings = payload.timings;
    console.log("[OCR 耗时]", {
      item_id: input.itemId,
      upload_ms: input.uploadMs,
      ocr_request_ms: requestMs,
      server_download_ms: serverTimings?.download_ms,
      server_ocr_ms: serverTimings?.ocr_ms,
      server_parse_ms: serverTimings?.parse_ms,
      server_total_ms: serverTimings?.total_ms,
    });
    if (!response.ok || !payload.data) throw new Error(toOcrErrorMessage(payload.error_code ?? payload.error));

    const { data } = payload;
    const recognizedFields = data.recognized_fields;
    const recognizedPublishedAt = typeof recognizedFields?.published_at === "string" ? toDateTimeLocalValue(recognizedFields.published_at) : null;
    const recognizedPublishedAtText = typeof recognizedFields?.published_at_text === "string" ? recognizedFields.published_at_text : null;
    const recognizedVideoTitle = typeof recognizedFields?.video_title === "string" ? recognizedFields.video_title.trim() : "";
    const resolvedPublishedAt = resolveOcrPublishedAt(recognizedPublishedAt, recognizedPublishedAtText);
    if (resolvedPublishedAt && !initialSummary) {
      dispatchWorkflow({ type: "ocr/commit", meta: (current) => ({ ...current, publishedAt: resolvedPublishedAt.publishedAt, publishedAtText: resolvedPublishedAt.publishedAtText }) });
    }
    if (recognizedVideoTitle && !initialSummary) {
      dispatchWorkflow({ type: "ocr/commit", meta: (current) => current.videoTitle.trim() ? current : { ...current, videoTitle: recognizedVideoTitle } });
    }

    const resolvedError = data.error_code ? resolveOcrErrorMessage(data.error_code) : data.error ? toOcrErrorMessage(data.error) : null;
    const nextType = data.screenshot_type;
    const before = itemsRef.current;
    updateItemsState((current) => {
      let next = current.map((candidate) => candidate.id === input.itemId ? {
        ...candidate,
        status: (data.slot_status === "failed" ? "failed" : "done") as ScreenshotItem["status"],
        screenshotType: nextType,
        recognizedFields,
        confidenceScore: data.confidence_score,
        requiresManualConfirmation: data.requires_manual_confirmation || data.slot_status === "failed" || nextType === null,
        confirmed: data.slot_status === "confirmed" && !data.requires_manual_confirmation && nextType !== null,
        finishedAt: Date.now(),
        error: data.slot_status === "failed" ? (resolvedError ?? OCR_FAIL_MESSAGE) : resolvedError,
        ocrSummary: buildOcrSummary(nextType, recognizedFields),
        ocrFallback: data.slot_status === "failed" || nextType === null,
        bucket: input.bucket,
        path: input.path,
      } : candidate);
      if (nextType) {
        const currentSeq = next.find((item) => item.id === input.itemId)?.seq ?? 0;
        next = next.filter((candidate) => candidate.id === input.itemId || candidate.screenshotType !== nextType || candidate.seq >= currentSeq);
      }
      return next;
    });

    const after = itemsRef.current;
    const removedOlderCount = before.filter(
      (candidate) => !after.some((nextItem) => nextItem.id === candidate.id),
    ).length;
    for (const removed of before) {
      if (!after.some((candidate) => candidate.id === removed.id)) revokePreview(removed, blobUrlsRef);
    }
    if (removedOlderCount > 0 && nextType) {
      feedbackToast.success(`已换成新的${nextType === "data" ? "互动" : "完播"}截图`);
    }
    const visibleSlots = deriveSlotsFromItems(after);
    const targetRole = nextType === "data" ? "screenshot_1" : nextType === "retention" ? "screenshot_2" : null;
    if (targetRole && visibleSlots[targetRole].itemId === input.itemId) {
      dispatchWorkflow({
        type: "ocr/commit",
        hasManualEdit: false,
        fields: (current) => applyOcrMetricValues(
          current,
          targetRole === "screenshot_1"
            ? recognizedFields as Record<string, string | number | boolean | null> | null
            : recognizedFields?.retention_metrics as Record<string, string | number | boolean | null> | undefined,
          data.confidence,
          { screenshotRefreshed: true, screenshotRole: targetRole },
        ),
      });
    }
    if (data.slot_status === "failed") feedbackToast.warning("截图已留存，部分指标请直接在右侧/下方核对或补全");
  };

  const runRecognition = async (
    itemId: string,
    options: { screenshotType?: "data" | "retention"; upload?: boolean },
  ) => {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item || !account) return;
    const ocrTask = ocrTasksRef.current!.begin(item.id);
    const startedAt = item.startedAt ?? Date.now();
    let phase: "upload" | "ocr" = options.upload ? "upload" : "ocr";
    let uploadedAssetUrl: string | null = item.assetUrl;
    let uploadedPreviewUrl: string | null = item.previewUrl;
    let bucket = item.bucket;
    let path = item.path;

    updateItem(item.id, (current) => ({ ...current, status: options.upload ? "uploading" : "recognizing", error: null, startedAt, phaseStartedAt: options.upload ? startedAt : Date.now(), finishedAt: undefined }));
    try {
      let uploadMs: number | undefined;
      if (options.upload) {
        if (!item.file) throw new Error("截图文件已失效，请重新选择");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user && !userId) throw new Error("登录状态已失效，请刷新页面后重试");
        const uploadStart = performance.now();
        const uploaded = await uploadSubmissionScreenshot({ accountId: account.id, role: item.storageRole, file: item.file, signal: ocrTask.signal });
        uploadMs = Math.round(performance.now() - uploadStart);
        uploadedAssetUrl = uploaded.url;
        bucket = uploaded.bucket;
        path = uploaded.path;
        ocrTask.bindAsset(uploaded.url);
        if (!ocrTask.isCurrent(uploaded.url)) return;
        phase = "ocr";
        updateItem(item.id, (current) => ({ ...current, status: "recognizing", assetUrl: uploaded.url, bucket, path, phaseStartedAt: Date.now(), error: null }));
        uploadedPreviewUrl = item.previewUrl;
      }
      if (!bucket || !path) throw new Error("截图地址已失效，请重新上传");
      if (!options.upload) {
        ocrTask.bindAsset(uploadedAssetUrl ?? "");
        if (!ocrTask.isCurrent(uploadedAssetUrl ?? "")) return;
      }
      await requestOcr({ item: { ...item, assetUrl: uploadedAssetUrl ?? item.assetUrl, storageRole: item.storageRole }, itemId, bucket, path, screenshotType: options.screenshotType, ocrTask, uploadMs });
    } catch (error) {
      if (!ocrTask.isCurrent(uploadedAssetUrl ?? undefined)) return;
      const message = phase === "upload" ? toScreenshotUploadErrorMessage(error) : toOcrErrorMessage(error);
      updateItem(item.id, (current) => ({ ...current, status: "failed", confirmed: false, requiresManualConfirmation: true, assetUrl: uploadedAssetUrl ?? current.assetUrl, previewUrl: uploadedPreviewUrl ?? current.previewUrl, finishedAt: Date.now(), error: uploadedAssetUrl ? `${message}，截图已保留，可直接手动填写指标` : message, ocrFallback: Boolean(uploadedAssetUrl) }));
    } finally {
      ocrTasksRef.current?.finish(item.id, ocrTask.requestId);
    }
  };

  const addFile = async (preferredRole: SubmissionSlotRole | null, file: File, batchStartedAt?: number) => {
    if (!account) {
      feedbackToast.error("请先选择提交账号");
      return;
    }
    const seq = Math.max(0, ...itemsRef.current.map((item) => item.seq)) + 1;
    const previewUrl = URL.createObjectURL(file);
    blobUrlsRef.current.add(previewUrl);
    const item: ScreenshotItem = {
      id: nextItemId(seq), seq, file, status: "uploading", screenshotType: null, recognizedFields: null, assetUrl: null, previewUrl, bucket: null, path: null,
      storageRole: resolveStorageRole(itemsRef.current, preferredRole), fileName: file.name, error: null, confidenceScore: null, requiresManualConfirmation: false, confirmed: false,
      startedAt: Date.now(), phaseStartedAt: Date.now(), batchStartedAt: batchStartedAt ?? Date.now(),
    };
    updateItemsState((current) => [...current, item]);
    await runRecognition(item.id, { upload: true });
  };

  const handler = ((preferredRole: SubmissionSlotRole | null, file: File, batchStartedAt?: number) => addFile(preferredRole, file, batchStartedAt)) as UploadHandler;
  handler.retryItem = async (itemId) => runRecognition(itemId, { upload: true });
  handler.recognizeType = async (itemId, screenshotType) => runRecognition(itemId, { screenshotType, upload: false });
  return handler;
}
