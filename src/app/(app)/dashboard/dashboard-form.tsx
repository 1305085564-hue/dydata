"use client";

import { useTransition, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { submitReport } from "./actions";

interface ReportData {
  id: string;
  title: string;
  report_date: string;
  play_count: number | null;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  content: string | null;
  published_at: string | null;
}

interface Props {
  userId: string;
  today: string;
  existingData?: ReportData | null;
}

function stripSuffix(val: string | null, suffix: string): string {
  if (!val) return "";
  return val.replace(suffix, "");
}

export function DashboardForm({ userId, today, existingData }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("提交成功");
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await submitReport(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setSuccessMsg(result?.isUpdate ? "修改成功" : "提交成功");
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2500);
      }
    });
  }

  return (
    <div className="relative">
      {/* 成功弹窗 */}
      {showSuccess && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-green-100 animate-ping opacity-30" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 text-green-600">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
            <p className="text-xl font-semibold text-green-600">{successMsg}</p>
          </div>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 pb-20 sm:pb-0">
        <input type="hidden" name="user_id" value={userId} />

        {/* 基本信息 */}
        <Card className="card-elevated">
          <CardContent className="pt-5 pb-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground tracking-wide">基本信息</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="title">视频标题</Label>
                <Input id="title" name="title" placeholder="请输入视频标题" required className="h-10" defaultValue={existingData?.title ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report_date">提交日期</Label>
                <Input id="report_date" name="report_date" type="date" defaultValue={existingData?.report_date ?? today} required className="h-10 text-base" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="play_count">播放量</Label>
                <div className="relative">
                  <Input id="play_count" name="play_count" type="number" step="0.01" min={0} placeholder="3.21" required className="pr-10 h-10" defaultValue={existingData?.play_count != null ? (existingData.play_count / 10000).toFixed(2) : ""} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">万</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 核心指标 */}
        <Card className="card-elevated">
          <CardContent className="pt-5 pb-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground tracking-wide">核心指标</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="completion_rate">完播率</Label>
                <div className="relative">
                  <Input id="completion_rate" name="completion_rate" type="number" step="0.01" min={0} max={100} placeholder="14.81" className="pr-8 h-10" defaultValue={stripSuffix(existingData?.completion_rate ?? null, "%")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avg_play_duration">平均播放时长</Label>
                <div className="relative">
                  <Input id="avg_play_duration" name="avg_play_duration" type="number" step="0.1" min={0} placeholder="56" className="pr-8 h-10" defaultValue={stripSuffix(existingData?.avg_play_duration ?? null, "秒")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">秒</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bounce_rate_2s">2s跳出率</Label>
                <div className="relative">
                  <Input id="bounce_rate_2s" name="bounce_rate_2s" type="number" step="0.01" min={0} max={100} placeholder="30" className="pr-8 h-10" defaultValue={stripSuffix(existingData?.bounce_rate_2s ?? null, "%")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="completion_rate_5s">5s完播率</Label>
                <div className="relative">
                  <Input id="completion_rate_5s" name="completion_rate_5s" type="number" step="0.01" min={0} max={100} placeholder="20" className="pr-8 h-10" defaultValue={stripSuffix(existingData?.completion_rate_5s ?? null, "%")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 互动指标 */}
        <Card className="card-elevated">
          <CardContent className="pt-5 pb-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground tracking-wide">互动指标</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="likes">点赞</Label>
                <Input id="likes" name="likes" type="number" min={0} defaultValue={existingData?.likes ?? 0} required className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comments">评论</Label>
                <Input id="comments" name="comments" type="number" min={0} defaultValue={existingData?.comments ?? 0} required className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shares">分享</Label>
                <Input id="shares" name="shares" type="number" min={0} defaultValue={existingData?.shares ?? 0} required className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="favorites">收藏</Label>
                <Input id="favorites" name="favorites" type="number" min={0} defaultValue={existingData?.favorites ?? 0} required className="h-10" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 文案与发布时间 */}
        <Card className="card-elevated">
          <CardContent className="pt-5 pb-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground tracking-wide">补充信息</h3>
            <div className="space-y-1.5">
              <Label htmlFor="content">文案内容（选填）</Label>
              <textarea
                id="content"
                name="content"
                placeholder="粘贴今日发布的视频文案（选填）"
                className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                defaultValue={existingData?.content ?? ""}
              />
            </div>
            <div className="space-y-1.5 sm:w-1/2">
              <Label htmlFor="published_at">发布时间（选填）</Label>
              <Input
                id="published_at"
                name="published_at"
                type="datetime-local"
                className="h-10"
                defaultValue={existingData?.published_at ? existingData.published_at.slice(0, 16) : ""}
              />
            </div>
          </CardContent>
        </Card>

        {/* 桌面端提交按钮 */}
        <div className="hidden sm:block">
          <Button type="submit" disabled={isPending} className="w-auto">
            {isPending ? "提交中..." : existingData ? "修改日报" : "提交日报"}
          </Button>
        </div>

        {/* 手机端底部固定提交按钮 */}
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/90 backdrop-blur-md p-4 sm:hidden">
          <Button type="submit" disabled={isPending} className="w-full h-12 text-base">
            {isPending ? "提交中..." : existingData ? "修改日报" : "提交日报"}
          </Button>
        </div>
      </form>
    </div>
  );
}
