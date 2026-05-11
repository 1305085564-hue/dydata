"use client";

import { useState, useTransition } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  待执行: "border-zinc-200 bg-[#D99E55]/10 text-[#D99E55]",
  已执行: "border-zinc-200 bg-[#6FAA7D]/10 text-[#6FAA7D]",
  已忽略: "border-zinc-200 bg-zinc-50 text-zinc-500",
  已复核: "border-zinc-200 bg-zinc-100 text-zinc-700",
} as const;

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

export function AdviceDetailDialog({ advice, currentUserId, open, onOpenChange, onUpdated }: AdviceDetailDialogProps) {
  const [reviewResult, setReviewResult] = useState<ReviewResult>("有效");
  const [isPending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState<string>("已执行");

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl rounded-2xl border-zinc-200 bg-white p-0 shadow-sm sm:max-w-4xl">
        <DialogHeader className="border-b border-border/60 px-6 py-5 sm:px-7">
          <DialogTitle className="text-xl font-semibold tracking-tight">建议详情</DialogTitle>
        </DialogHeader>

        {advice ? (
          <div className="max-h-[80vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-7">
            <section className="space-y-4 rounded-2xl bg-muted/35 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="text-lg font-semibold text-foreground">{targetProfile?.name || "未命名员工"}</div>
                  <div className="text-sm text-muted-foreground">账号：{targetAccount?.name || "-"} · 来源：{advice.advice_source === "ai" ? "AI" : "管理员"}</div>
                </div>
                <Badge variant="outline" className={STATUS_STYLES[advice.status]}>
                  {advice.status}
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-background/80 p-4">
                  <div className="text-xs text-muted-foreground">创建时间</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{formatDateTime(advice.created_at)}</div>
                </div>
                <div className="rounded-2xl bg-background/80 p-4">
                  <div className="text-xs text-muted-foreground">更新时间</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{formatDateTime(advice.updated_at)}</div>
                </div>
                <div className="rounded-2xl bg-background/80 p-4">
                  <div className="text-xs text-muted-foreground">下发管理员</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{assignedProfile?.name || "-"}</div>
                </div>
                <div className="rounded-2xl bg-background/80 p-4">
                  <div className="text-xs text-muted-foreground">复核结果</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{advice.review_result || "-"}</div>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl bg-muted/35 p-5">
              <div className="text-[18px] font-medium text-foreground">完整建议</div>
              <div className="rounded-2xl bg-background/80 p-4 whitespace-pre-wrap text-sm leading-6 text-foreground">{advice.advice_content}</div>
            </section>

            <section className="space-y-4 rounded-2xl bg-muted/35 p-5">
              <div className="text-[18px] font-medium text-foreground">证据</div>
              <div className="rounded-2xl bg-background/80 p-4 whitespace-pre-wrap text-sm leading-6 text-foreground">{advice.evidence || "暂无证据"}</div>
            </section>

            <section className="space-y-4 rounded-2xl bg-muted/35 p-5">
              <div className="text-[18px] font-medium text-foreground">管理操作</div>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-3 rounded-2xl bg-background/80 p-4">
                  <div className="text-sm font-medium text-foreground">下发</div>
                  <div className="text-xs text-muted-foreground">记录当前管理员并将状态更新为待执行。</div>
                  <Button className="w-full rounded-2xl" disabled={isPending} onClick={() => submitAction({ action: "assign", actor: currentUserId })}>
                    {isPending ? "提交中..." : "标记为待执行"}
                  </Button>
                </div>

                <div className="space-y-3 rounded-2xl bg-background/80 p-4">
                  <div className="text-sm font-medium text-foreground">状态更新</div>
                  <Select value={localStatus} onValueChange={(value) => setLocalStatus(value || "已执行")}>
                    <SelectTrigger className="h-11 rounded-2xl bg-muted/35">
                      <SelectValue placeholder="选择状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="已查看">已查看</SelectItem>
                      <SelectItem value="待执行">待执行</SelectItem>
                      <SelectItem value="已执行">已执行</SelectItem>
                      <SelectItem value="已忽略">已忽略</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" className="w-full rounded-2xl bg-muted/40" disabled={isPending} onClick={() => submitAction({ action: "status", status: localStatus })}>
                    应用状态
                  </Button>
                </div>

                <div className="space-y-3 rounded-2xl bg-background/80 p-4">
                  <div className="text-sm font-medium text-foreground">复核</div>
                  <Select value={reviewResult} onValueChange={(value) => setReviewResult(value as ReviewResult)}>
                    <SelectTrigger className="h-11 rounded-2xl bg-muted/35">
                      <SelectValue placeholder="选择复核结果" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="有效">有效</SelectItem>
                      <SelectItem value="无效">无效</SelectItem>
                      <SelectItem value="不确定">不确定</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" className="w-full rounded-2xl bg-muted/40" disabled={isPending} onClick={() => submitAction({ action: "review", review_result: reviewResult })}>
                    提交复核
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl bg-background/80 p-4 text-xs text-muted-foreground">
                当前复核人：{reviewedProfile?.name || "-"}
              </div>
            </section>

            <section className="space-y-4 rounded-2xl bg-muted/35 p-5">
              <div className="text-[18px] font-medium text-foreground">关联视频</div>
              {relatedVideo ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl bg-background/80 p-4">
                    <div className="text-xs text-muted-foreground">视频标题</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{relatedVideo.video_title?.trim() || "未命名视频"}</div>
                  </div>
                  <div className="rounded-2xl bg-background/80 p-4">
                    <div className="text-xs text-muted-foreground">发布时间</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{formatDateTime(relatedVideo.published_at)}</div>
                  </div>
                  <div className="rounded-2xl bg-background/80 p-4">
                    <div className="text-xs text-muted-foreground">视频链接</div>
                    <div className="mt-1 text-sm font-medium text-foreground break-all">
                      {relatedVideo.video_url ? (
                        <a href={relatedVideo.video_url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
                          {relatedVideo.video_url}
                        </a>
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-background/80 p-4 text-sm text-muted-foreground">暂无关联视频。</div>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
