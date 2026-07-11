"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * step 语义：
 *   0  type 起步（不进入主进度条，只占「起步」徽标）
 *   1  core 核心内容
 *   2  detail 详情补充
 *   3  review 确认提交
 *
 * visibleSteps 只展示 1/2/3，对应 visibleStep = currentStep - 1。
 */
const VISIBLE_STEPS = [
  { key: "core", label: "核心内容" },
  { key: "detail", label: "详情补充" },
  { key: "review", label: "确认提交" },
];
const TOTAL_STEPS = 4;

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
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState<WizardFormData>({
    submissionPath: "violation",
    typePicked: false,
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

  const isLastStep = currentStep === TOTAL_STEPS - 1;
  const visibleStep = currentStep - 1; // -1 = 起步未完成

  const updateForm = useCallback((data: Partial<WizardFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Validation                                                        */
  /* ------------------------------------------------------------------ */

  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case 0:
        return formData.typePicked;
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
        const viewsNumber = Number(formData.viewsInput);
        const followsNumber = Number(formData.followsInput);
        if (formData.platforms.length === 0) return false;
        if (formData.viewsInput.trim() === "" || viewsNumber <= 0) return false;
        if (formData.followsInput.trim() === "") return false;
        if (followsNumber > viewsNumber) return false;
        return true;
      }
      case 3:
        return true;
      default:
        return false;
    }
  }, [currentStep, formData]);

  /* ------------------------------------------------------------------ */
  /*  Step navigation                                                   */
  /* ------------------------------------------------------------------ */

  const goNext = useCallback(() => {
    setDirection(1);
    setCurrentStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }, []);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const handlePickType = useCallback(
    (path: "violation" | "conversion") => {
      setFormData((prev) => ({
        ...prev,
        submissionPath: path,
        typePicked: true,
      }));
      // 短延迟让用户看到卡片选中态再推进，纯视觉
      window.setTimeout(() => {
        setDirection(1);
        setCurrentStep(1);
      }, 180);
    },
    [],
  );

  /* ------------------------------------------------------------------ */
  /*  Screenshot upload (preserved from original)                       */
  /* ------------------------------------------------------------------ */

  const uploadScreenshots = useCallback(
    async (files: FileList | null) => {
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
    },
    [formData.screenshots.length],
  );

  /* ------------------------------------------------------------------ */
  /*  Submit (preserved from original)                                  */
  /* ------------------------------------------------------------------ */

  const handleSubmit = useCallback(async () => {
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
  }, [formData, router]);

  /* ------------------------------------------------------------------ */
  /*  Keyboard shortcuts                                                */
  /*    Esc           上一步                                             */
  /*    Cmd/Ctrl+Enter 推进 / 提交                                        */
  /* ------------------------------------------------------------------ */

  const canGoNextRef = useRef(canGoNext);
  const submittingRef = useRef(isSubmitting);
  const stepRef = useRef(currentStep);
  useEffect(() => {
    canGoNextRef.current = canGoNext;
  }, [canGoNext]);
  useEffect(() => {
    submittingRef.current = isSubmitting;
  }, [isSubmitting]);
  useEffect(() => {
    stepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (submittingRef.current) return;
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      const cmdEnter = e.key === "Enter" && (isMac ? e.metaKey : e.ctrlKey);
      const isEsc = e.key === "Escape";

      if (cmdEnter) {
        if (!canGoNextRef.current) return;
        e.preventDefault();
        if (stepRef.current === TOTAL_STEPS - 1) {
          handleSubmit();
        } else {
          goNext();
        }
        return;
      }
      if (isEsc) {
        if (stepRef.current === 0) return;
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, handleSubmit]);

  /* ------------------------------------------------------------------ */
  /*  Render step content                                               */
  /* ------------------------------------------------------------------ */

  function renderStepContent() {
    switch (currentStep) {
      case 0:
        return (
          <StepTypeSelect
            value={formData.typePicked ? formData.submissionPath : null}
            onPick={handlePickType}
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
        visibleSteps={VISIBLE_STEPS}
        visibleStep={visibleStep}
        contentKey={currentStep}
        direction={direction}
        showActions={currentStep > 0}
        onPrev={goPrev}
        onNext={goNext}
        onSubmit={handleSubmit}
        canGoNext={canGoNext}
        isSubmitting={isSubmitting}
        isLastStep={isLastStep}
      >
        {renderStepContent()}
      </StepWizard>
      <p className="mt-4 text-center text-[12px] text-stone-500">
        快捷键 · Esc 上一步 · Cmd/Ctrl + Enter 推进
      </p>
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
