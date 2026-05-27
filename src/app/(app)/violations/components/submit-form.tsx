"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StepWizard } from "./step-wizard";
import { StepTypeSelect } from "./steps/step-type-select";
import { StepCoreContent } from "./steps/step-core-content";
import { StepViolationDetail } from "./steps/step-violation-detail";
import { StepConversionData } from "./steps/step-conversion-data";
import { StepReview } from "./steps/step-review";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getApiErrorMessage } from "@/lib/violations/errors";
import { UPLOAD_LIMITS, formatSizeLimit } from "@/lib/upload-limits";
import type { ViolationAccount, WizardFormData } from "./types";
import type { ViolationEventType } from "@/lib/conversion-hub/types";
import type { Platform } from "@/lib/case-library/confidence";

function formatLocalNow() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function localToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

const STEPS = [
  { key: "type", label: "选择类型" },
  { key: "core", label: "核心内容" },
  { key: "detail", label: "详情补充" },
  { key: "review", label: "确认提交" },
];

export function SubmitForm({
  accounts,
  initialAccountId,
}: {
  accounts: ViolationAccount[];
  initialAccountId?: string | null;
}) {
  const router = useRouter();
  const validInitialAccountId = useMemo(
    () =>
      accounts.some((account) => account.id === initialAccountId)
        ? initialAccountId ?? "none"
        : "none",
    [accounts, initialAccountId],
  );

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState<WizardFormData>({
    submissionPath: "violation",
    script_text: "",
    screenshots: [],
    eventType: "限流",
    occurredAt: formatLocalNow(),
    platformNotice: "",
    appealStatus: "未申诉",
    appealText: "",
    platforms: ["抖音"],
    viewsInput: "",
    followsInput: "",
    accountId: validInitialAccountId,
  });

  const isLastStep = currentStep === STEPS.length - 1;

  function updateForm(data: Partial<WizardFormData>) {
    setFormData((prev) => ({ ...prev, ...data }));
  }

  /* ------------------------------------------------------------------ */
  /*  Validation                                                        */
  /* ------------------------------------------------------------------ */

  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case 0:
        return true; // Type selection always valid
      case 1:
        return formData.script_text.trim().length > 0;
      case 2: {
        if (formData.submissionPath === "violation") {
          const occurredIso = localToIso(formData.occurredAt);
          const showAppealText = formData.appealStatus !== "未申诉";
          if (formData.accountId === "none") return false;
          if (!occurredIso) return false;
          if (!formData.platformNotice.trim()) return false;
          if (showAppealText && !formData.appealText.trim()) return false;
          return true;
        }
        // conversion
        const viewsNumber = Number(formData.viewsInput);
        const followsNumber = Number(formData.followsInput);
        if (formData.platforms.length === 0) return false;
        if (formData.viewsInput.trim() === "" || viewsNumber <= 0) return false;
        if (formData.followsInput.trim() === "") return false;
        if (followsNumber > viewsNumber) return false;
        return true;
      }
      case 3:
        return true; // Review step
      default:
        return false;
    }
  }, [currentStep, formData]);

  /* ------------------------------------------------------------------ */
  /*  Screenshot upload (preserved from original)                       */
  /* ------------------------------------------------------------------ */

  async function uploadScreenshots(files: FileList | null) {
    if (!files?.length) return;
    let nextFiles = Array.from(files).slice(
      0,
      Math.max(5 - formData.screenshots.length, 0),
    );
    if (!nextFiles.length) {
      feedbackToast.warning("最多上传 5 张截图");
      return;
    }

    const validFiles: File[] = [];
    for (const file of nextFiles) {
      if (file.size > UPLOAD_LIMITS.violationScreenshot) {
        feedbackToast.error(
          `${file.name} 超过 ${formatSizeLimit(UPLOAD_LIMITS.violationScreenshot)} 限制，请压缩后重试`,
        );
      } else {
        validFiles.push(file);
      }
    }
    if (!validFiles.length) return;
    nextFiles = validFiles;

    setIsUploading(true);
    try {
      const uploaded: { path: string; name: string }[] = [];
      for (const file of nextFiles) {
        const formDataUpload = new FormData();
        formDataUpload.append("file", file);
        const response = await fetch("/api/violations/upload", {
          method: "POST",
          body: formDataUpload,
        });
        const payload: unknown = await response.json().catch(() => ({}));
        const uploadedPath = getUploadedPath(payload);
        if (!response.ok || !uploadedPath) {
          throw new Error(getApiErrorMessage(payload, `${file.name} 上传失败`));
        }
        uploaded.push({ path: uploadedPath, name: file.name });
      }
      setFormData((prev) => ({
        ...prev,
        screenshots: [...prev.screenshots, ...uploaded].slice(0, 5),
      }));
      feedbackToast.success("截图已上传");
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "截图上传失败");
    } finally {
      setIsUploading(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Submit (preserved from original)                                  */
  /* ------------------------------------------------------------------ */

  async function handleSubmit() {
    const scriptText = formData.script_text.trim();
    if (!scriptText) {
      feedbackToast.error("请填写话术原文");
      return;
    }

    setIsSubmitting(true);
    try {
      const screenshotPaths = formData.screenshots.map((item) => item.path);

      if (formData.submissionPath === "conversion") {
        const viewsNumber = Number(formData.viewsInput);
        const followsNumber = Number(formData.followsInput);

        if (formData.platforms.length === 0) {
          feedbackToast.error("请至少选 1 个平台");
          setIsSubmitting(false);
          return;
        }
        if (formData.viewsInput.trim() === "" || viewsNumber <= 0) {
          feedbackToast.error("请填流量（播放/曝光数）");
          setIsSubmitting(false);
          return;
        }
        if (formData.followsInput.trim() === "") {
          feedbackToast.error("请填导粉数（× 涨粉填 0）");
          setIsSubmitting(false);
          return;
        }
        if (followsNumber > viewsNumber) {
          feedbackToast.error("导粉数 × 大于流量");
          setIsSubmitting(false);
          return;
        }

        const response = await fetch("/api/violations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script_text: scriptText,
            is_violation: false,
            category: "短视频",
            account_id: formData.accountId === "none" ? null : formData.accountId,
            scene_description: null,
            screenshot_paths: screenshotPaths,
            result: null,
            tags: [],
            platforms: formData.platforms,
          }),
        });
        const payload: unknown = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(getApiErrorMessage(payload, "提交失败"));

        const caseId = getCreatedCaseId(payload);

        if (caseId) {
          const today = new Date();
          const usedAt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          try {
            await fetch("/api/conversion-hub/usage-records", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                case_id: caseId,
                script_text: null,
                script_format: "oral",
                account_id: formData.accountId === "none" ? null : formData.accountId,
                used_at: usedAt,
                views: viewsNumber,
                follows: followsNumber,
                source: "manual",
                daily_report_id: null,
                note: null,
              }),
            });
          } catch {
            feedbackToast.warning("初始效果数据未保存，可在详情页用「记录使用效果」补登");
          }
        }

        feedbackToast.success("已提交，待审核通过后才会出现在团队话术库");
        router.push(caseId ? `/violations/${caseId}` : "/violations");
        return;
      }

      // violation path
      if (formData.accountId === "none") {
        feedbackToast.error("请选择被处罚的账号");
        setIsSubmitting(false);
        return;
      }
      const occurredIso = localToIso(formData.occurredAt);
      if (!occurredIso) {
        feedbackToast.error("请填写处罚发生时间");
        setIsSubmitting(false);
        return;
      }
      if (!formData.platformNotice.trim()) {
        feedbackToast.error("请粘贴平台通知文本，是判违规的最硬证据");
        setIsSubmitting(false);
        return;
      }
      const showAppealText = formData.appealStatus !== "未申诉";
      if (showAppealText && !formData.appealText.trim()) {
        feedbackToast.error("请填写申诉话术（你提交申诉时写的内容）");
        setIsSubmitting(false);
        return;
      }

      const response = await fetch("/api/violations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script_text: scriptText,
          is_violation: true,
          category: "短视频",
          account_id: formData.accountId,
          scene_description: null,
          result: null,
          screenshot_paths: screenshotPaths,
          tags: [],
        }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiErrorMessage(payload, "提交失败"));

      const caseId = getCreatedCaseId(payload);
      feedbackToast.success("已提交，待审核通过后才会出现在团队话术库");

      if (caseId) {
        try {
          const eventResponse = await fetch("/api/conversion-hub/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              case_id: caseId,
              account_id: formData.accountId,
              event_type: formData.eventType,
              occurred_at: occurredIso,
              platform_notice: formData.platformNotice.trim(),
              screenshot_paths: screenshotPaths,
              suspected_reason: null,
              appeal_status: formData.appealStatus,
              appeal_result: showAppealText && formData.appealText.trim() ? formData.appealText.trim() : null,
              recovered_at: null,
              note: null,
            }),
          });
          if (!eventResponse.ok && eventResponse.status !== 401) {
            feedbackToast.warning("处罚信息未保存，稍后可在详情页补录");
          }
        } catch {
          feedbackToast.warning("处罚信息未保存，稍后可在详情页补录");
        }
      }

      router.push(caseId ? `/violations/${caseId}` : "/violations");
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "提交失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Render step content                                               */
  /* ------------------------------------------------------------------ */

  function renderStepContent() {
    switch (currentStep) {
      case 0:
        return (
          <StepTypeSelect
            value={formData.submissionPath}
            onChange={(submissionPath) => updateForm({ submissionPath })}
          />
        );
      case 1:
        return (
          <StepCoreContent
            data={formData}
            onChange={updateForm}
            isUploading={isUploading}
            onUpload={uploadScreenshots}
          />
        );
      case 2:
        return formData.submissionPath === "violation" ? (
          <StepViolationDetail
            data={formData}
            onChange={updateForm}
            accounts={accounts}
          />
        ) : (
          <StepConversionData
            data={formData}
            onChange={updateForm}
          />
        );
      case 3:
        return <StepReview data={formData} accounts={accounts} />;
      default:
        return null;
    }
  }

  return (
    <div className="mx-auto max-w-3xl py-8">
      <StepWizard
        steps={STEPS}
        currentStep={currentStep}
        onPrev={() => setCurrentStep((s) => Math.max(0, s - 1))}
        onNext={() => setCurrentStep((s) => Math.min(STEPS.length - 1, s + 1))}
        onSubmit={handleSubmit}
        canGoNext={canGoNext}
        isSubmitting={isSubmitting}
        isLastStep={isLastStep}
      >
        {renderStepContent()}
      </StepWizard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers (preserved from original)                                 */
/* ------------------------------------------------------------------ */

function getCreatedCaseId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as {
    case?: { id?: unknown };
    data?: { id?: unknown };
    id?: unknown;
  };
  const id = record.case?.id ?? record.data?.id ?? record.id;
  return typeof id === "string" ? id : null;
}

function getUploadedPath(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const path = (payload as { path?: unknown }).path;
  return typeof path === "string" ? path : null;
}
