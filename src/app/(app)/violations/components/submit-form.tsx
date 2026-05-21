"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldAlert, TrendingUp, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { getApiErrorMessage } from "@/lib/violations/errors";
import { VIOLATION_EVENT_TYPES, type ViolationEventType } from "@/lib/conversion-hub/types";
import { cn } from "@/lib/utils";
import { UPLOAD_LIMITS, formatSizeLimit } from "@/lib/upload-limits";
import {
  PLATFORMS,
  calcConversionRate,
  resolveConfidence,
  type Platform,
} from "@/lib/case-library/confidence";
import type { ViolationAccount } from "./types";
import { renderAccountLabel } from "./format";

type UploadedScreenshot = {
  path: string;
  name: string;
};

type SubmissionPath = "violation" | "conversion";
type AppealStatusInput = "未申诉" | "申诉成功" | "申诉失败";

const APPEAL_OPTIONS: AppealStatusInput[] = ["未申诉", "申诉成功", "申诉失败"];

const PATH_OPTIONS: Array<{
  key: SubmissionPath;
  title: string;
  description: string;
  icon: typeof ShieldAlert;
}> = [
  {
    key: "violation",
    title: "提交违规话术",
    description: "记录处罚事实和证据，由管理员判断违规点和应对建议。",
    icon: ShieldAlert,
  },
  {
    key: "conversion",
    title: "提交转化话术",
    description: "把跑出效果的话术交给团队验证，效果数据后续在详情页记录。",
    icon: TrendingUp,
  },
];

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

