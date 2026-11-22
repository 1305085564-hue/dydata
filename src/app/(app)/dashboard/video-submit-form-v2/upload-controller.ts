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
} from "@/lib/video-submit/domain/video-submit-form-model";
import { uploadSubmissionScreenshot } from "@/lib/video-submit/data/screenshots";
import { parseSubmissionScreenshotPath } from "@/lib/submission-screenshot-access";
import { resolveOcrPublishedAt } from "@/lib/video-submit-deadline";
import { toDateTimeLocalValue } from "@/lib/video-submit/domain/form-rules";
import type { OcrTaskHandle, OcrTaskRegistry } from "@/lib/video-submit-workflow/ocr-task";
import type { WorkflowAction } from "@/lib/video-submit-workflow/types";

type Slots = Record<SubmissionSlotRole, SlotViewState>;
type UpdateItemsState = (updater: (current: ScreenshotItem[]) => ScreenshotItem[]) => void;
type OcrRequestMode = "multipart" | "storage";

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

/** 并行直传本地文件进行识别：显式携带 file、asset_role 与 screenshot_type。 */
export function buildOcrMultipartFormData(input: { file: File; role: SubmissionSlotRole }) {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("asset_role", input.role);
  formData.append("screenshot_type", SCREENSHOT_TYPE_BY_SLOT[input.role]);
  return formData;
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

function resolvePersistedTarget(item: ScreenshotItem): { bucket: string; path: string } | null {
  if (!item.assetUrl) return null;
  if (item.bucket && item.path) return { bucket: item.bucket, path: item.path };
  const parsedPath = parseSubmissionScreenshotPath(item.assetUrl);
  return parsedPath ? { bucket: "submission-screenshots", path: parsedPath } : null;
}

export function createUploadHandler({
  account,
  userId,
  initialSummary,
  supabase,
  ocrTasksRef,
  slotsRef: _slotsRef,
  itemsRef,
  blobUrlsRef,
  updateItemsState,
  dispatchWorkflow,
}: UploadControllerOptions): UploadHandler {
  void _slotsRef;
  const updateItem = (id: string, updater: (item: ScreenshotItem) => ScreenshotItem) => {
    updateItemsState((current) => current.map((item) => item.id === id ? updater(item) : item));
  };

  const logOcrTiming = (input: {
    itemId: string;
    mode: OcrRequestMode;
    uploadMs?: number;
    requestMs: number;
    payload: OcrApiPayload;
  }) => {
    const serverTimings = input.payload.timings;
    console.log("[OCR 耗时]", {
      item_id: input.itemId,
      mode: input.mode,
      upload_ms: input.uploadMs,
      ocr_request_ms: input.requestMs,
      server_download_ms: serverTimings?.download_ms,
      server_ocr_ms: serverTimings?.ocr_ms,
      server_parse_ms: serverTimings?.parse_ms,
      server_total_ms: serverTimings?.total_ms,
    });
  };

  const fetchOcrPayload = async (
    input:
      | { mode: "multipart"; file: File; role: SubmissionSlotRole; signal: AbortSignal }
      | { mode: "storage"; bucket: string; path: string; role: SubmissionSlotRole; signal: AbortSignal },
  ) => {
    const requestStart = performance.now();
    const response = input.mode === "multipart"
      ? await fetch("/api/ocr-screenshot", {
          method: "POST",
          body: buildOcrMultipartFormData({ file: input.file, role: input.role }),
          signal: input.signal,
        })
      : await fetch("/api/ocr-screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildOcrStorageRequestBody({ bucket: input.bucket, path: input.path, role: input.role })),
          signal: input.signal,
        });
    const requestMs = Math.round(performance.now() - requestStart);
    const payload = (await response.json().catch(() => ({}))) as OcrApiPayload;
    return { ok: response.ok, payload, requestMs };
  };

  const markItemFailed = (
    item: ScreenshotItem,
    opts: { error: string; assetUrl: string | null; bucket: string | null; path: string | null; ocrFallback: boolean },
  ) => {
    updateItem(item.id, (current) => ({
      ...current,
      status: "failed",
      confirmed: false,
      requiresManualConfirmation: true,
      assetUrl: opts.assetUrl,
      bucket: opts.bucket,
      path: opts.path,
      previewUrl: item.previewUrl ?? current.previewUrl,
      finishedAt: Date.now(),
      error: opts.error,
      ocrFallback: opts.ocrFallback,
    }));
  };

  const applyOcrSuccess = (input: {
    itemId: string;
    role: SubmissionSlotRole;
    assetUrl: string;
    bucket: string;
    path: string;
    payload: OcrApiPayload;
    mode: OcrRequestMode;
    requestMs: number;
    uploadMs?: number;
  }) => {
    logOcrTiming({ itemId: input.itemId, mode: input.mode, uploadMs: input.uploadMs, requestMs: input.requestMs, payload: input.payload });
    const data = input.payload.data!;
    const recognizedFields = data.recognized_fields;
    const recognizedPublishedAt = typeof recognizedFields?.published_at === "string" ? toDateTimeLocalValue(recognizedFields.published_at) : null;
    const recognizedPublishedAtText = typeof recognizedFields?.published_at_text === "string" ? recognizedFields.published_at_text : null;
    const recognizedVideoTitle = typeof recognizedFields?.video_title === "string" ? recognizedFields.video_title.trim() : "";
    const resolvedPublishedAt = resolveOcrPublishedAt(recognizedPublishedAt, recognizedPublishedAtText);

    if (resolvedPublishedAt && !initialSummary) {
      dispatchWorkflow({
        type: "ocr/commit",
        meta: (current) => ({
          ...current,
          publishedAt: resolvedPublishedAt.publishedAt,
          publishedAtText: resolvedPublishedAt.publishedAtText,
          publishedAtSource: "ocr",
          ocrPublishedAt: resolvedPublishedAt.publishedAt,
          ocrPublishedAtText: resolvedPublishedAt.publishedAtText,
        }),
      });
    }
    if (recognizedVideoTitle && !initialSummary) {
      dispatchWorkflow({ type: "ocr/commit", meta: (current) => current.videoTitle.trim() ? current : { ...current, videoTitle: recognizedVideoTitle } });
    }

    const resolvedError = data.error_code ? resolveOcrErrorMessage(data.error_code) : data.error ? toOcrErrorMessage(data.error) : null;
    // 类型跟着槽位走，不采信识别结果里的类型
    const targetRole = input.role;
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
      assetUrl: input.assetUrl,
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

  const ensureAuthenticated = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user && !userId) throw new Error("登录状态已失效，请刷新页面后重试");
  };

  const runParallelUploadAndOcr = async (item: ScreenshotItem, ocrTask: OcrTaskHandle) => {
    const startedAt = item.startedAt ?? Date.now();
    updateItem(item.id, (current) => ({ ...current, status: "uploading", error: null, startedAt, phaseStartedAt: startedAt, finishedAt: undefined }));

    try {
      if (!item.file) throw new Error("截图文件已失效，请重新选择");
      await ensureAuthenticated();

      const file = item.file;
      const uploadPromise = (async () => {
        const uploadStart = performance.now();
        const uploaded = await uploadSubmissionScreenshot({ accountId: account!.id, role: item.storageRole, file, signal: ocrTask.signal });
        const uploadMs = Math.round(performance.now() - uploadStart);
        if (!ocrTask.isCurrent()) return { ...uploaded, uploadMs };
        if (!uploaded.bucket || !uploaded.path) throw new Error("截图地址已失效，请重新上传");
        ocrTask.bindAsset(uploaded.url);
        updateItem(item.id, (current) => ({
          ...current,
          status: current.status === "uploading" ? "recognizing" : current.status,
          assetUrl: uploaded.url,
          bucket: uploaded.bucket,
          path: uploaded.path,
          phaseStartedAt: Date.now(),
          error: null,
        }));
        return { ...uploaded, uploadMs };
      })();

      const ocrPromise = fetchOcrPayload({ mode: "multipart", file, role: item.storageRole, signal: ocrTask.signal });
      const [uploadResult, ocrResult] = await Promise.allSettled([uploadPromise, ocrPromise]);
      const expectedAssetUrl = uploadResult.status === "fulfilled" ? uploadResult.value.url : undefined;
      if (!ocrTask.isCurrent(expectedAssetUrl)) return;

      if (uploadResult.status === "rejected") {
        if (ocrResult.status === "fulfilled") {
          logOcrTiming({ itemId: item.id, mode: "multipart", requestMs: ocrResult.value.requestMs, payload: ocrResult.value.payload });
        }
        markItemFailed(item, { error: toScreenshotUploadErrorMessage(uploadResult.reason), assetUrl: null, bucket: null, path: null, ocrFallback: false });
        return;
      }

      const uploaded = uploadResult.value;
      if (ocrResult.status === "rejected" || !ocrResult.value.ok || !ocrResult.value.payload.data) {
        if (ocrResult.status === "fulfilled") {
          logOcrTiming({ itemId: item.id, mode: "multipart", uploadMs: uploaded.uploadMs, requestMs: ocrResult.value.requestMs, payload: ocrResult.value.payload });
        }
        const errorReason = ocrResult.status === "rejected"
          ? ocrResult.reason
          : new Error(toOcrErrorMessage(ocrResult.value.payload.error_code ?? ocrResult.value.payload.error));
        markItemFailed(item, {
          error: `${toOcrErrorMessage(errorReason)}，截图已保留，可直接手动填写指标`,
          assetUrl: uploaded.url,
          bucket: uploaded.bucket,
          path: uploaded.path,
          ocrFallback: true,
        });
        return;
      }

      applyOcrSuccess({
        itemId: item.id,
        role: item.storageRole,
        assetUrl: uploaded.url,
        bucket: uploaded.bucket,
        path: uploaded.path,
        payload: ocrResult.value.payload,
        mode: "multipart",
        requestMs: ocrResult.value.requestMs,
        uploadMs: uploaded.uploadMs,
      });
    } catch (error) {
      if (!ocrTask.isCurrent()) return;
      markItemFailed(item, { error: toScreenshotUploadErrorMessage(error), assetUrl: null, bucket: null, path: null, ocrFallback: false });
    }
  };

  const runExistingAssetOcr = async (item: ScreenshotItem, persisted: { bucket: string; path: string }, ocrTask: OcrTaskHandle) => {
    const assetUrl = item.assetUrl!;
    ocrTask.bindAsset(assetUrl);
    updateItem(item.id, (current) => ({ ...current, status: "recognizing", error: null, phaseStartedAt: Date.now(), finishedAt: undefined }));
    const mode: OcrRequestMode = item.file ? "multipart" : "storage";

    try {
      await ensureAuthenticated();
      const response = item.file
        ? await fetchOcrPayload({ mode: "multipart", file: item.file, role: item.storageRole, signal: ocrTask.signal })
        : await fetchOcrPayload({ mode: "storage", bucket: persisted.bucket, path: persisted.path, role: item.storageRole, signal: ocrTask.signal });

      if (!ocrTask.isCurrent(assetUrl)) return;
      if (!response.ok || !response.payload.data) {
        logOcrTiming({ itemId: item.id, mode, requestMs: response.requestMs, payload: response.payload });
        throw new Error(toOcrErrorMessage(response.payload.error_code ?? response.payload.error));
      }

      applyOcrSuccess({
        itemId: item.id,
        role: item.storageRole,
        assetUrl,
        bucket: persisted.bucket,
        path: persisted.path,
        payload: response.payload,
        mode,
        requestMs: response.requestMs,
      });
    } catch (error) {
      if (!ocrTask.isCurrent(assetUrl)) return;
      markItemFailed(item, {
        error: `${toOcrErrorMessage(error)}，截图已保留，可直接手动填写指标`,
        assetUrl,
        bucket: persisted.bucket,
        path: persisted.path,
        ocrFallback: true,
      });
    }
  };

  const runRecognition = async (itemId: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item || !account) return;
    const ocrTask = ocrTasksRef.current!.begin(item.id);
    try {
      const persisted = resolvePersistedTarget(item);
      if (persisted) await runExistingAssetOcr(item, persisted, ocrTask);
      else await runParallelUploadAndOcr(item, ocrTask);
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
