"use client";

import { useState, useTransition } from "react";
import { ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ScreenshotImport,
  type ScreenshotImportEditableValues,
} from "@/components/screenshot-import";
import { submitReport } from "./actions";
import { getDefaultPublishedAtValue, normalizePublishedAtInputValue } from "@/lib/日报";

export interface DashboardReportData {
  id: string;
  account_id: string;
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
  follower_gain: number;
  follower_convert: number | null;
  content: string | null;
  published_at: string | null;
  uploaded_at: string;
}

export interface DashboardAccountOption {
  id: string;
  name: string;
}

interface Props {
  accounts: DashboardAccountOption[];
  defaultAccountId?: string;
  today: string;
  existingData?: DashboardReportData | null;
}

type OcrFieldKey =
  | "play_count"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "follower_gain";

type OcrFormState = Record<OcrFieldKey, string>;

function stripSuffix(val: string | null, suffix: string): string {
  if (!val) return "";
  return val.replace(suffix, "");
}

function getInitialOcrState(existingData?: DashboardReportData | null): OcrFormState {
  return {
    play_count:
      existingData?.play_count != null ? (existingData.play_count / 10000).toFixed(2) : "",
    likes: existingData?.likes != null ? String(existingData.likes) : "0",
    comments: existingData?.comments != null ? String(existingData.comments) : "0",
    shares: existingData?.shares != null ? String(existingData.shares) : "0",
    favorites: existingData?.favorites != null ? String(existingData.favorites) : "0",
    follower_gain:
      existingData?.follower_gain != null ? String(existingData.follower_gain) : "0",
  };
}

function normalizeImportedValues(values: ScreenshotImportEditableValues): OcrFormState {
  return {
    play_count: values.play_count.trim(),
    likes: values.likes.trim(),
    comments: values.comments.trim(),
    shares: values.shares.trim(),
    favorites: values.favorites.trim(),
    follower_gain: values.follower_gain.trim(),
  };
}