export function SubmitForm({
  accounts,
  initialAccountId,
}: {
  accounts: ViolationAccount[];
  initialAccountId?: string | null;
}) {
  const router = useRouter();
  const validInitialAccountId = useMemo(
    () => (accounts.some((account) => account.id === initialAccountId) ? initialAccountId ?? "none" : "none"),
    [accounts, initialAccountId],
  );
  const [accountId, setAccountId] = useState(validInitialAccountId);
  const [submissionPath, setSubmissionPath] = useState<SubmissionPath>("violation");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [screenshots, setScreenshots] = useState<UploadedScreenshot[]>([]);

  const [eventType, setEventType] = useState<ViolationEventType>("限流");
  const [occurredAt, setOccurredAt] = useState<string>(() => formatLocalNow());
  const [platformNotice, setPlatformNotice] = useState("");
  const [appealStatus, setAppealStatus] = useState<AppealStatusInput>("未申诉");
  const [appealText, setAppealText] = useState("");

  const [platforms, setPlatforms] = useState<Platform[]>(["抖音"]);
  const [viewsInput, setViewsInput] = useState("");
  const [followsInput, setFollowsInput] = useState("");

  const showAppealText = appealStatus !== "未申诉";

  const viewsNumber = useMemo(() => {
    const n = Number(viewsInput);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }, [viewsInput]);
  const followsNumber = useMemo(() => {
    const n = Number(followsInput);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }, [followsInput]);
  const conversionRate = useMemo(
    () => calcConversionRate(viewsNumber, followsNumber),
    [viewsNumber, followsNumber],
  );
  const confidence = useMemo(() => resolveConfidence(viewsNumber), [viewsNumber]);
  const followsExceedsViews = followsNumber > viewsNumber && viewsNumber > 0;

  function togglePlatform(platform: Platform) {
    setPlatforms((current) => {
      if (current.includes(platform)) {
        if (current.length === 1) return current;
        return current.filter((p) => p !== platform);
      }
      return [...current, platform];
    });
  }

  async function uploadScreenshots(files: FileList | null) {
    if (!files?.length) return;
    let nextFiles = Array.from(files).slice(0, Math.max(5 - screenshots.length, 0));
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
      const uploaded: UploadedScreenshot[] = [];
      for (const file of nextFiles) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/violations/upload", {
          method: "POST",
          body: formData,
        });
        const payload: unknown = await response.json().catch(() => ({}));
        const uploadedPath = getUploadedPath(payload);
        if (!response.ok || !uploadedPath) {
          throw new Error(getApiErrorMessage(payload, `${file.name} 上传失败`));
        }
        uploaded.push({ path: uploadedPath, name: file.name });
      }
      setScreenshots((current) => [...current, ...uploaded].slice(0, 5));
      feedbackToast.success("截图已上传");
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "截图上传失败");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const scriptText = String(form.get("script_text") ?? "").trim();
    if (!scriptText) {
      feedbackToast.error("请填写话术原文");
      return;
    }

    setIsSubmitting(true);
    try {
      const screenshotPaths = screenshots.map((item) => item.path);

      if (submissionPath === "conversion") {
        if (platforms.length === 0) {
          feedbackToast.error("请至少选 1 个平台");
          return;
        }
        if (viewsInput.trim() === "" || viewsNumber <= 0) {
          feedbackToast.error("请填流量（播放/曝光数）");
          return;
        }
        if (followsInput.trim() === "") {
          feedbackToast.error("请填导粉数（× 涨粉填 0）");
          return;
        }
        if (followsNumber > viewsNumber) {
          feedbackToast.error("导粉数 × 大于流量");
          return;
        }

        const response = await fetch("/api/violations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script_text: scriptText,
            is_violation: false,
            category: "短视频",
            account_id: accountId === "none" ? null : accountId,
            scene_description: null,
            screenshot_paths: screenshotPaths,
            result: null,
            tags: [],
            platforms,
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
                account_id: accountId === "none" ? null : accountId,
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

      // violation 向校验
      if (accountId === "none") {
        feedbackToast.error("请选择被处罚的账号");
        return;
      }
      const occurredIso = localToIso(occurredAt);
      if (!occurredIso) {
        feedbackToast.error("请填写处罚发生时间");
        return;
      }
      if (!platformNotice.trim()) {
        feedbackToast.error("请粘贴平台通知文本，是判违规的最硬证据");
        return;
      }
      if (showAppealText && !appealText.trim()) {
        feedbackToast.error("请填写申诉话术（你提交申诉时写的内容）");
        return;
      }

      const response = await fetch("/api/violations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script_text: scriptText,
          is_violation: true,
          category: "短视频",
          account_id: accountId,
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
              account_id: accountId,
              event_type: eventType,
              occurred_at: occurredIso,
              platform_notice: platformNotice.trim(),
              screenshot_paths: screenshotPaths,
              suspected_reason: null,
              appeal_status: appealStatus,
              appeal_result: showAppealText && appealText.trim() ? appealText.trim() : null,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div
        role="tablist"
        aria-label="提交类型"
        className="inline-flex w-full rounded-2xl bg-zinc-100 p-1 sm:w-auto"
      >
        {PATH_OPTIONS.map(({ key, title, icon: Icon }) => {
          const active = submissionPath === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubmissionPath(key)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-2 text-[13px] font-medium transition-colors active:translate-y-0 sm:flex-none",
                active
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              )}
            >
              <Icon className="size-4 stroke-[1.5]" />
              {title.replace("提交", "")}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[55fr_45fr] lg:items-stretch">
        <div className="flex flex-col gap-4">
          <div className="flex flex-[3] flex-col rounded-2xl border border-zinc-200 bg-white p-5">
            <Label htmlFor="script_text" className="text-[13px] font-medium text-zinc-800">
              话术原文 <span className="text-[#C9604D]">*</span>
            </Label>
            <Textarea
              id="script_text"
              name="script_text"
              required
              placeholder="原封不动粘贴话术内容"
              className="mt-2 min-h-[170px] flex-1 resize-none rounded-2xl border-transparent bg-zinc-100/70 text-[14px] leading-7 focus:border-zinc-200 focus:bg-white"
            />
          </div>

          <div className="flex flex-[2] flex-col rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <Label className="text-[13px] font-medium text-zinc-800">
                截图
                <span className="ml-2 text-[11px] font-normal text-zinc-400">
                  {submissionPath === "violation" ? "建议" : "可选"} · 最多 5 张
                </span>
              </Label>
              {screenshots.length ? (
                <span className="text-[11px] tabular-nums text-zinc-400">
                  {screenshots.length} / 5
                </span>
              ) : null}
            </div>

            <label
              htmlFor="screenshots"
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (isUploading || screenshots.length >= 5) return;
                uploadScreenshots(event.dataTransfer.files);
              }}
              className={cn(
                "mt-3 flex min-h-[110px] flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-5 py-8 text-center transition-colors",
                isUploading || screenshots.length >= 5
                  ? "cursor-not-allowed border-zinc-200 bg-zinc-50/40 opacity-70"
                  : "border-zinc-300 bg-zinc-50/70 hover:border-[#D97757]/40 hover:bg-zinc-50",
              )}
            >
              <Upload className="size-5 stroke-[1.5] text-zinc-400" />
              <span className="text-[13px] font-medium text-zinc-700">
                {isUploading ? "上传中..." : "点击上传或拖拽截图到此"}
              </span>
              <span className="text-[11px] text-zinc-400">
                JPG / PNG / WEBP · 单张最大 {formatSizeLimit(UPLOAD_LIMITS.violationScreenshot)}
              </span>
            </label>
            <input
              id="screenshots"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="sr-only"
              disabled={isUploading || screenshots.length >= 5}
              onChange={(event) => {
                uploadScreenshots(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />

            {screenshots.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {screenshots.map((item) => (
                  <span
                    key={item.path}
                    className="inline-flex max-w-full items-center gap-2 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-zinc-600 ring-1 ring-zinc-200"
                  >
                    <span className="truncate">{item.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setScreenshots((current) =>
                          current.filter((screenshot) => screenshot.path !== item.path),
                        )
                      }
                      className="text-zinc-400 hover:text-zinc-800"
                      aria-label="移除截图"
                    >
                      <X className="size-3 stroke-[1.5]" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <Label className="text-[13px] font-medium text-zinc-800">
              {submissionPath === "violation" ? "被处罚的账号" : "跑出效果的账号"}{" "}
              {submissionPath === "violation" ? <span className="text-[#C9604D]">*</span> : null}
            </Label>
            <Select value={accountId} onValueChange={(value) => value && setAccountId(value)}>
              <SelectTrigger className="mt-2 h-11 w-full rounded-2xl border-transparent bg-zinc-100/70 focus:border-zinc-200 focus:bg-white">
                <SelectValue placeholder="选择账号">
                  {accountId === "none"
                    ? "不确定哪个号"
                    : (() => {
                        const idx = accounts.findIndex((account) => account.id === accountId);
                        return idx >= 0
                          ? renderAccountLabel(accounts[idx], idx, accounts.length)
                          : "选择账号";
                      })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {submissionPath === "conversion" ? (
                  <SelectItem value="none">不确定哪个号</SelectItem>
                ) : null}
                {accounts.map((account, index) => (
                  <SelectItem key={account.id} value={account.id}>
                    {renderAccountLabel(account, index, accounts.length)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-[11px] text-zinc-400">
              {submissionPath === "violation"
                ? "只能从你绑定的账号里选，方便管理员核对处罚记录。"
                : "可不选，留给管理员归类。"}
            </p>
          </div>

          {submissionPath === "violation" ? (
            <div className="flex min-h-[440px] flex-1 flex-col rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#C9604D] bg-white p-6">
              <div className="mb-5 flex items-center gap-2">
                <h3 className="text-[14px] font-medium text-zinc-800">处罚事实</h3>
                <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">punishment</span>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-[12px] font-medium text-zinc-600">
                    处罚类型 <span className="text-[#C9604D]">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {VIOLATION_EVENT_TYPES.map((type) => {
                      const active = eventType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setEventType(type)}
                          className={cn(
                            "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors active:translate-y-0",
                            active
                              ? "border-[#D97757]/40 text-[#D97757]"
                              : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
                          )}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="occurred_at" className="text-[12px] font-medium text-zinc-600">
                      发生时间 <span className="text-[#C9604D]">*</span>
                    </Label>
                    <Input
                      id="occurred_at"
                      type="datetime-local"
                      value={occurredAt}
                      onChange={(event) => setOccurredAt(event.currentTarget.value)}
                      className="h-11 rounded-2xl border-transparent bg-zinc-100/70 focus:border-zinc-200 focus:bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[12px] font-medium text-zinc-600">
                      申诉状态 <span className="text-[#C9604D]">*</span>
                    </Label>
                    <Select
                      value={appealStatus}
                      onValueChange={(value) => value && setAppealStatus(value as AppealStatusInput)}
                    >
                      <SelectTrigger className="h-11 w-full rounded-2xl border-transparent bg-zinc-100/70 focus:border-zinc-200 focus:bg-white">
                        <SelectValue>{appealStatus}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {APPEAL_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {showAppealText && (
                    <motion.div
                      key="appeal_text"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 pt-1">
                        <Label htmlFor="appeal_text" className="text-[12px] font-medium text-zinc-600">
                          申诉话术 <span className="text-[#C9604D]">*</span>
                        </Label>
                        <Textarea
                          id="appeal_text"
                          rows={3}
                          value={appealText}
                          onChange={(event) => setAppealText(event.currentTarget.value)}
                          placeholder="把你提交申诉时写的内容原封不动贴进来"
                          className="rounded-2xl border-transparent bg-zinc-100/70 text-[13px] leading-6 focus:border-zinc-200 focus:bg-white"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-2">
                  <Label htmlFor="platform_notice" className="text-[12px] font-medium text-zinc-600">
                    平台通知文本 <span className="text-[#C9604D]">*</span>
                  </Label>
                  <Textarea
                    id="platform_notice"
                    rows={4}
                    value={platformNotice}
                    onChange={(event) => setPlatformNotice(event.currentTarget.value)}
                    placeholder={
                      showAppealText
                        ? "粘贴平台对你申诉的最终回复（成功/失败的原文）"
                        : "粘贴平台发来的处罚原文通知"
                    }
                    className="rounded-2xl border-transparent bg-zinc-100/70 text-[13px] leading-6 focus:border-zinc-200 focus:bg-white"
                  />
                  <p className="text-[11px] text-zinc-400">
                    这是判违规的最硬证据，没有通知文本审核会被驳回。
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[440px] flex-1 flex-col rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#6FAA7D] bg-white p-6">
              <div className="mb-5 flex items-center gap-2">
                <h3 className="text-[14px] font-medium text-zinc-800">效果数据</h3>
                <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">performance</span>
              </div>

              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="conv_views" className="text-[12px] font-medium text-zinc-600">
                      流量 <span className="text-[#C9604D]">*</span>
                      <span className="ml-1 text-[11px] font-normal text-zinc-400">播放/曝光</span>
                    </Label>
                    <Input
                      id="conv_views"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={viewsInput}
                      onChange={(event) => setViewsInput(event.currentTarget.value)}
                      placeholder="例如 30000"
                      className="h-14 rounded-2xl border-transparent bg-zinc-100/70 text-[18px] font-semibold tabular-nums text-zinc-800 placeholder:text-[14px] placeholder:font-normal focus:border-zinc-200 focus:bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="conv_follows" className="text-[12px] font-medium text-zinc-600">
                      导粉 <span className="text-[#C9604D]">*</span>
                      <span className="ml-1 text-[11px] font-normal text-zinc-400">没涨粉填 0</span>
                    </Label>
                    <Input
                      id="conv_follows"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={followsInput}
                      onChange={(event) => setFollowsInput(event.currentTarget.value)}
                      placeholder="例如 180"
                      className={cn(
                        "h-14 rounded-2xl border-transparent bg-zinc-100/70 text-[18px] font-semibold tabular-nums text-zinc-800 placeholder:text-[14px] placeholder:font-normal focus:border-zinc-200 focus:bg-white",
                        followsExceedsViews && "border-[#C9604D]/40 bg-white",
                      )}
                    />
                    {followsExceedsViews ? (
                      <p className="text-[11px] text-[#C9604D]">导粉数不能大于流量</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-10">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                      转化率
                    </p>
                    <p className="mt-2 flex items-baseline gap-1 leading-none tabular-nums">
                      <span className="text-[32px] font-semibold text-zinc-800">
                        {conversionRate === null ? "—" : (conversionRate * 100).toFixed(2)}
                      </span>
                      {conversionRate === null ? null : (
                        <span className="text-[14px] font-medium text-zinc-400">%</span>
                      )}
                    </p>
                    <p className="mt-1.5 text-[11px] text-zinc-400">导粉 ÷ 流量</p>
                  </div>
                  <div className="sm:flex-1">
                    <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                      置信度
                    </p>
                    <div className="mt-2 inline-flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: confidence.toneHex }}
                        aria-hidden
                      />
                      <span
                        className="text-[14px] font-medium tabular-nums"
                        style={{ color: confidence.toneHex }}
                      >
                        {confidence.label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-400">{confidence.hint}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[12px] font-medium text-zinc-600">
                    平台 <span className="text-[#C9604D]">*</span>
                    <span className="ml-2 text-[11px] font-normal text-zinc-400">可多选 · 默认抖音</span>
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map((platform) => {
                      const active = platforms.includes(platform);
                      return (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => togglePlatform(platform)}
                          aria-pressed={active}
                          className={cn(
                            "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors active:translate-y-0",
                            active
                              ? "border-[#D97757]/40 text-[#D97757]"
                              : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
                          )}
                        >
                          {platform}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="text-[11px] text-zinc-400">
                  高置信 ≥ 5 万 / 中置信 ≥ 2.5 万 / 低置信 ≥ 1.5 万 / 1.5 万以下样本不足
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-5 text-zinc-400 sm:max-w-md">
          {submissionPath === "violation"
            ? "提交后进入待审核，管理员判违规点和风险等级后入库，结论可在「我的提交」查看。"
            : "提交后进入待审核，通过后入团队知识库可复用；后续效果数据在详情页用「记录使用效果」追加。"}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-2xl"
            onClick={() => router.push("/violations")}
          >
            返回列表
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || isUploading}
            className={cn(
              "h-11 rounded-2xl bg-[#D97757] px-6 text-white shadow-sm transition-colors hover:bg-[#C96442] active:translate-y-0",
              isSubmitting && "opacity-70",
            )}
          >
            {isSubmitting ? "提交中..." : submissionPath === "violation" ? "提交违规案例" : "提交转化话术"}
          </Button>
        </div>
      </div>
    </form>
  );
}

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
