"use client";

import { useState } from "react";
import { Upload, Trash2, Plus, Loader2, CheckCircle2, AlertTriangle, Archive } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MAX_SCREENSHOTS = 5;

interface SubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  target: number;
  submittedCount: number;
  todayDate: string;
  onSubmitSuccess: () => void;
}

export function SubmitDialog({
  open,
  onOpenChange,
  userId: _userId,
  target,
  submittedCount,
  todayDate: _todayDate,
  onSubmitSuccess,
}: SubmitDialogProps) {
  const [contentText, setContentText] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [screenshotFiles, setScreenshotFiles] = useState<
    Array<{ previewUrl: string; storagePath: string }>
  >([]);

  const gap = Math.max(0, target - submittedCount);
  const isTargetMet = submittedCount >= target;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (screenshotFiles.length + files.length > MAX_SCREENSHOTS) {
      toast.error("截图上限 5 张");
      return;
    }

    setUploading(true);
    const newUploads = [...screenshotFiles];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const previewUrl = URL.createObjectURL(file);
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/work-screenshots/upload", {
          method: "POST",
          body: formData,
        });
        const result = await res.json();
        if (res.ok && result.data?.path) {
          newUploads.push({ previewUrl, storagePath: result.data.path });
        } else {
          toast.error(`${file.name} 上传失败`, { description: result.error || "接口错误" });
        }
      } catch {
        toast.error("文件上传失败", { description: "网络连接失败，请重试" });
      }
    }

    setScreenshotFiles(newUploads);
    setUploading(false);
    e.target.value = "";
  };

  const removeScreenshot = (index: number) => {
    const item = screenshotFiles[index];
    URL.revokeObjectURL(item.previewUrl);
    setScreenshotFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contentText.trim() && screenshotFiles.length === 0) {
      toast.error("请至少填写文案内容或上传一张截图");
      return;
    }

    setSubmitting(true);
    const payload = {
      content_text: contentText.trim(),
      screenshot_urls: screenshotFiles.map((item) => item.storagePath),
      note: note.trim() || null,
    };

    try {
      const res = await fetch("/api/work-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (res.ok) {
        toast.success("提交成功", { description: "今日产量凭证已登记" });
        setContentText("");
        setNote("");
        screenshotFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setScreenshotFiles([]);
        onSubmitSuccess();
        onOpenChange(false);
      } else {
        toast.error("提交失败", { description: result.error || "服务接口出错" });
      }
    } catch {
      toast.error("提交失败", { description: "网络连接失败，请重试" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting || uploading) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="bg-white p-0 rounded-2xl overflow-hidden"
        style={{ maxWidth: "680px" }}
      >
        <DialogHeader className="px-7 pt-6 pb-4 border-b border-stone-100">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-[18px] font-medium text-stone-900">
                上传今日作品凭证
              </DialogTitle>
              <p className="mt-1 text-[13px] text-stone-500 leading-[1.6]">
                提交话术文案 + 发布截图，登记您的每日产量。
              </p>
            </div>
          </div>
          {/* 今日进度条 */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isTargetMet ? "bg-[#6FAA7D]" : "bg-[#D97757]"
                )}
                style={{ width: `${Math.min(100, (submittedCount / Math.max(1, target)) * 100)}%` }}
              />
            </div>
            {isTargetMet ? (
              <span className="flex items-center gap-1 text-[12px] font-medium text-[#3F7A4E] shrink-0">
                <CheckCircle2 className="size-3.5 stroke-[2.5]" />
                已达标 ({submittedCount}/{target})
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[12px] font-medium text-[#B4532F] shrink-0">
                <AlertTriangle className="size-3.5" />
                还差 {gap} 条 ({submittedCount}/{target})
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="px-7 py-3 bg-amber-50 border-y border-amber-100">
          <div className="flex items-start gap-2">
            <Archive className="size-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] font-medium text-amber-800">本功能已归档</p>
              <p className="text-[12px] text-amber-700/80 leading-[1.6]">
                作品凭证上传已暂停，原有提交记录仍可在管理后台查看，数据不会丢失。
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="px-7 py-5 space-y-5">
          {/* 文案输入 */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-stone-700">
              视频话术文案
            </label>
            <textarea
              value={contentText}
              disabled
              rows={5}
              placeholder="本功能已归档，暂不支持上传新的作品凭证"
              className="w-full resize-none rounded-lg border border-stone-200 bg-stone-100 px-4 py-3 text-[13px] leading-[1.7] text-stone-500 placeholder:text-stone-400 cursor-not-allowed transition-all"
            />
          </div>

          {/* 截图上传 */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-stone-700">
              发布截图{" "}
              <span className="font-normal text-stone-500">
                (最多 {MAX_SCREENSHOTS} 张)
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              {screenshotFiles.map((item, idx) => (
                <div
                  key={idx}
                  className="relative size-20 rounded-lg border border-stone-200 bg-stone-50 overflow-hidden group"
                >
                  <img
                    src={item.previewUrl}
                    alt={`截图 ${idx + 1}`}
                    className="size-full object-cover"
                  />

                </div>
              ))}

              <div
                className="flex size-20 cursor-not-allowed flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-200 bg-stone-50 text-stone-400"
                title="本功能已归档，暂不支持上传截图"
              >
                <Plus className="size-5" />
                <span className="text-[12px] font-medium">添加</span>
              </div>
            </div>
          </div>

          {/* 备注 */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-stone-700">
              备注{" "}
              <span className="font-normal text-stone-500">(可选)</span>
            </label>
            <input
              type="text"
              value={note}
              disabled
              placeholder="本功能已归档"
              className="w-full rounded-lg border border-stone-200 bg-stone-100 px-4 py-2.5 text-[13px] text-stone-500 placeholder:text-stone-400 cursor-not-allowed transition-all"
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="h-9 rounded-lg border border-stone-200 px-4 text-[13px] font-medium text-stone-500 hover:bg-stone-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled
              title="本功能已归档，暂不支持上传作品凭证"
              className="flex h-9 items-center gap-2 rounded-lg bg-stone-300 px-5 text-[13px] font-medium text-white cursor-not-allowed transition-all"
            >
              <Upload className="size-3.5" />
              提交凭证
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