export function DashboardForm({ accounts, defaultAccountId, today, existingData }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("提交成功");
  const [ocrValues, setOcrValues] = useState<OcrFormState>(() => getInitialOcrState(existingData));
  const [isImportOpen, setIsImportOpen] = useState(false);
  const formKey = existingData?.id ?? `new-${defaultAccountId ?? accounts[0]?.id ?? "default"}`;
  const selectedAccountId = defaultAccountId ?? accounts[0]?.id ?? "";

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

  function handleImportConfirm(values: ScreenshotImportEditableValues) {
    setOcrValues(normalizeImportedValues(values));
    setIsImportOpen(false);
    toast.success("截图数据已回填，可继续检查后提交");
  }

  function updateOcrValue(field: OcrFieldKey, value: string) {
    setOcrValues((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="relative">
      {showSuccess && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm">
          <div className="flex animate-in fade-in zoom-in duration-300 flex-col items-center gap-4">
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

      <form key={formKey} onSubmit={handleSubmit} className="space-y-5 pb-20 sm:pb-0">
        <input type="hidden" name="account_id" value={selectedAccountId} />

        <Card className="card-elevated border-dashed bg-background/70 backdrop-blur-sm">
          <CardContent className="flex flex-col gap-4 pt-5 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold tracking-wide text-foreground">截图识别导入</h3>
              <p className="text-sm text-muted-foreground">
                上传抖音数据截图，自动提取播放、互动与涨粉指标，再手动校对后回填。
              </p>
            </div>
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
              <DialogTrigger
                render={
                  <Button type="button" variant="outline" className="w-full sm:w-auto" />
                }
              >
                <ScanSearch className="size-4" />
                截图识别导入
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                <DialogHeader>
                  <DialogTitle>截图识别导入</DialogTitle>
                  <DialogDescription>
                    支持 jpg、png、webp。识别结果可逐项修改，确认后才会写回主表单。
                  </DialogDescription>
                </DialogHeader>
                <ScreenshotImport initialValues={ocrValues} onConfirm={handleImportConfirm} />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardContent className="space-y-4 pt-5 pb-5">
            <h3 className="text-sm font-semibold tracking-wide text-foreground">基本信息</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="account_id">账号</Label>
                <Select value={selectedAccountId} disabled>
                  <SelectTrigger id="account_id" className="h-10 w-full">
                    <SelectValue placeholder="请选择账号" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
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
                  <Input
                    id="play_count"
                    name="play_count"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="3.21"
                    required
                    className="h-10 pr-10"
                    value={ocrValues.play_count}
                    onChange={(e) => updateOcrValue("play_count", e.target.value)}
                  />
                  <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">万</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="follower_gain">涨粉</Label>
                <Input
                  id="follower_gain"
                  name="follower_gain"
                  type="number"
                  min={0}
                  required
                  className="h-10"
                  value={ocrValues.follower_gain}
                  onChange={(e) => updateOcrValue("follower_gain", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardContent className="space-y-4 pt-5 pb-5">
            <h3 className="text-sm font-semibold tracking-wide text-foreground">核心指标</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="completion_rate">完播率</Label>
                <div className="relative">
                  <Input id="completion_rate" name="completion_rate" type="number" step="0.01" min={0} max={100} placeholder="14.81" className="h-10 pr-8" defaultValue={stripSuffix(existingData?.completion_rate ?? null, "%")} />
                  <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avg_play_duration">平均播放时长</Label>
                <div className="relative">
                  <Input id="avg_play_duration" name="avg_play_duration" type="number" step="0.1" min={0} placeholder="56" className="h-10 pr-8" defaultValue={stripSuffix(existingData?.avg_play_duration ?? null, "秒")} />
                  <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">秒</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bounce_rate_2s">2s跳出率</Label>
                <div className="relative">
                  <Input id="bounce_rate_2s" name="bounce_rate_2s" type="number" step="0.01" min={0} max={100} placeholder="30" className="h-10 pr-8" defaultValue={stripSuffix(existingData?.bounce_rate_2s ?? null, "%")} />
                  <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="completion_rate_5s">5s完播率</Label>
                <div className="relative">
                  <Input id="completion_rate_5s" name="completion_rate_5s" type="number" step="0.01" min={0} max={100} placeholder="20" className="h-10 pr-8" defaultValue={stripSuffix(existingData?.completion_rate_5s ?? null, "%")} />
                  <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="follower_convert">导粉（选填）</Label>
                <Input id="follower_convert" name="follower_convert" type="number" min={0} defaultValue={existingData?.follower_convert ?? ""} className="h-10" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardContent className="space-y-4 pt-5 pb-5">
            <h3 className="text-sm font-semibold tracking-wide text-foreground">互动指标</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="likes">点赞</Label>
                <Input
                  id="likes"
                  name="likes"
                  type="number"
                  min={0}
                  required
                  className="h-10"
                  value={ocrValues.likes}
                  onChange={(e) => updateOcrValue("likes", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comments">评论</Label>
                <Input
                  id="comments"
                  name="comments"
                  type="number"
                  min={0}
                  required
                  className="h-10"
                  value={ocrValues.comments}
                  onChange={(e) => updateOcrValue("comments", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shares">分享</Label>
                <Input
                  id="shares"
                  name="shares"
                  type="number"
                  min={0}
                  required
                  className="h-10"
                  value={ocrValues.shares}
                  onChange={(e) => updateOcrValue("shares", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="favorites">收藏</Label>
                <Input
                  id="favorites"
                  name="favorites"
                  type="number"
                  min={0}
                  required
                  className="h-10"
                  value={ocrValues.favorites}
                  onChange={(e) => updateOcrValue("favorites", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardContent className="space-y-4 pt-5 pb-5">
            <h3 className="text-sm font-semibold tracking-wide text-foreground">补充信息</h3>
            <div className="space-y-1.5">
              <Label htmlFor="content">文案内容（选填）</Label>
              <textarea
                id="content"
                name="content"
                placeholder="粘贴今日发布的视频文案（选填）"
                className="min-h-[120px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={existingData?.content ?? ""}
              />
            </div>
            <div className="space-y-1.5 sm:w-1/2">
              <Label htmlFor="published_at">发布时间</Label>
              <Input
                id="published_at"
                name="published_at"
                type="datetime-local"
                className="h-10"
                defaultValue={normalizePublishedAtInputValue(existingData?.published_at) || getDefaultPublishedAtValue()}
              />
            </div>
          </CardContent>
        </Card>

        <div className="hidden sm:block">
          <Button type="submit" disabled={isPending} className="w-auto">
            {isPending ? "提交中..." : existingData ? "修改日报" : "提交日报"}
          </Button>
        </div>

        <div className="fixed right-0 bottom-0 left-0 z-20 border-t bg-background/90 p-4 backdrop-blur-md sm:hidden">
          <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
            {isPending ? "提交中..." : existingData ? "修改日报" : "提交日报"}
          </Button>
        </div>
      </form>
    </div>
  );
}
