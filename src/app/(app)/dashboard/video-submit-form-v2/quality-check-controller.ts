"use client";

import { createEditableSlots, type SlotViewState } from "../video-submit-form-model";
import type { SubmissionSlotRole } from "@/components/submission/提交状态机";
import type {
  SubmissionQualityIssue,
  SubmissionQualityResponse,
  SubmissionUiState,
} from "@/lib/video-submit-workflow/ui-state";

type Slots = Record<SubmissionSlotRole, SlotViewState>;
type Setter<T> = (next: T | ((current: T) => T)) => void;
type UpdateSlotsState = (updater: (current: Slots) => Slots) => void;
type QualityCheckState = SubmissionUiState["qualityCheck"];
type QualityCheckFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type QualityCheckPayload = SubmissionQualityResponse & { error?: string };

export type QualityCheckControllerOptions = {
  submittedReportId: string | null;
  setHasUserInteracted: (next: boolean) => void;
  setQualityCheck: Setter<QualityCheckState>;
  setIsSubmitted: Setter<boolean>;
  updateSlotsState: UpdateSlotsState;
  fetchImpl?: QualityCheckFetcher;
  onError: (message: string) => void;
  onRequestEdit?: () => void;
  onManualReview: (message: string) => void;
};

export function createQualityCheckController({
  submittedReportId,
  setHasUserInteracted,
  setQualityCheck,
  setIsSubmitted,
  updateSlotsState,
  fetchImpl = fetch,
  onError,
  onRequestEdit,
  onManualReview,
}: QualityCheckControllerOptions) {
  async function handleQualityCheck() {
    setHasUserInteracted(true);
    if (!submittedReportId) {
      onError("未获取到本次日报记录，无法进行 AI 检查，请稍后重试");
      return;
    }

    setQualityCheck({ data: null, loading: true });

    const failWith = (reason?: string) => {
      onError(
        reason
          ? `AI 检查未完成：${reason}（不影响您直接提交）`
          : "AI 检查未完成，不影响您直接提交",
      );
      setQualityCheck({ data: null, loading: false });
    };

    let response: Response;
    try {
      response = await fetchImpl("/api/dashboard/sample-quality-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: submittedReportId }),
      });
    } catch {
      failWith();
      return;
    }

    const payload = (await response.json().catch(() => null)) as QualityCheckPayload | null;
    if (!response.ok) {
      failWith(payload?.error?.trim() || undefined);
      return;
    }

    if (!payload?.overallStatus) {
      failWith("服务端返回内容无法解析");
      return;
    }

    setQualityCheck({ data: payload, loading: false });
  }

  function handleFixIssue(issue: SubmissionQualityIssue) {
    if (issue.suggestedFix === "edit_field") {
      onRequestEdit?.();
      return;
    }

    if (issue.suggestedFix === "reupload_screenshot") {
      setIsSubmitted(false);
      setQualityCheck({ data: null, loading: false });
      updateSlotsState((current) => ({
        ...current,
        screenshot_1: { ...createEditableSlots().screenshot_1 },
        screenshot_2: { ...createEditableSlots().screenshot_2 },
      }));
      return;
    }

    if (issue.suggestedFix === "manual_review") {
      onManualReview("请联系管理员复核");
    }
  }

  return { handleQualityCheck, handleFixIssue };
}
