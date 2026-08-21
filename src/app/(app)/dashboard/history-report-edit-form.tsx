"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { submitReport } from "./actions";
import { getDashboardMetricGridClass, getDashboardSurfaceClass } from "./dashboard-visuals";
import { getDefaultPublishedAtValue, normalizePublishedAtInputValue } from "@/lib/日报";

export interface HistoryReportEditData {
  id: string;
  account_id: string;
  title: string;
  report_date: string;
  play_count: number | null;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  content: string | null;
  published_at: string | null;
  uploaded_at: string | null;
}

type MetricKey =
  | "play_count"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "follower_gain"
  | "follower_convert"
  | "avg_play_duration"
  | "bounce_rate_2s"
  | "completion_rate_5s"
  | "completion_rate";

type MetricValues = Record<MetricKey, string>;

function stripSuffix(value: string | null | undefined, suffix: string) {
  return value?.replace(suffix, "").trim() ?? "";
}

function toInputValue(value: number | null | undefined, fallback = "") {
  return value == null ? fallback : String(value);
}

export function getInitialHistoryReportMetricValues(report: HistoryReportEditData): MetricValues {
  return {
    play_count: toInputValue(report.play_count),
    likes: toInputValue(report.likes, "0"),
    comments: toInputValue(report.comments, "0"),
    shares: toInputValue(report.shares, "0"),
    favorites: toInputValue(report.favorites, "0"),
    follower_gain: toInputValue(report.follower_gain, "0"),
    follower_convert: toInputValue(report.follower_convert),
    avg_play_duration: stripSuffix(report.avg_play_duration, "秒"),
    bounce_rate_2s: stripSuffix(report.bounce_rate_2s, "%"),
    completion_rate_5s: stripSuffix(report.completion_rate_5s, "%"),
    completion_rate: stripSuffix(report.completion_rate, "%"),
  };
}

const NUMBER_FIELDS: Array<{ key: MetricKey; label: string; required?: boolean; suffix?: string }> = [
  { key: "play_count", label: "播放量", required: true },
  { key: "follower_gain", label: "涨粉", required: true },
  { key: "follower_convert", label: "导粉" },
  { key: "likes", label: "点赞", required: true },
  { key: "comments", label: "评论", required: true },
  { key: "shares", label: "分享", required: true },
  { key: "favorites", label: "收藏", required: true },
  { key: "avg_play_duration", label: "均播时长", suffix: "秒" },
  { key: "bounce_rate_2s", label: "2 秒跳出率", suffix: "%" },
  { key: "completion_rate_5s", label: "5 秒完播率", suffix: "%" },
  { key: "completion_rate", label: "整体完播率", suffix: "%" },
];

export function HistoryReportEditForm({
  report,
  onSaved,
}: {
  report: HistoryReportEditData;
  onSaved?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [metrics, setMetrics] = useState<MetricValues>(() =>
    getInitialHistoryReportMetricValues(report),
  );
  const [title, setTitle] = useState(report.title ?? "");
  const [content, setContent] = useState(report.content ?? "");
  const [publishedAt, setPublishedAt] = useState(
    normalizePublishedAtInputValue(report.published_at) || getDefaultPublishedAtValue(),
  );

  function updateMetric(key: MetricKey, value: string) {
    setMetrics((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await submitReport(formData);
      if (result?.error) {
        feedbackToast.error(result.error);
        return;
      }

      onSaved?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="account_id" value={report.account_id} />
      <input type="hidden" name="report_date" value={report.report_date} />

      <Card className={`${getDashboardSurfaceClass("panel")} rounded-2xl border border-zinc-200 bg-white`}>
        <CardContent className="space-y-5 p-4 sm:p-5">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-zinc-800">
              <CheckCircle2 className="size-4 text-[#6FAA7D]" />
              历史日报基础信息
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="history-report-date">归属日期</Label>
                <Input id="history-report-date" value={report.report_date} disabled className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="history-published-at">发布时间</Label>
                <Input
                  id="history-published-at"
                  name="published_at"
                  type="datetime-local"
                  className="h-10"
                  value={publishedAt}
                  onChange={(event) => setPublishedAt(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="history-title">视频标题</Label>
              <Input
                id="history-title"
                name="title"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="history-content">视频文案</Label>
              <textarea
                id="history-content"
                name="content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="min-h-[150px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-[13px] leading-[1.7] text-zinc-700 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5"
                placeholder="补充或修正历史文案"
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-[13px] font-semibold text-zinc-800">历史指标</div>
            <div className={getDashboardMetricGridClass("secondary")}>
              {NUMBER_FIELDS.map((field) => (
                <div key={field.key} className="dashboard-metric-card space-y-1.5">
                  <Label htmlFor={`history-${field.key}`}>
                    {field.label}{field.suffix ? `（${field.suffix}）` : ""}
                  </Label>
                  <Input
                    id={`history-${field.key}`}
                    name={field.key}
                    type="number"
                    min={0}
                    step="any"
                    required={field.required}
                    value={metrics[field.key]}
                    onChange={(event) => updateMetric(field.key, event.target.value)}
                    className="h-10"
                  />
                </div>
              ))}
            </div>
          </section>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[12px] leading-[1.7] text-zinc-500">
            这里只修正历史日报本身，不会重新生成截图识别和视频素材记录。
          </div>
          <Button type="submit" disabled={isPending} className="h-11 px-6 text-[13px] sm:min-w-[148px]">
            {isPending ? "保存中..." : "保存历史日报"}
          </Button>
        </div>
      </div>
    </form>
  );
}
