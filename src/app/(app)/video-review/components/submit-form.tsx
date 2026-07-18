"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Upload, X, ArrowRight, Check, Archive } from "lucide-react";

import { StepWizard } from "@/app/(app)/violations/components/step-wizard";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { ImageLightbox } from "@/components/image-lightbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trackUsageEvent } from "@/lib/usage-events/client";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/violations/errors";

import type { VideoReviewAccount, FeedbackHistoryItem } from "./types";

const VISIBLE_STEPS = [
  { key: "core", label: "核心内容" },
  { key: "review", label: "确认提交" },
];
const TOTAL_STEPS = 3;
const MAX_SCREENSHOTS = 5;

interface ScreenshotEntry {
  path: string;
  name: string;
}

interface SubmitFormProps {
  accounts: VideoReviewAccount[];
  /** 二改模式 — 传入则切到整改流程 */
  draftId?: string;
  initialAccountId?: string | null;
  initialScriptText?: string;
  initialScreenshots?: string[];
  /** 上轮反馈（最近一条 reject） */
  lastRejection?: FeedbackHistoryItem | null;
  feedbackHistory?: FeedbackHistoryItem[];
}

export function SubmitForm({
  accounts,
  draftId,
  initialAccountId,
  initialScriptText = "",
  initialScreenshots = [],
  lastRejection = null,
  feedbackHistory = [],
}: SubmitFormProps) {
  const router = useRouter();
  const isAmend = Boolean(draftId);
  const validInitialAccountId = useMemo(() => {
    if (!initialAccountId) return null;
    return accounts.some((a) => a.id === initialAccountId) ? initialAccountId : null;
  }, [accounts, initialAccountId]);

  // 二改 → 跳过起步直接进 step 1（核心内容）
  const [currentStep, setCurrentStep] = useState(isAmend ? 1 : 0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [accountId, setAccountId] = useState<string | null>(validInitialAccountId);
  const [scriptText, setScriptText] = useState(initialScriptText);
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>(
    initialScreenshots.map((path) => ({ path, name: path.split("/").pop() ?? path })),
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const isLastStep = currentStep === TOTAL_STEPS - 1;
  const visibleStep = currentStep - 1;

  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case 0:
        return true; // 起步只要选了账号或留空都行
      case 1:
        return scriptText.trim().length > 0;
      case 2:
        return scriptText.trim().length > 0;
      default:
        return false;
    }
  }, [currentStep, scriptText]);

  const goNext = useCallback(() => {
    setDirection(1);
    setCurrentStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }, []);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setCurrentStep((s) => Math.max(isAmend ? 1 : 0, s - 1));
  }, [isAmend]);

  const handlePickAccount = useCallback((id: string | null) => {
    setAccountId(id);
    window.setTimeout(() => {
      setDirection(1);
      setCurrentStep(1);
    }, 160);
  }, []);

  const uploadScreenshots = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const remaining = MAX_SCREENSHOTS - screenshots.length;
      if (remaining <= 0) {
        feedbackToast.warning(`最多上传 ${MAX_SCREENSHOTS} 张截图`);
        return;
      }
      const nextFiles = Array.from(files).slice(0, remaining);
      setIsUploading(true);
      try {
        const uploaded: ScreenshotEntry[] = [];
        for (const file of nextFiles) {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/publish-drafts/upload", {
            method: "POST",
            body: fd,
          });
          const payload: unknown = await res.json().catch(() => ({}));
          const path =
            payload && typeof payload === "object" && "path" in payload &&
            typeof (payload as { path: unknown }).path === "string"
              ? (payload as { path: string }).path
              : null;
          if (!res.ok || !path) {
            throw new Error(getApiErrorMessage(payload, `${file.name} 上传失败`));
          }
          uploaded.push({ path, name: file.name });
        }
        setScreenshots((prev) => [...prev, ...uploaded].slice(0, MAX_SCREENSHOTS));
        feedbackToast.success("截图已上传");
      } catch (e) {
        feedbackToast.error(e instanceof Error ? e.message : "截图上传失败");
      } finally {
        setIsUploading(false);
      }
    },
    [screenshots.length],
  );

  const removeScreenshot = useCallback((path: string) => {
    setScreenshots((prev) => prev.filter((s) => s.path !== path));
  }, []);

  const handleSubmit = useCallback(async () => {
    const text = scriptText.trim();
    if (!text) {
      feedbackToast.error("请填写话术原文");
      return;
    }
    setIsSubmitting(true);
    try {
      const body = {
        account_id: accountId,
        script_text: text,
        screenshot_paths: screenshots.map((s) => s.path),
      };
      const url = isAmend
        ? `/api/publish-drafts/${draftId}`
        : "/api/publish-drafts";
      const method = isAmend ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(payload, isAmend ? "整改失败" : "提交失败"),
        );
      }
      trackUsageEvent({ path: "/video-review/submit", eventType: "submit_review_draft" });
      feedbackToast.success(isAmend ? "已重新提交，等待审核" : "已提交，等待审核");
      router.push("/video-review");
      router.refresh();
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setIsSubmitting(false);
    }
  }, [accountId, draftId, isAmend, router, screenshots, scriptText]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accountId, accounts],
  );

  return (
    <>
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2.5">
          <Archive className="size-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-medium text-amber-800">本功能已归档</p>
            <p className="text-[12px] text-amber-700/80 leading-[1.6] mt-0.5">
              视频复盘提交与整改重提已暂停，历史记录仍可在管理后台查看，数据不会丢失。
            </p>
          </div>
        </div>
      </div>

      {isAmend && lastRejection ? (
        <FeedbackBanner
          rejection={lastRejection}
          history={feedbackHistory}
          currentRound={
            (feedbackHistory[feedbackHistory.length - 1]?.round ?? 1) + 1
          }
        />
      ) : null}

      <StepWizard
        visibleSteps={VISIBLE_STEPS}
        visibleStep={visibleStep}
        contentKey={`step-${currentStep}`}
        direction={direction}
        showActions={currentStep > 0}
        onPrev={goPrev}
        onNext={goNext}
        onSubmit={() => {}}
        canGoNext={canGoNext}
        isSubmitting={isSubmitting}
        isLastStep={isLastStep}
      >
        {currentStep === 0 ? (
          <StartStep
            accounts={accounts}
            accountId={accountId}
            onPick={handlePickAccount}
          />
        ) : null}
        {currentStep === 1 ? (
          <CoreStep
            scriptText={scriptText}
            onScriptChange={setScriptText}
            screenshots={screenshots}
            isUploading={isUploading}
            onUpload={uploadScreenshots}
            onRemove={removeScreenshot}
            onPreview={(idx) => setLightboxIndex(idx)}
            fileInputRef={fileInputRef}
          />
        ) : null}
        {currentStep === 2 ? (
          <ReviewStep
            account={selectedAccount}
            scriptText={scriptText}
            screenshots={screenshots}
            onPreview={(idx) => setLightboxIndex(idx)}
          />
        ) : null}
      </StepWizard>

      {lightboxIndex !== null ? (
        <ImageLightbox
          paths={screenshots.map((s) => s.path)}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={(idx) => setLightboxIndex(idx)}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 起步 — 选账号                                                       */
/* ------------------------------------------------------------------ */

function StartStep({
  accounts,
  accountId,
  onPick,
}: {
  accounts: VideoReviewAccount[];
  accountId: string | null;
  onPick: (id: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12px] font-medium text-stone-500">
          Step 0
        </p>
        <h3 className="mt-1 text-[18px] font-medium text-stone-900">选择关联账号</h3>
        <p className="mt-1 text-[12px] text-stone-500">
          选择这条待发稿要发布到的账号；可暂不选，后续审核时再补。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {accounts.map((acc) => (
          <button
            key={acc.id}
            type="button"
            disabled
            className={cn(
              "flex items-center justify-between rounded-xl border bg-white px-4 py-3 text-left transition-all cursor-not-allowed opacity-70",
              accountId === acc.id
                ? "border-stone-300 ring-1 ring-stone-200"
                : "border-stone-200",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-stone-700">
                {acc.display_name}
              </p>
              {acc.content_direction ? (
                <p className="mt-0.5 truncate text-[12px] text-stone-500">
                  {acc.content_direction}
                </p>
              ) : null}
            </div>
            {accountId === acc.id ? (
              <Check className="size-4 stroke-[2] text-[#B4532F]" />
            ) : null}
          </button>
        ))}
        <button
          type="button"
          disabled
          className={cn(
            "flex items-center justify-between rounded-xl border bg-white px-4 py-3 text-left transition-all cursor-not-allowed opacity-70",
            accountId === null
              ? "border-stone-300 ring-1 ring-stone-200"
              : "border-stone-200",
          )}
        >
          <div>
            <p className="text-[13px] font-medium text-stone-700">暂不关联</p>
            <p className="mt-0.5 text-[12px] text-stone-500">先提交话术，待定后再补账号</p>
          </div>
          {accountId === null ? (
            <Check className="size-4 stroke-[2] text-[#B4532F]" />
          ) : null}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 核心内容 — 话术 + 截图                                              */
/* ------------------------------------------------------------------ */

function CoreStep({
  scriptText,
  onScriptChange,
  screenshots,
  isUploading,
  onUpload,
  onRemove,
  onPreview,
  fileInputRef,
}: {
  scriptText: string;
  onScriptChange: (v: string) => void;
  screenshots: ScreenshotEntry[];
  isUploading: boolean;
  onUpload: (files: FileList | null) => void;
  onRemove: (path: string) => void;
  onPreview: (idx: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="script_text" className="text-[13px] font-medium text-stone-700">
          话术原文 <span className="text-[#B24E3E]">*</span>
        </Label>
        <Textarea
          id="script_text"
          value={scriptText}
          disabled
          placeholder="本功能已归档，暂不支持提交新的视频复盘"
          className="min-h-[170px] resize-none rounded-lg bg-stone-100 border border-stone-200 text-[13px] leading-7 text-stone-500 placeholder:text-stone-400 cursor-not-allowed"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[13px] font-medium text-stone-700">
            截图
            <span className="ml-2 text-[12px] font-normal text-stone-500">
              建议 · 最多 {MAX_SCREENSHOTS} 张
            </span>
          </Label>
          {screenshots.length ? (
            <span className="text-[12px] tabular-nums text-stone-500">
              {screenshots.length} / {MAX_SCREENSHOTS}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          {screenshots.map((s, idx) => (
            <div
              key={s.path}
              className="group relative size-24 overflow-hidden rounded-lg border border-stone-200 bg-stone-100"
            >
              <button
                type="button"
                onClick={() => onPreview(idx)}
                className="block size-full"
              >
                <Image
                  src={`/api/violations/screenshot/${encodeURI(s.path)}`}
                  alt={s.name}
                  fill
                  unoptimized
                  sizes="96px"
                  className="object-cover"
                />
              </button>

            </div>
          ))}

          <div
            className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-200 bg-white text-[12px] text-stone-400 cursor-not-allowed"
            title="本功能已归档，暂不支持上传截图"
          >
            <Upload className="size-4 stroke-[1.5]" />
            添加
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 确认提交 — review                                                   */
/* ------------------------------------------------------------------ */

function ReviewStep({
  account,
  scriptText,
  screenshots,
  onPreview,
}: {
  account: VideoReviewAccount | null;
  scriptText: string;
  screenshots: ScreenshotEntry[];
  onPreview: (idx: number) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[12px] font-medium text-stone-500">
          Review
        </p>
        <h3 className="mt-1 text-[18px] font-medium text-stone-900">确认提交</h3>
        <p className="mt-1 text-[12px] text-stone-500">
          确认无误后点击右下角「确认提交」，进入待审核队列。
        </p>
      </div>

      <div className="border-t border-stone-100 pt-4 space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-medium text-stone-500">
            账号
          </span>
          <span className="text-[13px] text-stone-700">
            {account ? account.display_name : "暂不关联"}
          </span>
        </div>
        <div>
          <span className="text-[12px] font-medium text-stone-500">
            话术
          </span>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-7 text-stone-700">
            {scriptText.trim() || <span className="text-stone-500">未填写</span>}
          </p>
        </div>
        {screenshots.length ? (
          <div>
            <span className="text-[12px] font-medium text-stone-500">
              截图（{screenshots.length}）
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {screenshots.map((s, idx) => (
                <button
                  key={s.path}
                  type="button"
                  onClick={() => onPreview(idx)}
                  className="size-16 overflow-hidden rounded-lg border border-stone-200 bg-white"
                >
                  <Image
                    src={`/api/violations/screenshot/${encodeURI(s.path)}`}
                    alt={s.name}
                    width={64}
                    height={64}
                    unoptimized
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 二改顶部反馈卡                                                      */
/* ------------------------------------------------------------------ */

function FeedbackBanner({
  rejection,
  history,
  currentRound,
}: {
  rejection: FeedbackHistoryItem;
  history: FeedbackHistoryItem[];
  currentRound: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = history.length > 1;
  return (
    <div className="rounded-2xl border border-[#D97757]/30 bg-[#D97757]/[0.04] p-5 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[#B4532F]">
            第 {currentRound} 轮整改
          </p>
          <p className="mt-1 text-[13px] font-medium text-stone-700">
            管理上一轮的优化建议
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.7] text-stone-700">
            {rejection.feedback_text || "（未填写具体说明，请联系管理。）"}
          </p>
          {rejection.reviewer_name ? (
            <p className="mt-2 text-[12px] text-stone-500">
              来自 {rejection.reviewer_name}
            </p>
          ) : null}
        </div>
      </div>
      {hasMore ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[#B4532F] hover:underline"
          >
            {expanded ? "收起历史" : `查看历史 ${history.length} 条`}
            <ArrowRight
              className={cn(
                "size-3 stroke-[2] transition-transform",
                expanded && "rotate-90",
              )}
            />
          </button>
          {expanded ? (
            <ul className="mt-3 space-y-2 border-t border-[#D97757]/20 pt-3">
              {history.map((h, i) => (
                <li key={i} className="text-[12px] leading-[1.7] text-stone-500">
                  <span className="font-medium text-stone-700">第 {h.round} 轮</span>
                  <span className="ml-2">
                    {h.action === "approve" ? "通过" : "打回"}
                  </span>
                  {h.feedback_text ? (
                    <span className="ml-2 text-stone-500">— {h.feedback_text}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
