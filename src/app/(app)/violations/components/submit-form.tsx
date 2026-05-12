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
import {
  APPEAL_STATUSES,
  VIOLATION_EVENT_TYPES,
  type AppealStatus,
  type ScriptFormat,
  type ViolationEventType,
} from "@/lib/conversion-hub/types";
import { cn } from "@/lib/utils";
import { VIOLATION_CATEGORIES } from "./format";
import type { ViolationAccount } from "./types";
import { useReasonTags } from "./use-reason-tags";

type UploadedScreenshot = {
  path: string;
  name: string;
};

type SubmissionPath = "violation" | "conversion";

const PATH_OPTIONS: Array<{
  key: SubmissionPath;
  title: string;
  description: string;
  icon: typeof ShieldAlert;
}> = [
  {
    key: "violation",
    title: "提交违规话术",
    description: "记录风险点、违规场景、危险原因、测试结果和复核建议。",
    icon: ShieldAlert,
  },
  {
    key: "conversion",
    title: "提交转化话术",
    description: "记录有效场景、转化结果、使用数据和沉淀理由。",
    icon: TrendingUp,
  },
];

const SCRIPT_FORMAT_OPTIONS: Array<{ value: ScriptFormat; label: string }> = [
  { value: "oral", label: "口播" },
  { value: "visual", label: "画面" },
  { value: "mixed", label: "混合" },
];

