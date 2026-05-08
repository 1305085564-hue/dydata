"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
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
import { VIOLATION_CATEGORIES } from "./format";
import type { ViolationAccount } from "./types";

type UploadedScreenshot = {
  path: string;
  name: string;
};

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
  const [isViolation, setIsViolation] = useState("true");
  const [category, setCategory] = useState<(typeof VIOLATION_CATEGORIES)[number]>("下粉");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [screenshots, setScreenshots] = useState<UploadedScreenshot[]>([]);

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
      const response = await fetch("/api/violations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script_text: scriptText,
          is_violation: isViolation === "true",
          category,
          account_id: accountId === "none" ? null : accountId,
          scene_description: String(form.get("scene_description") ?? "").trim() || null,
          result: String(form.get("result") ?? "").trim() || null,
          screenshot_paths: screenshots.map((item) => item.path),
        }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiErrorMessage(payload, "提交失败"));

      const caseId = getCreatedCaseId(payload);
      feedbackToast.success("已提交，等待管理员确认");
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
      <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm">
        <Label htmlFor="script_text" className="text-sm font-semibold text-zinc-900">
          话术原文 <span className="text-rose-600">*</span>
        </Label>
        <Textarea
          id="script_text"
          name="script_text"
          required
          rows={7}
          placeholder="原封不动粘贴话术内容"
          className="mt-2 rounded-2xl border-zinc-200 bg-zinc-50 text-base leading-7"
        />
      </div>

      <div className="grid gap-4 rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm md:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-zinc-900">判断</Label>
          <Select value={isViolation} onValueChange={(value) => value && setIsViolation(value)}>
            <SelectTrigger className="h-11 w-full rounded-2xl border-zinc-200 bg-zinc-50">
              <SelectValue placeholder="是否违规" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">违规</SelectItem>
              <SelectItem value="false">未违规可用</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-zinc-900">分类</Label>
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
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-zinc-900">账号</Label>
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

      <div className="grid gap-4 rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="scene_description" className="text-sm font-semibold text-zinc-900">
            配套画面/导粉方式
          </Label>
          <Textarea
            id="scene_description"
            name="scene_description"
            rows={5}
            placeholder="描述画面、导粉方式或出现问题的上下文"
            className="rounded-2xl border-zinc-200 bg-zinc-50"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="result" className="text-sm font-semibold text-zinc-900">
            结果描述
          </Label>
          <Input
            id="result"
            name="result"
            placeholder="如：限流 3 天、正常过审"
            className="h-11 rounded-2xl border-zinc-200 bg-zinc-50"
          />
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
                      className="text-zinc-400 hover:text-zinc-900"
                      aria-label="移除截图"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => router.push("/violations")}>
          返回列表
        </Button>
        <Button type="submit" disabled={isSubmitting || isUploading} className="h-11 rounded-2xl bg-zinc-950 px-6 text-white hover:bg-zinc-800">
          {isSubmitting ? "提交中..." : "提交案例"}
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

function getUploadedPath(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const path = (payload as { path?: unknown }).path;
  return typeof path === "string" ? path : null;
}
