"use client";

import { useState } from "react";
import { Sliders, RotateCcw, Check, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { feedbackToast } from "@/components/ui/feedback-toast";
import {
  DEFAULT_VIDEO_REVIEW_THRESHOLDS,
  type VideoReviewThresholds,
} from "@/lib/video-review-thresholds";

interface ThresholdsConfigPanelProps {
  initialThresholds: VideoReviewThresholds;
  canManage: boolean;
}

export function ThresholdsConfigPanel({
  initialThresholds,
  canManage,
}: ThresholdsConfigPanelProps) {
  const [thresholds, setThresholds] = useState<VideoReviewThresholds>(initialThresholds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (key: keyof VideoReviewThresholds, valueStr: string) => {
    const val = parseFloat(valueStr);
    setThresholds((prev) => {
      const next = { ...prev, [key]: Number.isNaN(val) ? 0 : val };
      setHasChanges(JSON.stringify(next) !== JSON.stringify(initialThresholds));
      return next;
    });
  };

  const handleResetToDefault = () => {
    setThresholds({ ...DEFAULT_VIDEO_REVIEW_THRESHOLDS });
    setHasChanges(JSON.stringify(DEFAULT_VIDEO_REVIEW_THRESHOLDS) !== JSON.stringify(initialThresholds));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/settings/thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(thresholds),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失败");

      feedbackToast.success("视频复盘与素材库异常警戒阈值已更新");
      setHasChanges(false);
    } catch (err) {
      feedbackToast.error(err instanceof Error ? err.message : "更新阈值失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-[#D97757]">
            <Sliders className="size-5" />
          </span>
          <div>
            <h3 className="text-[16px] font-semibold text-stone-900 tracking-tight">
              视频复盘与素材库异常警戒阈值
            </h3>
            <p className="text-[12px] text-stone-500 mt-0.5">
              自定义全站数据指标警戒线。触及警戒线时将以高雅浅红框亮起提醒。
            </p>
          </div>
        </div>

        {canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetToDefault}
            className="h-8 gap-1.5 rounded-xl border-stone-200 text-[12px] text-stone-600 hover:bg-stone-50"
          >
            <RotateCcw className="size-3.5" />
            恢复系统默认
          </Button>
        )}
      </div>

      {!canManage && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 text-[12px] text-amber-800">
          <Info className="size-4 shrink-0 text-amber-600" />
          <span>您当前为只读视角，仅 Team Admin 或 Owner 可修改警戒阈值。</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {/* 2s跳出率 */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium text-stone-700 flex items-center justify-between">
              <span>2s 跳出率</span>
              <span className="text-stone-400 font-normal text-[11px]">高于此值触发</span>
            </label>
            <div className="relative flex items-center">
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                disabled={!canManage || isSubmitting}
                value={thresholds.bounce_rate_2s}
                onChange={(e) => handleChange("bounce_rate_2s", e.target.value)}
                className="h-9 pr-8 text-[13px] font-semibold tabular-nums text-stone-900 bg-stone-50/50 border-stone-200 focus:bg-white focus:border-[#D97757]/60 transition-colors"
              />
              <span className="absolute right-3 text-[12px] font-medium text-stone-400">%</span>
            </div>
          </div>

          {/* 5s完播率 */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium text-stone-700 flex items-center justify-between">
              <span>5s 完播率</span>
              <span className="text-stone-400 font-normal text-[11px]">低于此值触发</span>
            </label>
            <div className="relative flex items-center">
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                disabled={!canManage || isSubmitting}
                value={thresholds.completion_rate_5s}
                onChange={(e) => handleChange("completion_rate_5s", e.target.value)}
                className="h-9 pr-8 text-[13px] font-semibold tabular-nums text-stone-900 bg-stone-50/50 border-stone-200 focus:bg-white focus:border-[#D97757]/60 transition-colors"
              />
              <span className="absolute right-3 text-[12px] font-medium text-stone-400">%</span>
            </div>
          </div>

          {/* 均播时长 */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium text-stone-700 flex items-center justify-between">
              <span>均播时长</span>
              <span className="text-stone-400 font-normal text-[11px]">低于此值触发</span>
            </label>
            <div className="relative flex items-center">
              <Input
                type="number"
                min={0}
                step={0.5}
                disabled={!canManage || isSubmitting}
                value={thresholds.avg_play_duration}
                onChange={(e) => handleChange("avg_play_duration", e.target.value)}
                className="h-9 pr-8 text-[13px] font-semibold tabular-nums text-stone-900 bg-stone-50/50 border-stone-200 focus:bg-white focus:border-[#D97757]/60 transition-colors"
              />
              <span className="absolute right-3 text-[12px] font-medium text-stone-400">秒</span>
            </div>
          </div>

          {/* 完播率 */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium text-stone-700 flex items-center justify-between">
              <span>整体完播率</span>
              <span className="text-stone-400 font-normal text-[11px]">低于此值触发</span>
            </label>
            <div className="relative flex items-center">
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                disabled={!canManage || isSubmitting}
                value={thresholds.completion_rate}
                onChange={(e) => handleChange("completion_rate", e.target.value)}
                className="h-9 pr-8 text-[13px] font-semibold tabular-nums text-stone-900 bg-stone-50/50 border-stone-200 focus:bg-white focus:border-[#D97757]/60 transition-colors"
              />
              <span className="absolute right-3 text-[12px] font-medium text-stone-400">%</span>
            </div>
          </div>

          {/* 播放量 */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium text-stone-700 flex items-center justify-between">
              <span>播放量门槛</span>
              <span className="text-stone-400 font-normal text-[11px]">低于此值触发</span>
            </label>
            <div className="relative flex items-center">
              <Input
                type="number"
                min={0}
                step={100}
                disabled={!canManage || isSubmitting}
                value={thresholds.play_count}
                onChange={(e) => handleChange("play_count", e.target.value)}
                className="h-9 pr-8 text-[13px] font-semibold tabular-nums text-stone-900 bg-stone-50/50 border-stone-200 focus:bg-white focus:border-[#D97757]/60 transition-colors"
              />
              <span className="absolute right-3 text-[12px] font-medium text-stone-400">次</span>
            </div>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting || !hasChanges}
              className="h-9 gap-1.5 rounded-xl bg-[#D97757] px-5 text-[12px] font-medium text-white transition-all hover:bg-[#C96442] active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  保存中…
                </>
              ) : (
                <>
                  <Check className="size-3.5" />
                  保存阈值配置
                </>
              )}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