function formatLocalNow() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function formatLocalDate() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
    () => accounts.some((account) => account.id === initialAccountId) ? initialAccountId ?? "none" : "none",
    [accounts, initialAccountId],
  );
  const [accountId, setAccountId] = useState(validInitialAccountId);
  const [submissionPath, setSubmissionPath] = useState<SubmissionPath>("violation");
  const [category, setCategory] = useState<(typeof VIOLATION_CATEGORIES)[number]>("下粉");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [screenshots, setScreenshots] = useState<UploadedScreenshot[]>([]);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // 处罚信息
  const [eventType, setEventType] = useState<ViolationEventType>("限流");
  const [occurredAt, setOccurredAt] = useState<string>(() => formatLocalNow());
  const [platformNotice, setPlatformNotice] = useState("");
  const [appealStatus, setAppealStatus] = useState<AppealStatus>("未申诉");
  const [appealResult, setAppealResult] = useState("");
  const [recoveredAt, setRecoveredAt] = useState("");

  // 转化使用数据
  const [scriptFormat, setScriptFormat] = useState<ScriptFormat>("oral");
  const [usedAt, setUsedAt] = useState(() => formatLocalDate());
  const [views, setViews] = useState("");
  const [follows, setFollows] = useState("");

  // 原因标签
  const { tags: reasonTags, isLoading: isLoadingTags, error: reasonTagsError } = useReasonTags();
  const [reasonTagIds, setReasonTagIds] = useState<string[]>([]);

  const reasonTagMissing = hasAttemptedSubmit && reasonTagIds.length === 0 && !isLoadingTags && reasonTags.length > 0;
  const showAppealResult = appealStatus !== "未申诉";
  const showRecoveredAt = appealStatus === "申诉成功";

  async function uploadScreenshots(files: FileList | null) {
    if (!files?.length) return;
    const nextFiles = Array.from(files).slice(0, Math.max(5 - screenshots.length, 0));
    if (!nextFiles.length) {
      feedbackToast.warning("最多上传 5 张截图");
      return;
    }

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

  function toggleReasonTag(id: string) {
    setReasonTagIds((current) =>
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasAttemptedSubmit(true);
    const form = new FormData(event.currentTarget);
    const scriptText = String(form.get("script_text") ?? "").trim();
    if (!scriptText) {
      feedbackToast.error("请填写话术原文");
      return;
    }

    if (submissionPath === "violation" && reasonTags.length > 0 && reasonTagIds.length === 0) {
      feedbackToast.error("请至少选择一个原因标签");
      return;
    }

    setIsSubmitting(true);
    try {
      const screenshotPaths = screenshots.map((item) => item.path);
      const sceneDescription = String(form.get("scene_description") ?? "").trim();
      const resultText = String(form.get("result") ?? "").trim();
      const reasonText = String(form.get("reason") ?? "").trim();
      const reviewSuggestion = String(form.get("review_suggestion") ?? "").trim();

      if (submissionPath === "conversion") {
        const parsedViews = Number.parseInt(views || "0", 10);
        const parsedFollows = Number.parseInt(follows || "0", 10);

        if (!usedAt) {
          feedbackToast.error("请填写使用日期");
          return;
        }
        if (!Number.isFinite(parsedViews) || parsedViews < 0) {
          feedbackToast.error("展示量不能为负数");
          return;
        }
        if (!Number.isFinite(parsedFollows) || parsedFollows < 0) {
          feedbackToast.error("涨粉数不能为负数");
          return;
        }
        if (parsedFollows > parsedViews) {
          feedbackToast.error("涨粉数不能大于展示量");
          return;
        }

        const noteParts = [
          sceneDescription ? `有效场景：${sceneDescription}` : null,
          resultText ? `转化结果：${resultText}` : null,
          reasonText ? `沉淀理由：${reasonText}` : null,
          reviewSuggestion ? `下一步建议：${reviewSuggestion}` : null,
        ].filter(Boolean);

        const response = await fetch("/api/conversion-hub/usage-records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script_text: scriptText,
            script_format: scriptFormat,
            account_id: accountId === "none" ? null : accountId,
            used_at: usedAt,
            views: parsedViews,
            follows: parsedFollows,
            source: "manual",
            note: noteParts.join("\n") || null,
          }),
        });
        const payload: unknown = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(getApiErrorMessage(payload, "提交失败"));

        const caseId = getUsageCaseId(payload);
        feedbackToast.success("已提交转化话术并记录使用数据");
        router.push(caseId ? `/violations/${caseId}` : "/violations");
        router.refresh();
        return;
      }

      const occurredIso = localToIso(occurredAt);
      if (!occurredIso) {
        feedbackToast.error("请填写处罚发生时间");
        return;
      }

      const recoveredIso = showRecoveredAt && recoveredAt ? localToIso(recoveredAt) : null;
      if (showRecoveredAt && recoveredAt && !recoveredIso) {
        feedbackToast.error("恢复时间格式不正确");
        return;
      }

      const response = await fetch("/api/violations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script_text: scriptText,
          is_violation: true,
          category,
          account_id: accountId === "none" ? null : accountId,
          scene_description: sceneDescription || null,
          result: [resultText, reasonText ? `危险原因：${reasonText}` : null, reviewSuggestion ? `复核建议：${reviewSuggestion}` : null].filter(Boolean).join("\n") || null,
          screenshot_paths: screenshotPaths,
          reason_tag_ids: reasonTagIds,
        }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiErrorMessage(payload, "提交失败"));

      const caseId = getCreatedCaseId(payload);
      feedbackToast.success("已提交，等待管理员确认");

      if (caseId && accountId !== "none") {
        try {
          const eventResponse = await fetch("/api/conversion-hub/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              case_id: caseId,
              account_id: accountId,
              event_type: eventType,
              occurred_at: occurredIso,
              platform_notice: platformNotice.trim() || null,
              screenshot_paths: screenshotPaths,
              suspected_reason: null,
              appeal_status: appealStatus,
              appeal_result: showAppealResult && appealResult.trim() ? appealResult.trim() : null,
              recovered_at: recoveredIso,
              note: null,
            }),
          });
          if (!eventResponse.ok && eventResponse.status !== 401) {
            feedbackToast.warning("处罚信息未保存，稍后可在详情页补录");
          }
        } catch {
          feedbackToast.warning("处罚信息未保存，稍后可在详情页补录");
        }
      } else if (caseId && accountId === "none") {
        feedbackToast.warning("未选择账号，处罚信息未记录");
      }

      router.push(caseId ? `/violations/${caseId}` : "/violations");
      router.refresh();
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "提交失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        {PATH_OPTIONS.map(({ key, title, description, icon: Icon }) => {
          const active = submissionPath === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSubmissionPath(key)}
              aria-pressed={active}
              className={cn(
                "group flex items-start gap-3 rounded-2xl border bg-white p-5 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-sm",
                active ? "border-[#D97757]/50 bg-[#D97757]/5" : "border-zinc-200 hover:border-zinc-300",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                  active ? "border-[#D97757]/30 bg-white text-[#D97757]" : "border-zinc-200 bg-zinc-50 text-zinc-500",
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-800">{title}</span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500">{description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <Label htmlFor="script_text" className="text-sm font-semibold text-zinc-800">
          话术原文 <span className="text-[#C9604D]">*</span>
        </Label>
        <Textarea
          id="script_text"
          name="script_text"
          required
          rows={7}
          placeholder="原封不动粘贴话术内容"
          className="mt-2 rounded-2xl border-zinc-200 bg-zinc-50 text-[14px] leading-7"
        />
      </div>

      <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 md:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-zinc-800">
            {submissionPath === "violation" ? "违规分类" : "话术形式"}
          </Label>
          {submissionPath === "violation" ? (
            <Select value={category} onValueChange={(value) => setCategory(value as typeof category)}>
              <SelectTrigger className="h-11 w-full rounded-2xl border-zinc-200 bg-zinc-50">
                <SelectValue placeholder="选择分类" />
              </SelectTrigger>
              <SelectContent>
                {VIOLATION_CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={scriptFormat} onValueChange={(value) => setScriptFormat(value as ScriptFormat)}>
              <SelectTrigger className="h-11 w-full rounded-2xl border-zinc-200 bg-zinc-50">
                <SelectValue placeholder="选择形式" />
              </SelectTrigger>
              <SelectContent>
                {SCRIPT_FORMAT_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {submissionPath === "conversion" ? (
          <div className="space-y-2">
            <Label htmlFor="used_at" className="text-sm font-semibold text-zinc-800">使用日期</Label>
            <Input
              id="used_at"
              type="date"
              value={usedAt}
              onChange={(event) => setUsedAt(event.currentTarget.value)}
              className="h-11 rounded-2xl border-zinc-200 bg-zinc-50"
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-zinc-800">账号</Label>
          <Select value={accountId} onValueChange={(value) => value && setAccountId(value)}>
            <SelectTrigger className="h-11 w-full rounded-2xl border-zinc-200 bg-zinc-50">
              <SelectValue placeholder="可不选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不确定哪个号</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.display_name || account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="space-y-2">
            <Label htmlFor="scene_description" className="text-sm font-semibold text-zinc-800">
              {submissionPath === "violation" ? "违规场景 / 风险点" : "有效场景"}
            </Label>
            <Textarea
              id="scene_description"
              name="scene_description"
              rows={5}
              placeholder={submissionPath === "violation" ? "描述画面、导粉方式或出现问题的上下文" : "描述这句话在什么内容、账号或人群里有效"}
              className="rounded-2xl border-zinc-200 bg-zinc-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="result" className="text-sm font-semibold text-zinc-800">
              {submissionPath === "violation" ? "测试结果" : "转化结果"}
            </Label>
            <Input
              id="result"
              name="result"
              placeholder={submissionPath === "violation" ? "如:限流 3 天、正常过审" : "如:评论区导粉更顺、私信咨询增加"}
              className="h-11 rounded-2xl border-zinc-200 bg-zinc-50"
            />
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm font-semibold text-zinc-800">
                {submissionPath === "violation" ? "为什么危险" : "适合推广 / 测试 / 沉淀的理由"}
              </Label>
              <Textarea
                id="reason"
                name="reason"
                rows={3}
                placeholder={submissionPath === "violation" ? "说明容易触发平台风险的原因" : "说明为什么值得继续推广、测试或沉淀成模板"}
                className="rounded-2xl border-zinc-200 bg-zinc-50 text-sm leading-6"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review_suggestion" className="text-sm font-semibold text-zinc-800">
                {submissionPath === "violation" ? "复核建议" : "下一步动作"}
              </Label>
              <Input
                id="review_suggestion"
                name="review_suggestion"
                placeholder={submissionPath === "violation" ? "如:建议禁用、建议改写后复测" : "如:本周推广、继续 A/B 测试、沉淀模板"}
                className="h-11 rounded-2xl border-zinc-200 bg-zinc-50"
              />
            </div>
            {submissionPath === "violation" ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4">
              <Label htmlFor="screenshots" className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-zinc-700">
                <Upload className="size-4" />
                上传截图，最多 5 张
              </Label>
              <Input
                id="screenshots"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={isUploading || screenshots.length >= 5}
                onChange={(event) => uploadScreenshots(event.currentTarget.files)}
                className="mt-3 h-11 rounded-2xl bg-white"
              />
              {screenshots.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {screenshots.map((item) => (
                    <span key={item.path} className="inline-flex max-w-full items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">
                      <span className="truncate">{item.name}</span>
                      <button
                        type="button"
                        onClick={() => setScreenshots((current) => current.filter((screenshot) => screenshot.path !== item.path))}
                        className="text-zinc-400 hover:text-zinc-800"
                        aria-label="移除截图"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            ) : null}
          </div>
        </div>

        {submissionPath === "violation" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="relative pl-5">
            <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[#D97757]" />
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-sm font-medium text-zinc-800">处罚信息</h3>
              <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">punishment</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-zinc-600">处罚类型</Label>
                <div className="flex flex-wrap gap-2">
                  {VIOLATION_EVENT_TYPES.map((type) => {
                    const active = eventType === type;
                    return (
                      <motion.button
                        key={type}
                        type="button"
                        layout
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        onClick={() => setEventType(type)}
                        className={cn(
                          "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "border-transparent bg-[#D97757] text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400",
                        )}
                      >
                        {type}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="occurred_at" className="text-xs font-semibold text-zinc-600">
                    发生时间
                  </Label>
                  <Input
                    id="occurred_at"
                    type="datetime-local"
                    value={occurredAt}
                    onChange={(event) => setOccurredAt(event.currentTarget.value)}
                    className="h-11 rounded-2xl border-zinc-200 bg-zinc-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-zinc-600">申诉状态</Label>
                  <Select value={appealStatus} onValueChange={(value) => value && setAppealStatus(value as AppealStatus)}>
                    <SelectTrigger className="h-11 w-full rounded-2xl border-zinc-200 bg-zinc-50">
                      <SelectValue>{appealStatus}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {APPEAL_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="platform_notice" className="text-xs font-semibold text-zinc-600">
                  平台通知文本 <span className="font-normal text-zinc-400">可选</span>
                </Label>
                <Textarea
                  id="platform_notice"
                  rows={3}
                  value={platformNotice}
                  onChange={(event) => setPlatformNotice(event.currentTarget.value)}
                  placeholder="粘贴平台发来的原文通知"
                  className="rounded-2xl border-zinc-200 bg-zinc-50 text-sm leading-6"
                />
              </div>

              <AnimatePresence initial={false}>
                {showAppealResult && (
                  <motion.div
                    key="appeal_result"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 pt-1">
                      <Label htmlFor="appeal_result" className="text-xs font-semibold text-zinc-600">
                        申诉结果
                      </Label>
                      <Textarea
                        id="appeal_result"
                        rows={3}
                        value={appealResult}
                        onChange={(event) => setAppealResult(event.currentTarget.value)}
                        placeholder="填写申诉过程/平台回复"
                        className="rounded-2xl border-zinc-200 bg-zinc-50 text-sm leading-6"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {showRecoveredAt && (
                  <motion.div
                    key="recovered_at"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 pt-1">
                      <Label htmlFor="recovered_at" className="text-xs font-semibold text-zinc-600">
                        恢复时间
                      </Label>
                      <Input
                        id="recovered_at"
                        type="datetime-local"
                        value={recoveredAt}
                        onChange={(event) => setRecoveredAt(event.currentTarget.value)}
                        className="h-11 rounded-2xl border-zinc-200 bg-zinc-50"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="relative pl-5">
              <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[#6FAA7D]" />
              <div className="mb-4 flex items-center gap-2">
                <h3 className="text-sm font-medium text-zinc-800">使用数据</h3>
                <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">conversion</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="views" className="text-xs font-semibold text-zinc-600">展示量</Label>
                  <Input
                    id="views"
                    value={views}
                    onChange={(event) => setViews(event.currentTarget.value)}
                    inputMode="numeric"
                    placeholder="如: 1200"
                    className="h-11 rounded-2xl border-zinc-200 bg-zinc-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="follows" className="text-xs font-semibold text-zinc-600">涨粉数</Label>
                  <Input
                    id="follows"
                    value={follows}
                    onChange={(event) => setFollows(event.currentTarget.value)}
                    inputMode="numeric"
                    placeholder="如: 18"
                    className="h-11 rounded-2xl border-zinc-200 bg-zinc-50"
                  />
                </div>
              </div>
              <p className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-500">
                转化路径会写入“转化话术”和“使用记录”；风险复核仍从违规路径或后续详情页补录，不在这里混成一个下拉。
              </p>
            </div>
          </div>
        )}
      </div>

      {submissionPath === "violation" ? (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="relative pl-5">
          <div
            className={cn(
              "absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full",
              reasonTagMissing ? "bg-[#C9604D]" : "bg-[#D97757]",
            )}
          />
          <div className="mb-4 flex items-center gap-2">
            <h3 className="text-sm font-medium text-zinc-800">原因标签</h3>
            <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">required</span>
            {reasonTagIds.length > 0 && (
              <span className="text-[11px] font-medium text-zinc-500">已选 {reasonTagIds.length}</span>
            )}
          </div>

          {isLoadingTags ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-8 w-20 animate-pulse rounded-full bg-zinc-100"
                />
              ))}
            </div>
          ) : reasonTagsError ? (
            <p className="text-xs font-medium text-[#C9604D]">{reasonTagsError}</p>
          ) : reasonTags.length === 0 ? (
            <p className="text-xs text-zinc-500">暂无可用原因标签，请联系管理员配置</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {reasonTags.map((tag) => {
                const active = reasonTagIds.includes(tag.id);
                return (
                  <motion.button
                    key={tag.id}
                    type="button"
                    layout
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    onClick={() => toggleReasonTag(tag.id)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-transparent bg-[#D97757] text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400",
                    )}
                  >
                    {tag.name}
                  </motion.button>
                );
              })}
            </div>
          )}

          {reasonTagMissing && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 text-xs font-medium text-[#C9604D]"
            >
              至少选择一个原因标签
            </motion.p>
          )}
        </div>
      </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => router.push("/violations")}>
          返回列表
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || isUploading}
          className={cn(
            "h-11 rounded-2xl bg-zinc-900 px-6 text-white hover:bg-zinc-800",
            isSubmitting && "opacity-70",
          )}
        >
          {isSubmitting ? "提交中..." : submissionPath === "violation" ? "提交违规案例" : "提交转化话术"}
        </Button>
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

function getUsageCaseId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: { case_id?: unknown }; case_id?: unknown }).data;
  const id = data?.case_id ?? (payload as { case_id?: unknown }).case_id;
  return typeof id === "string" ? id : null;
}

function getUploadedPath(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const path = (payload as { path?: unknown }).path;
  return typeof path === "string" ? path : null;
}
