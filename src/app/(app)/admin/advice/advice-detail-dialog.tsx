"use client";

import { useState, useTransition } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReviewResult } from "@/types";

import type { AdviceRow } from "./page";

interface AdviceDetailDialogProps {
  advice: AdviceRow | null;
  currentUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (item: AdviceRow) => void;
}

const STATUS_STYLES = {
  待查看: "border-zinc-200 bg-zinc-100 text-zinc-700",
  已查看: "border-zinc-200 bg-zinc-100 text-zinc-600",
  待执行: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  已执行: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
  已忽略: "border-zinc-200 bg-zinc-50 text-zinc-500",
  已复核: "border-zinc-200 bg-zinc-100 text-zinc-700",
} as const;

type LocalStatus = "已查看" | "待执行" | "已执行" | "已忽略";

function statusLabel(value: LocalStatus) {
  return value;
}

function reviewLabel(value: ReviewResult) {
  return value;
}

function pickSingle<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center border-l-2 border-[#D97757] pl-3">
      <h3 className="text-[14px] font-medium tracking-tight text-zinc-800">{children}</h3>
    </div>
  );
}

export function AdviceDetailDialog({ advice, currentUserId, open, onOpenChange, onUpdated }: AdviceDetailDialogProps) {
  const [reviewResult, setReviewResult] = useState<ReviewResult>("有效");
  const [isPending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState<LocalStatus>("已执行");

  const targetProfile = pickSingle(advice?.target_profile);
  const targetAccount = pickSingle(advice?.target_account);
  const assignedProfile = pickSingle(advice?.assigned_profile);
  const reviewedProfile = pickSingle(advice?.reviewed_profile);
  const relatedVideo = pickSingle(advice?.related_video);

  function submitAction(body: Record<string, string>) {
    if (!advice) return;
    const previousAdvice = advice;
    const optimisticAdvice = {
      ...advice,
      status:
        body.action === "assign"
          ? "待执行"
          : body.action === "status"
            ? body.status
            : body.action === "review"
              ? "已复核"
              : advice.status,
      review_result:
        body.action === "review" ? body.review_result : advice.review_result,
    } as AdviceRow;

    onUpdated(optimisticAdvice);
    feedbackToast.success("建议已更新");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/advice-actions/${advice.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "更新失败");
        }

        onUpdated(result.item as AdviceRow);
      } catch (error) {
        onUpdated(previousAdvice);
        feedbackToast.error(error instanceof Error ? error.message : "更新失败");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-3xl">
        <SheetHeader>
          <SheetTitle className="text-[18px] font-medium tracking-tight">转化建议详情</SheetTitle>
        </SheetHeader>
        <SheetBody>

        {advice ? (
          <div className="space-y-6">
            <section className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="text-[18px] font-medium tracking-tight text-zinc-800">{targetProfile?.name || "未命名员工"}</div>
                  <div className="text-[12px] text-zinc-500">账号：{targetAccount?.name || "-"} · 来源：{advice.advice_source === "ai" ? "AI" : "管理员"}</div>
                </div>
                <Badge variant="outline" className={`text-[12px] ${STATUS_STYLES[advice.status]}`}>
                  {advice.status}
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="text-[11px] text-zinc-400">创建时间</div>
                  <div className="mt-1 text-[13px] text-zinc-700">{formatDateTime(advice.created_at)}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="text-[11px] text-zinc-400">更新时间</div>
                  <div className="mt-1 text-[13px] text-zinc-700">{formatDateTime(advice.updated_at)}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="text-[11px] text-zinc-400">下发管理员</div>
                  <div className="mt-1 text-[13px] text-zinc-700">{assignedProfile?.name || "-"}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="text-[11px] text-zinc-400">复核结果</div>
                  <div className="mt-1 text-[13px] text-zinc-700">{advice.review_result || "-"}</div>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <SectionTitle>完整建议</SectionTitle>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 whitespace-pre-wrap break-words text-[13px] leading-6 text-zinc-700">
                {advice.advice_content}
              </div>
            </section>

            <section className="space-y-2">
              <SectionTitle>证据</SectionTitle>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 whitespace-pre-wrap break-words text-[13px] leading-6 text-zinc-700">
                {advice.evidence || "暂无证据"}
              </div>
            </section>

            <section className="space-y-2">
              <SectionTitle>管理操作</SectionTitle>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="text-[12px] font-medium text-zinc-700">下发</div>
                  <div className="text-[11px] text-zinc-500">记录当前管理员并将状态更新为待执行。</div>
                  <Button
                    className="h-9 w-full rounded-lg bg-[#D97757] text-[13px] text-white hover:bg-[#C96442] active:translate-y-0"
                    disabled={isPending}
                    onClick={() => submitAction({ action: "assign", actor: currentUserId })}
                  >
                    {isPending ? "提交中..." : "标记为待执行"}
                  </Button>
                </div>

                <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="text-[12px] font-medium text-zinc-700">状态更新</div>
                  <Select value={localStatus} onValueChange={(value) => setLocalStatus((value || "已执行") as LocalStatus)}>
                    <SelectTrigger className="h-9 rounded-xl bg-white text-[13px]">
                      <SelectValue>{statusLabel(localStatus)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="已查看">已查看</SelectItem>
                      <SelectItem value="待执行">待执行</SelectItem>
                      <SelectItem value="已执行">已执行</SelectItem>
                      <SelectItem value="已忽略">已忽略</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="h-9 w-full rounded-xl bg-white text-[13px]"
                    disabled={isPending}
                    onClick={() => submitAction({ action: "status", status: localStatus })}
                  >
                    应用状态
                  </Button>
                </div>

                <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="text-[12px] font-medium text-zinc-700">复核</div>
                  <Select value={reviewResult} onValueChange={(value) => setReviewResult(value as ReviewResult)}>
                    <SelectTrigger className="h-9 rounded-xl bg-white text-[13px]">
                      <SelectValue>{reviewLabel(reviewResult)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="有效">有效</SelectItem>
                      <SelectItem value="无效">无效</SelectItem>
                      <SelectItem value="不确定">不确定</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="h-9 w-full rounded-xl bg-white text-[13px]"
                    disabled={isPending}
                    onClick={() => submitAction({ action: "review", review_result: reviewResult })}
                  >
                    提交复核
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[11px] text-zinc-500">
                当前复核人：{reviewedProfile?.name || "-"}
              </div>
            </section>

            <section className="space-y-2">
              <SectionTitle>关联视频</SectionTitle>
              {relatedVideo ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="text-[11px] text-zinc-400">视频标题</div>
                    <div className="mt-1 line-clamp-3 break-words text-[13px] text-zinc-700">{relatedVideo.video_title?.trim() || "未命名视频"}</div>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="text-[11px] text-zinc-400">发布时间</div>
                    <div className="mt-1 text-[13px] text-zinc-700">{formatDateTime(relatedVideo.published_at)}</div>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="text-[11px] text-zinc-400">视频链接</div>
                    <div className="mt-1 break-all text-[13px] text-zinc-700">
                      {relatedVideo.video_url ? (
                        <a href={relatedVideo.video_url} target="_blank" rel="noreferrer" className="text-[#D97757] underline underline-offset-4">
                          {relatedVideo.video_url}
                        </a>
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[13px] text-zinc-500">暂无关联视频。</div>
              )}
            </section>
          </div>
        ) : null}
      </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
