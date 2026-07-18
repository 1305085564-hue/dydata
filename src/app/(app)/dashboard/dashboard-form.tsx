"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ScanSearch, Sparkles } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
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
import { getDashboardMetricGridClass, getDashboardSurfaceClass } from "./dashboard-visuals";
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
  actionBarMode?: "floating" | "inline";
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
    play_count: existingData?.play_count != null ? String(existingData.play_count) : "",
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

export function DashboardForm({
  accounts,
  defaultAccountId,
  today,
  existingData,
  actionBarMode = "floating",
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("已提交");
  const [ocrValues, setOcrValues] = useState<OcrFormState>(() => getInitialOcrState(existingData));
  const [isImportOpen, setIsImportOpen] = useState(false);
  const formKey = existingData?.id ?? `new-${defaultAccountId ?? accounts[0]?.id ?? "default"}`;
  const selectedAccountId = defaultAccountId ?? accounts[0]?.id ?? "";
  const isFloatingActionBar = actionBarMode === "floating";
  const submitButtonLabel = isPending
    ? "提交中..."
    : showSuccess
      ? successMsg
      : existingData
        ? "修改日报"
        : "提交日报";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await submitReport(formData);
      if (result?.error) {
        feedbackToast.error(result.error);
      } else {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        setSuccessMsg(`${result?.isUpdate ? "已修改" : "已提交"} ${hh}:${mm}`);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
      }
    });
  }

  function handleImportConfirm(values: ScreenshotImportEditableValues) {
    setOcrValues(normalizeImportedValues(values));
    setIsImportOpen(false);
    feedbackToast.success("截图数据已回填，可以继续检查后提交");
  }

  function updateOcrValue(field: OcrFieldKey, value: string) {
    setOcrValues((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="relative">
      <form
        key={formKey}
        onSubmit={handleSubmit}
        className={`space-y-4 sm:space-y-5 ${isFloatingActionBar ? "pb-32 sm:pb-40 xl:pb-44" : "pb-4 sm:pb-0"}`}
      >
        <input type="hidden" name="account_id" value={selectedAccountId} />

        <div className="dashboard-form-layout">
          <div className="dashboard-form-column">
            <Card
              className={`${getDashboardSurfaceClass("hero")} dashboard-form-import-card overflow-hidden rounded-2xl border border-stone-200 bg-white`}
            >
              <CardContent className="space-y-4 px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="dashboard-section-kicker inline-flex items-center gap-2">
                      <Sparkles className="size-3.5" />
                      截图上传
                    </div>
                    <h3 className="dashboard-section-title">截图识别导入后，关键数据会自动回填到表单</h3>
                    <p className="text-[13px] leading-6 text-stone-500">
                      先完成截图导入，再检查标题、发布时间和补充字段，桌面端两块区域会保持统一起点和间距。
                    </p>
                  </div>

                  <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                    <DialogTrigger
                      render={<Button type="button" className="h-12 w-full px-5 text-[13px] font-medium sm:w-auto" />}
                    >
                      <ScanSearch className="size-4 stroke-[1.5]" />
                      截图识别导入
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                      <DialogHeader>
                        <DialogTitle className="text-[18px] font-medium tracking-tight text-stone-700">截图识别导入</DialogTitle>
                        <DialogDescription className="text-[13px] leading-[1.7] text-stone-500">
                          支持 jpg、png、webp。识别结果可以逐项修改，确认后才会写回主表单。
                        </DialogDescription>
                      </DialogHeader>
                      <ScreenshotImport initialValues={ocrValues} onConfirm={handleImportConfirm} />
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="dashboard-summary-bar">
                  <div className="glass-chip">
                    账号
                    <span className="font-medium text-stone-700">
                      {accounts.find((account) => account.id === selectedAccountId)?.name ?? "--"}
                    </span>
                  </div>
                  <div className="glass-chip">
                    日期
                    <span className="font-medium tabular-nums text-stone-700">{existingData?.report_date ?? today}</span>
                  </div>
                  <div className="glass-chip">
                    状态
                    <span
                      className={
                        existingData
                          ? "inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-stone-700"
                          : "inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-stone-700"
                      }
                    >
                      <span
                        className={
                          existingData
                            ? "inline-block h-2 w-2 rounded-full bg-[#6FAA7D] ring-1 ring-white"
                            : "inline-block h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white"
                        }
                      />
                      {existingData ? "今日可修改" : "今日待提交"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="dashboard-form-column">
            <Card
              className={`${getDashboardSurfaceClass("panel")} dashboard-form-entry-card rounded-2xl border border-stone-200 bg-white`}
            >
              <CardContent className="space-y-6 px-5 py-5 sm:px-6">
                <div className="space-y-1.5">
                  <div className="dashboard-section-kicker">指标录入</div>
                  <h3 className="dashboard-section-title">把基础信息、核心指标和补充信息收进同一个录入模板</h3>
                  <p className="text-[13px] leading-6 text-stone-500">
                    右侧统一使用同层级卡片结构，桌面端与左侧截图区共用一套两列布局，顶部和间距都会更整齐。
                  </p>
                </div>

                <section className="dashboard-form-section">
                  <div className="space-y-1">
                    <div className="dashboard-section-kicker">基础信息</div>
                    <h3 className="dashboard-section-title">标题和日期先确认</h3>
                  </div>
                  <div className="dashboard-field-group space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="title">视频标题</Label>
                      <Input
                        id="title"
                        name="title"
                        placeholder="请输入视频标题"
                        required
                        className="h-10"
                        defaultValue={existingData?.title ?? ""}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="account_id">账号</Label>
                        <Select
                          value={selectedAccountId}
                          disabled
                          items={accounts.map((account) => ({ value: account.id, label: account.name }))}
                        >
                          <SelectTrigger id="account_id" className="h-10 w-full bg-stone-50">
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
                      <div className="space-y-1.5">
                        <Label htmlFor="report_date">提交日期</Label>
                        <Input
                          id="report_date"
                          name="report_date"
                          type="date"
                          defaultValue={existingData?.report_date ?? today}
                          required
                          className="h-10 bg-stone-50 text-[13px]"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <div className="dashboard-form-section-divider" />

                <section className="dashboard-form-section">
                  <div className="space-y-1">
                    <div className="dashboard-section-kicker">核心数据</div>
                    <h3 className="dashboard-section-title">第一优先：播放量和涨粉</h3>
                    <p className="text-[12px] text-stone-500">
                      先填这两项，再补全完播率、均播时长和留存指标。
                    </p>
                  </div>
                  <div
                    className={`${getDashboardMetricGridClass("primary")} rounded-xl border border-stone-200 bg-stone-50 p-4 sm:p-5`}
                  >
                    <div className="dashboard-metric-card dashboard-metric-card-primary space-y-1.5">
                      <Label htmlFor="play_count">播放量</Label>
                      <Input
                        id="play_count"
                        name="play_count"
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="32100"
                        required
                        className="h-12 rounded-xl border-stone-200 bg-stone-50 text-[18px] font-medium text-stone-900"
                        value={ocrValues.play_count}
                        onChange={(e) => updateOcrValue("play_count", e.target.value)}
                      />
                    </div>
                    <div className="dashboard-metric-card dashboard-metric-card-primary space-y-1.5">
                      <Label htmlFor="follower_gain">涨粉</Label>
                      <Input
                        id="follower_gain"
                        name="follower_gain"
                        type="number"
                        min={0}
                        required
                        className="h-12 rounded-xl border-stone-200 bg-stone-50 text-[18px] font-medium text-stone-900"
                        value={ocrValues.follower_gain}
                        onChange={(e) => updateOcrValue("follower_gain", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className={getDashboardMetricGridClass("primary")}>
                    <div className="dashboard-metric-card space-y-1.5">
                      <Label htmlFor="completion_rate">完播率</Label>
                      <div className="relative">
                        <Input
                          id="completion_rate"
                          name="completion_rate"
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          placeholder="14.81"
                          className="h-10 pr-8"
                          defaultValue={stripSuffix(existingData?.completion_rate ?? null, "%")}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-stone-500">
                          %
                        </span>
                      </div>
                    </div>
                    <div className="dashboard-metric-card space-y-1.5">
                      <Label htmlFor="avg_play_duration">平均播放时长</Label>
                      <div className="relative">
                        <Input
                          id="avg_play_duration"
                          name="avg_play_duration"
                          type="number"
                          step="0.1"
                          min={0}
                          placeholder="56"
                          className="h-10 pr-8"
                          defaultValue={stripSuffix(existingData?.avg_play_duration ?? null, "秒")}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-stone-500">
                          秒
                        </span>
                      </div>
                    </div>
                    <div className="dashboard-metric-card space-y-1.5">
                      <Label htmlFor="bounce_rate_2s">2s 跳出率</Label>
                      <div className="relative">
                        <Input
                          id="bounce_rate_2s"
                          name="bounce_rate_2s"
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          placeholder="30"
                          className="h-10 pr-8"
                          defaultValue={stripSuffix(existingData?.bounce_rate_2s ?? null, "%")}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-stone-500">
                          %
                        </span>
                      </div>
                    </div>
                    <div className="dashboard-metric-card space-y-1.5">
                      <Label htmlFor="completion_rate_5s">5s 完播率</Label>
                      <div className="relative">
                        <Input
                          id="completion_rate_5s"
                          name="completion_rate_5s"
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          placeholder="20"
                          className="h-10 pr-8"
                          defaultValue={stripSuffix(existingData?.completion_rate_5s ?? null, "%")}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-stone-500">
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="dashboard-form-section-divider" />

                <section className="dashboard-form-section">
                  <div className="space-y-1">
                    <div className="dashboard-section-kicker">补充信息</div>
                    <h3 className="dashboard-section-title">第二优先：互动、发布时间、文案</h3>
                    <p className="text-[12px] text-stone-500">
                      这些信息用于后续复盘和分析，建议一次补齐。
                    </p>
                  </div>
                  <div className={getDashboardMetricGridClass("secondary")}>
                    <div className="dashboard-metric-card space-y-1.5">
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
                    <div className="dashboard-metric-card space-y-1.5">
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
                    <div className="dashboard-metric-card space-y-1.5">
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
                    <div className="dashboard-metric-card space-y-1.5">
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
                  <div className="dashboard-field-group grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="dashboard-field-group space-y-1.5">
                      <Label htmlFor="follower_convert">导粉（选填）</Label>
                      <Input
                        id="follower_convert"
                        name="follower_convert"
                        type="number"
                        min={0}
                        defaultValue={existingData?.follower_convert ?? ""}
                        className="h-10"
                      />
                    </div>
                    <div className="dashboard-field-group space-y-1.5">
                      <Label htmlFor="published_at">发布时间</Label>
                      <Input
                        id="published_at"
                        name="published_at"
                        type="datetime-local"
                        className="h-10"
                        defaultValue={
                          normalizePublishedAtInputValue(existingData?.published_at) ||
                          getDefaultPublishedAtValue()
                        }
                      />
                    </div>
                  </div>
                  <div className="dashboard-field-group space-y-1.5">
                    <Label htmlFor="content">文案内容（选填）</Label>
                    <textarea
                      id="content"
                      name="content"
                      placeholder="粘贴今天发布的视频文案（选填）"
                      className="min-h-[120px] w-full resize-y rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-[13px] text-stone-700 placeholder:text-stone-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-900/5"
                      defaultValue={existingData?.content ?? ""}
                    />
                    <p className="text-[12px] leading-5 text-stone-500">
                      只填今天这条视频的实际发布文案，方便后面回看和复盘。
                    </p>
                  </div>
                </section>
              </CardContent>
            </Card>
          </div>
        </div>

        {isFloatingActionBar ? (
          <>
            <div className="dashboard-form-floating-bar hidden sm:flex">
              <div className="dashboard-form-floating-panel">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-[13px] text-stone-500">
                      <CheckCircle2 className="size-4 stroke-[1.5] text-stone-700" />
                      <span>补充完成后再提交</span>
                    </div>
                    <p className="text-[12px] leading-[1.7] text-stone-500">
                      这个操作面板会跟随当前视口底部，同时给表单底部预留留白，不会压住最后几项输入。
                    </p>
                  </div>
                  <Button
                    type="submit"
                    disabled={isPending}
                    data-success={showSuccess || undefined}
                    className="h-11 w-full px-6 text-[13px] tabular-nums transition-[background-color,color] duration-150 data-[success]:bg-white data-[success]:text-[#3F7A4E] data-[success]:border data-[success]:border-stone-200 sm:min-w-[168px] sm:w-auto"
                  >
                    {submitButtonLabel}
                  </Button>
                </div>
              </div>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-20 dashboard-mobile-submit-bar p-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] sm:hidden">
              <div className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-2">
                <Button
                  type="submit"
                  disabled={isPending}
                  data-success={showSuccess || undefined}
                  className="h-12 w-full text-[13px] font-medium tabular-nums transition-[background-color,color] duration-150 data-[success]:bg-white data-[success]:text-[#3F7A4E] data-[success]:border data-[success]:border-stone-200"
                >
                  {submitButtonLabel}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="dashboard-form-inline-action">
            <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex items-center gap-2 text-[13px] text-stone-500">
                  <CheckCircle2 className="size-4 stroke-[1.5] text-stone-700" />
                  <span>检查完整数据后再提交，提交后可在历史记录继续修改</span>
                </div>
                <Button
                  type="submit"
                  disabled={isPending}
                  data-success={showSuccess || undefined}
                  className="h-11 w-full px-6 text-[13px] tabular-nums transition-[background-color,color] duration-150 data-[success]:bg-white data-[success]:text-[#3F7A4E] data-[success]:border data-[success]:border-stone-200 sm:min-w-[168px] sm:w-auto"
                >
                  {submitButtonLabel}
                </Button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
