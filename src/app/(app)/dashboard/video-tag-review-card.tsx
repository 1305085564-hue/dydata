"use client";

import { useMemo, useState } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TAG_ENUMS, VIDEO_TAG_REVIEW_DIMENSIONS, type VideoTagReviewDimension } from "@/types";
import {
  buildTagFilterState,
  getTagReviewStatus,
  type NormalizedAiTagSuggestion,
} from "@/lib/video-tags";
import { cn } from "@/lib/utils";

type Props = {
  videoId: string;
  tags: NormalizedAiTagSuggestion[];
  onConfirmed: (tags: NormalizedAiTagSuggestion[]) => void;
  onConfirmFailed?: (tags: NormalizedAiTagSuggestion[]) => void;
  onSkipped: () => void;
};

export function VideoTagReviewCard({ videoId, tags, onConfirmed, onConfirmFailed, onSkipped }: Props) {
  const [selection, setSelection] = useState(() => buildTagFilterState(tags));
  const [isSaving, setIsSaving] = useState(false);

  const tagsByDimension = useMemo(() => {
    return new Map(tags.map((tag) => [tag.tag_dimension, tag]));
  }, [tags]);

  function updateSelection(dimension: VideoTagReviewDimension, value: string | null) {
    setSelection((current) => ({ ...current, [dimension]: value ?? "" }));
  }

  async function handleConfirm() {
    const previousSelection = selection;
    const payload = VIDEO_TAG_REVIEW_DIMENSIONS.map((dimension) => {
      const matched = tagsByDimension.get(dimension);
      return {
        tag_dimension: dimension,
        tag_value: selection[dimension] || matched?.tag_value || TAG_ENUMS[dimension][0],
        confidence: matched?.confidence ?? null,
        reason: matched?.reason ?? null,
      };
    });

    setIsSaving(true);
    feedbackToast.success("标签已确认");
    onConfirmed(
      payload.map((item) => ({
        tag_dimension: item.tag_dimension,
        tag_value: item.tag_value,
        confidence: item.confidence,
        reason: item.reason,
      }))
    );

    try {
      const response = await fetch("/api/video-tags/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          video_id: videoId,
          action: "confirm",
          tags: payload,
        }),
      });

      const result = (await response.json()) as { error?: string; tags?: NormalizedAiTagSuggestion[] };
      if (!response.ok) {
        throw new Error(result.error || "标签确认失败");
      }
    } catch (error) {
      setSelection(previousSelection);
      onConfirmFailed?.(tags);
      feedbackToast.error((error as Error).message || "标签确认失败");
    } finally {
      setIsSaving(false);
    }
  }

  if (!tags.length) {
    return null;
  }

  return (
    <Card className="rounded-2xl border border-stone-200 bg-white">
      <CardContent className="space-y-5 px-6 py-6 sm:px-7">
        <div className="space-y-1">
          <h3 className="text-[18px] font-medium tracking-tight text-stone-900">AI 推荐标签</h3>
          <p className="text-[13px] leading-[1.7] text-stone-500">提交成功后可立即确认或微调，低置信度标签会标记为待确认。</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {VIDEO_TAG_REVIEW_DIMENSIONS.map((dimension) => {
            const tag = tagsByDimension.get(dimension) ?? null;
            const reviewStatus = getTagReviewStatus(tag?.confidence ?? null);

            return (
              <div key={dimension} className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-medium text-stone-700">{dimension}</div>
                  <Badge
                    variant="outline"
                    className={
                      reviewStatus === "可信"
                        ? "border-stone-200 bg-white text-[#3F7A4E]"
                        : "border-stone-200 bg-white text-[#8F641B]"
                    }
                  >
                    <span
                      className={cn(
                        "mr-1.5 inline-block size-1.5 rounded-full",
                        reviewStatus === "可信" ? "bg-[#6FAA7D]" : "bg-[#D99E55]",
                      )}
                    />
                    {reviewStatus}
                  </Badge>
                </div>

                <Select
                  value={selection[dimension] || tag?.tag_value || ""}
                  onValueChange={(value) => updateSelection(dimension, value)}
                >
                  <SelectTrigger className="h-11 rounded-lg bg-white">
                    <SelectValue placeholder={`选择${dimension}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {TAG_ENUMS[dimension].map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="space-y-1 text-[12px] leading-[1.7] text-stone-500">
                  <div>来源：AI</div>
                  <div>
                    置信度：
                    <span className="tabular-nums text-stone-700">
                      {tag?.confidence != null ? `${Math.round(tag.confidence * 100)}%` : "-"}
                    </span>
                  </div>
                  <div className="line-clamp-3">理由：{tag?.reason || "-"}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="h-11 px-6" onClick={onSkipped} disabled={isSaving}>
            跳过
          </Button>
          <Button type="button" className="h-11 px-6" onClick={handleConfirm} disabled={isSaving}>
            {isSaving ? "确认中..." : "一键确认标签"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
