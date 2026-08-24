"use client";

import { useState, useCallback } from "react";
import { Loader2, Upload, X, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScreenshotUpload } from "./screenshot-upload";
import type { VideoSubmitFormData, ScreenshotSlot, SubmitPanelMode } from "./types";

interface VideoSubmitFormProps {
  accountId: string;
  userId: string;
  today: string;
  bizDate: string;
  initialData?: Partial<VideoSubmitFormData>;
  mode: SubmitPanelMode;
  onSubmit: (data: VideoSubmitFormData) => Promise<void>;
  onModeChange: (mode: SubmitPanelMode) => void;
}

/**
 * 视频提交表单 - 核心组件
 * 支持 OCR、字段验证、状态流转
 */
export function VideoSubmitForm({
  accountId,
  userId,
  today,
  bizDate,
  initialData,
  mode,
  onSubmit,
  onModeChange,
}: VideoSubmitFormProps) {
  // 表单数据
  const [formData, setFormData] = useState<VideoSubmitFormData>({
    video_url: initialData?.video_url || "",
    published_at: initialData?.published_at || bizDate,
    operator_user_id: initialData?.operator_user_id || userId,
    play_count: initialData?.play_count || "",
    completion_rate: initialData?.completion_rate || "",
    avg_play_duration: initialData?.avg_play_duration || "",
    likes: initialData?.likes || "",
    comments: initialData?.comments || "",
    shares: initialData?.shares || "",
    favorites: initialData?.favorites || "",
    follower_gain: initialData?.follower_gain || "",
    follower_convert: initialData?.follower_convert || "",
    content_direction: initialData?.content_direction || "",
    content: initialData?.content || "",
    notes: initialData?.notes || "",
    screenshots: initialData?.screenshots || [
      { role: "cover" },
      { role: "middle" },
      { role: "ending" },
    ],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = useCallback(
    (field: keyof VideoSubmitFormData, value: any) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      // 清除该字段错误
      if (errors[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    },
    [errors]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证
    const newErrors: Record<string, string> = {};
    if (!formData.video_url.trim()) {
      newErrors.video_url = "请填写视频链接";
    }
    if (!formData.play_count.trim()) {
      newErrors.play_count = "请填写播放量";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onModeChange("submitting");
    try {
      await onSubmit(formData);
      onModeChange("submitted");
    } catch (error) {
      onModeChange("editing");
      console.error("提交失败", error);
    }
  };

  const isSubmitting = mode === "submitting";
  const isSubmitted = mode === "submitted";

  if (isSubmitted) {
    return (
      <div className="rounded-2xl border border-[#E5E0D6] bg-white p-6">
        <div className="flex items-center gap-2 text-[#6FAA7D]">
          <CheckCircle size={20} />
          <p className="text-sm font-medium">数据已提交</p>
        </div>
        <button
          type="button"
          onClick={() => onModeChange("editing")}
          className="mt-4 text-sm text-[#D97757] hover:underline"
        >
          编辑数据
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 基础信息区 */}
      <div className="space-y-4 rounded-2xl border border-[#E5E0D6] bg-white p-6">
        <h3 className="text-base font-medium text-[#1C1917]">基础信息</h3>

        {/* 视频链接 */}
        <div className="space-y-2">
          <label htmlFor="video-url" className="block text-sm font-medium text-[#292524]">
            视频链接 <span className="text-[#C0685C]">*</span>
          </label>
          <input
            id="video-url"
            type="url"
            value={formData.video_url}
            onChange={(e) => updateField("video_url", e.target.value)}
            className={cn(
              "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] placeholder:text-[#A8A29E] transition-all duration-150",
              errors.video_url
                ? "border-[#C0685C] focus-visible:ring-[#C0685C]/25"
                : "border-[#E5E0D6] focus-visible:border-[#78716C] focus-visible:ring-[#D97757]/25",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-0"
            )}
            placeholder="粘贴抖音视频链接"
            disabled={isSubmitting}
          />
          {errors.video_url && (
            <p className="text-[13px] text-[#C0685C]">{errors.video_url}</p>
          )}
        </div>

        {/* 发布时间 */}
        <div className="space-y-2">
          <label htmlFor="published-at" className="block text-sm font-medium text-[#292524]">
            发布时间
          </label>
          <input
            id="published-at"
            type="datetime-local"
            value={formData.published_at}
            onChange={(e) => updateField("published_at", e.target.value)}
            className="w-full rounded-lg border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-sm text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* 数据指标区 */}
      <div className="space-y-4 rounded-2xl border border-[#E5E0D6] bg-white p-6">
        <h3 className="text-base font-medium text-[#1C1917]">数据指标</h3>

        {/* 播放类指标 */}
        <div>
          <p className="mb-3 text-[13px] font-medium text-[#78716C]">播放类</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <label htmlFor="play-count" className="block text-sm font-medium text-[#292524]">
                播放量 <span className="text-[#C0685C]">*</span>
              </label>
              <input
                id="play-count"
                type="number"
                value={formData.play_count}
                onChange={(e) => updateField("play_count", e.target.value)}
                className={cn(
                  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-right text-sm tabular-nums text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150",
                  errors.play_count
                    ? "border-[#C0685C]"
                    : "border-[#E5E0D6] focus-visible:border-[#78716C]",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                )}
                placeholder="0"
                disabled={isSubmitting}
              />
              {errors.play_count && (
                <p className="text-[13px] text-[#C0685C]">{errors.play_count}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="completion-rate" className="block text-sm font-medium text-[#292524]">
                完播率
              </label>
              <input
                id="completion-rate"
                type="text"
                value={formData.completion_rate}
                onChange={(e) => updateField("completion_rate", e.target.value)}
                className="w-full rounded-lg border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-right text-sm tabular-nums text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                placeholder="0%"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="avg-duration" className="block text-sm font-medium text-[#292524]">
                平均播放时长
              </label>
              <input
                id="avg-duration"
                type="text"
                value={formData.avg_play_duration}
                onChange={(e) => updateField("avg_play_duration", e.target.value)}
                className="w-full rounded-lg border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-right text-sm tabular-nums text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                placeholder="0s"
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {/* 互动类指标 */}
        <div>
          <p className="mb-3 text-[13px] font-medium text-[#78716C]">互动类</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { key: "likes", label: "点赞数" },
              { key: "comments", label: "评论数" },
              { key: "shares", label: "转发数" },
              { key: "favorites", label: "收藏数" },
            ].map((metric) => (
              <div key={metric.key} className="space-y-2">
                <label htmlFor={metric.key} className="block text-sm font-medium text-[#292524]">
                  {metric.label}
                </label>
                <input
                  id={metric.key}
                  type="number"
                  value={formData[metric.key as keyof VideoSubmitFormData] as string}
                  onChange={(e) => updateField(metric.key as keyof VideoSubmitFormData, e.target.value)}
                  className="w-full rounded-lg border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-right text-sm tabular-nums text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                  placeholder="0"
                  disabled={isSubmitting}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 导粉类指标 */}
        <div>
          <p className="mb-3 text-[13px] font-medium text-[#78716C]">导粉类</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="follower-gain" className="block text-sm font-medium text-[#292524]">
                涨粉数
              </label>
              <input
                id="follower-gain"
                type="number"
                value={formData.follower_gain}
                onChange={(e) => updateField("follower_gain", e.target.value)}
                className="w-full rounded-lg border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-right text-sm tabular-nums text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                placeholder="0"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="follower-convert" className="block text-sm font-medium text-[#292524]">
                涨粉率
              </label>
              <input
                id="follower-convert"
                type="text"
                value={formData.follower_convert}
                onChange={(e) => updateField("follower_convert", e.target.value)}
                className="w-full rounded-lg border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-right text-sm tabular-nums text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                placeholder="0%"
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 截图上传区 */}
      <ScreenshotUpload
        slots={formData.screenshots}
        onSlotsChange={(slots) => updateField("screenshots", slots)}
        onOcrDataExtracted={(data) => {
          // 自动填充 OCR 识别的数据
          if (data.play_count) updateField("play_count", String(data.play_count));
          if (data.likes) updateField("likes", String(data.likes));
          if (data.comments) updateField("comments", String(data.comments));
          if (data.shares) updateField("shares", String(data.shares));
        }}
      />

      {/* 话术方向 + 备注 */}
      <div className="space-y-4 rounded-2xl border border-[#E5E0D6] bg-white p-6">
        <h3 className="text-base font-medium text-[#1C1917]">补充信息</h3>

        <div className="space-y-2">
          <label htmlFor="content-direction" className="block text-sm font-medium text-[#292524]">
            话术方向
          </label>
          <input
            id="content-direction"
            type="text"
            value={formData.content_direction}
            onChange={(e) => updateField("content_direction", e.target.value)}
            className="w-full rounded-lg border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-sm text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
            placeholder="话术分类"
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="notes" className="block text-sm font-medium text-[#292524]">
            备注 <span className="text-[#A8A29E]">(可选)</span>
          </label>
          <textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            rows={4}
            className="w-full resize-none rounded-xl border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-sm text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
            placeholder="记录视频相关补充信息"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* 提交按钮 */}
      <div className="flex justify-end pt-6">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 rounded-lg bg-[#D97757] px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {isSubmitting ? "提交中..." : "提交数据"}
        </button>
      </div>
    </form>
  );
}
