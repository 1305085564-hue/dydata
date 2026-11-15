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
  SCREENSHOT_TYPE_BY_SLOT,
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
  screenshot_type_source?: "explicit" | "asset_role";
  timings?: { download_ms?: number; ocr_ms?: number; parse_ms?: number; total_ms: number };
};

/** 识别请求永远显式带类型；类型只由槽位决定（互动槽 data、留存槽 retention）。 */
export function buildOcrStorageRequestBody(input: {
  bucket: string;
  path: string;
  role: SubmissionSlotRole;
}) {
  return {
    bucket: input.bucket,
    path: input.path,
    asset_role: input.role,
    screenshot_type: SCREENSHOT_TYPE_BY_SLOT[input.role],
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
  role: SubmissionSlotRole,
  file: File,
  batchStartedAt?: number,
) => Promise<void>) & {
  retryItem: (itemId: string) => Promise<void>;
};

function nextItemId(seq: number) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `screenshot-${seq}-${Date.now()}`;
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
    // 类型跟着槽位走，不采信识别结果里的类型
    const targetRole = input.item.storageRole;
    const slotType = SCREENSHOT_TYPE_BY_SLOT[targetRole];
    updateItemsState((current) => current.map((candidate) => candidate.id === input.itemId ? {
      ...candidate,
      status: (data.slot_status === "failed" ? "failed" : "done") as ScreenshotItem["status"],
      screenshotType: slotType,
      recognizedFields,
      confidenceScore: data.confidence_score,
      requiresManualConfirmation: data.requires_manual_confirmation || data.slot_status === "failed",
      confirmed: data.slot_status === "confirmed" && !data.requires_manual_confirmation,
      finishedAt: Date.now(),
      error: data.slot_status === "failed" ? (resolvedError ?? OCR_FAIL_MESSAGE) : resolvedError,
      ocrSummary: buildOcrSummary(slotType, recognizedFields),
      ocrFallback: data.slot_status === "failed",
      bucket: input.bucket,
      path: input.path,
    } : candidate));

    const visibleSlots = deriveSlotsFromItems(itemsRef.current);
    if (visibleSlots[targetRole].itemId === input.itemId) {
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

  // 每次都重新上传再识别：首次放图和「重新识别」走同一条路
  const runRecognition = async (itemId: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item || !account) return;
    const ocrTask = ocrTasksRef.current!.begin(item.id);
    const startedAt = item.startedAt ?? Date.now();
    let phase: "upload" | "ocr" = "upload";
    let uploadedAssetUrl: string | null = item.assetUrl;
    let uploadedPreviewUrl: string | null = item.previewUrl;

    updateItem(item.id, (current) => ({ ...current, status: "uploading", error: null, startedAt, phaseStartedAt: startedAt, finishedAt: undefined }));
    try {
      if (!item.file) throw new Error("截图文件已失效，请重新选择");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user && !userId) throw new Error("登录状态已失效，请刷新页面后重试");
      const uploadStart = performance.now();
      const uploaded = await uploadSubmissionScreenshot({ accountId: account.id, role: item.storageRole, file: item.file, signal: ocrTask.signal });
      const uploadMs = Math.round(performance.now() - uploadStart);
      uploadedAssetUrl = uploaded.url;
      const { bucket, path } = uploaded;
      ocrTask.bindAsset(uploaded.url);
      if (!ocrTask.isCurrent(uploaded.url)) return;
      phase = "ocr";
      updateItem(item.id, (current) => ({ ...current, status: "recognizing", assetUrl: uploaded.url, bucket, path, phaseStartedAt: Date.now(), error: null }));
      uploadedPreviewUrl = item.previewUrl;
      if (!bucket || !path) throw new Error("截图地址已失效，请重新上传");
      await requestOcr({ item: { ...item, assetUrl: uploadedAssetUrl }, itemId, bucket, path, ocrTask, uploadMs });
    } catch (error) {
      if (!ocrTask.isCurrent(uploadedAssetUrl ?? undefined)) return;
      const message = phase === "upload" ? toScreenshotUploadErrorMessage(error) : toOcrErrorMessage(error);
      updateItem(item.id, (current) => ({ ...current, status: "failed", confirmed: false, requiresManualConfirmation: true, assetUrl: uploadedAssetUrl ?? current.assetUrl, previewUrl: uploadedPreviewUrl ?? current.previewUrl, finishedAt: Date.now(), error: uploadedAssetUrl ? `${message}，截图已保留，可直接手动填写指标` : message, ocrFallback: Boolean(uploadedAssetUrl) }));
    } finally {
      ocrTasksRef.current?.finish(item.id, ocrTask.requestId);
    }
  };

  /** 把图放进指定槽位：同槽旧图立即换掉（取消它的识别），类型按槽位定，不等识别结果。 */
  const addFile = async (role: SubmissionSlotRole, file: File, batchStartedAt?: number) => {
    if (!account) {
      feedbackToast.error("请先选择提交账号");
      return;
    }
    const replaced = itemsRef.current.filter((candidate) => candidate.storageRole === role);
    for (const old of replaced) {
      ocrTasksRef.current?.cancel(old.id);
      revokePreview(old, blobUrlsRef);
    }
    const seq = Math.max(0, ...itemsRef.current.map((item) => item.seq)) + 1;
    const previewUrl = URL.createObjectURL(file);
    blobUrlsRef.current.add(previewUrl);
    const item: ScreenshotItem = {
      id: nextItemId(seq), seq, file, status: "uploading", screenshotType: SCREENSHOT_TYPE_BY_SLOT[role], recognizedFields: null, assetUrl: null, previewUrl, bucket: null, path: null,
      storageRole: role, fileName: file.name, error: null, confidenceScore: null, requiresManualConfirmation: false, confirmed: false,
      startedAt: Date.now(), phaseStartedAt: Date.now(), batchStartedAt: batchStartedAt ?? Date.now(),
    };
    updateItemsState((current) => [...current.filter((candidate) => candidate.storageRole !== role), item]);
    await runRecognition(item.id);
  };

  const handler = ((role: SubmissionSlotRole, file: File, batchStartedAt?: number) => addFile(role, file, batchStartedAt)) as UploadHandler;
  handler.retryItem = async (itemId) => runRecognition(itemId);
  return handler;
}
