"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, RefreshCcw, Upload } from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { UPLOAD_LIMITS, formatSizeLimit } from "@/lib/upload-limits";

type ConfidenceLevel = "high" | "medium" | "low";

type OcrFieldKey =
  | "play_count"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "follower_gain";

export type ScreenshotImportEditableValues = Record<OcrFieldKey, string>;

type OcrApiResponse = {
  data?: {
    slot_status: "pending_confirm" | "confirmed" | "failed";
    screenshot_type: "data" | "curve" | "retention";
    confidence_score: number;
    requires_manual_confirmation: boolean;
    recognized_fields: Partial<Record<OcrFieldKey, number | null>> | null;
    confidence?: Record<OcrFieldKey, ConfidenceLevel>;
    error?: string;
  };
  error?: string;
};

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.webp";
const FIELD_META: Array<{
  key: OcrFieldKey;
  label: string;
  step: string;
  placeholder: string;
  suffix?: string;
}> = [
  { key: "play_count", label: "播放量", step: "0.01", placeholder: "32100" },
  { key: "likes", label: "点赞", step: "1", placeholder: "1280" },
  { key: "comments", label: "评论", step: "1", placeholder: "68" },
  { key: "shares", label: "分享", step: "1", placeholder: "15" },
  { key: "favorites", label: "收藏", step: "1", placeholder: "106" },
  { key: "follower_gain", label: "涨粉", step: "1", placeholder: "42" },
];

function toEditableValues(values: Partial<Record<OcrFieldKey, number | string | null>>): ScreenshotImportEditableValues {
  return {
    play_count: values.play_count == null ? "" : String(values.play_count),
    likes: values.likes == null ? "" : String(values.likes),
    comments: values.comments == null ? "" : String(values.comments),
    shares: values.shares == null ? "" : String(values.shares),
    favorites: values.favorites == null ? "" : String(values.favorites),
    follower_gain: values.follower_gain == null ? "" : String(values.follower_gain),
  };
}

function getEmptyConfidence(): Record<OcrFieldKey, ConfidenceLevel> {
  return {
    play_count: "low",
    likes: "low",
    comments: "low",
    shares: "low",
    favorites: "low",
    follower_gain: "low",
  };
}

function getBadgeVariant(level: ConfidenceLevel): "default" | "secondary" | "destructive" {
  if (level === "high") return "default";
  if (level === "medium") return "secondary";
  return "destructive";
}

function getBadgeClassName(level: ConfidenceLevel): string {
  if (level === "high") return "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700";
  if (level === "medium") return "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700";
  return "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700";
}

interface ScreenshotImportProps {
  initialValues: ScreenshotImportEditableValues;
  onConfirm: (values: ScreenshotImportEditableValues) => void;
}

export function ScreenshotImport({ initialValues, onConfirm }: ScreenshotImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [editableValues, setEditableValues] = useState<ScreenshotImportEditableValues>(initialValues);
  const [confidence, setConfidence] = useState<Record<OcrFieldKey, ConfidenceLevel>>(getEmptyConfidence());
  const hasResult = useMemo(
    () => Object.values(editableValues).some((value) => value.trim() !== ""),
    [editableValues]
  );

  useEffect(() => {
    setEditableValues(initialValues);
    setConfidence(getEmptyConfidence());
    setFileName("");
    setIsDragging(false);
    setIsLoading(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [initialValues]);

  function handleDragState(next: boolean) {
    setIsDragging(next);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    handleDragState(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      handleDragState(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    handleDragState(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void processFile(file);
    }
  }

  function validateFile(file: File): string | null {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "仅支持 jpg、png、webp 图片";
    }
    if (file.size <= 0) {
      return "图片为空或已损坏，请重新上传";
    }
    if (file.size > UPLOAD_LIMITS.ocr) {
      return `图片不能超过 ${formatSizeLimit(UPLOAD_LIMITS.ocr)}`;
    }
    return null;
  }

  async function processFile(file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      feedbackToast.error(validationError);
      return;
    }

    setIsLoading(true);
    setFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/ocr-screenshot", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as OcrApiResponse;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "识别失败，请换清晰截图重试");
      }

      const nextValues = toEditableValues(payload.data.recognized_fields ?? {});
      // 合并模式：只覆盖新识别到的非空字段，保留已有值
      setEditableValues((current) => {
        const merged = { ...current };
        for (const key of Object.keys(nextValues) as OcrFieldKey[]) {
          if (nextValues[key] !== "") {
            merged[key] = nextValues[key];
          }
        }
        return merged;
      });
      // 置信度也合并：新识别的覆盖，未识别的保留
      setConfidence((current) => {
        const newConf = payload.data!.confidence ?? getEmptyConfidence();
        const merged = { ...current };
        for (const key of Object.keys(newConf) as OcrFieldKey[]) {
          if (nextValues[key] !== "") {
            merged[key] = newConf[key];
          }
        }
        return merged;
      });
      feedbackToast.success("截图识别完成，可继续上传其他截图或手动校对");
    } catch (error) {
      feedbackToast.error((error as Error).message || "识别失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }

  function handleValueChange(field: OcrFieldKey, value: string) {
    setEditableValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  function resetAndPickAgain() {
    // 保留已识别的值，只重置文件状态以便继续上传
    setFileName("");
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/35 p-4 text-sm text-muted-foreground">
        <p>建议上传包含播放量、点赞、评论、分享、收藏、涨粉的抖音后台截图。</p>
        <p>系统会先识别，再由你确认与修正后写回日报表单。</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={openFilePicker}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFilePicker();
          }
        }}
        className={cn(
          "flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          isDragging
            ? "border-[#D97757] bg-[#D97757]/10"
            : "border-zinc-200 bg-zinc-50 hover:border-[#D97757]/60 hover:bg-zinc-100"
        )}
      >
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/8 text-primary">
          <Upload className="size-6" />
        </div>
        <div className="space-y-2">
          <p className="text-[14px] font-medium text-foreground">拖拽截图到这里，或点击选择图片</p>
          <p className="text-sm text-muted-foreground">支持 jpg、png、webp，单张最大 {formatSizeLimit(UPLOAD_LIMITS.ocr)}</p>
          {fileName ? <p className="text-sm text-foreground">当前文件：{fileName}</p> : null}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {FIELD_META.map((field) => (
            <Card key={field.key} className="card-elevated animate-pulse bg-background/75">
              <CardContent className="space-y-4 pt-5 pb-5">
                <div className="h-4 w-20 rounded bg-muted" />
                <div className="h-8 w-full rounded bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!isLoading && hasResult ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {FIELD_META.map((field) => (
              <Card key={field.key} className="card-elevated bg-background/80">
                <CardContent className="space-y-3 pt-5 pb-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">{field.label}</div>
                    <Badge
                      variant={getBadgeVariant(confidence[field.key])}
                      className={getBadgeClassName(confidence[field.key])}
                    >
                      {confidence[field.key]}
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`ocr-${field.key}`}>识别结果</Label>
                    <div className="relative">
                      <Input
                        id={`ocr-${field.key}`}
                        type="number"
                        min={0}
                        step={field.step}
                        placeholder={field.placeholder}
                        value={editableValues[field.key]}
                        onChange={(event) => handleValueChange(field.key, event.target.value)}
                        className={field.suffix ? "pr-10 h-10" : "h-10"}
                      />
                      {field.suffix ? (
                        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                          {field.suffix}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={resetAndPickAgain}>
              <RefreshCcw className="size-4" />
              继续识别下一张
            </Button>
            <Button type="button" onClick={() => onConfirm(editableValues)}>
              <ImagePlus className="size-4" />
              确认填入表单
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
