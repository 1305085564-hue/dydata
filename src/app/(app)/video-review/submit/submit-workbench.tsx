"use client";

import { useState, useEffect } from "react";
import { 
  Upload, 
  Plus, 
  FileText, 
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  X,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SubmissionHistory } from "../components/submission-history";
import { trackUsageEvent } from "@/lib/usage-events/client";

interface WorkSubmission {
  id: string;
  user_id: string;
  team_id: string | null;
  group_id: string | null;
  submit_date: string;
  content_text: string | null;
  screenshot_urls: string[] | null;
  screenshot_items?: Array<{ path: string; signed_url: string | null }>;
  note: string | null;
  created_at: string;
}

interface SubmitWorkbenchProps {
  userId: string;
  initialTarget: number;
  initialSubmissions: WorkSubmission[];
  hasApprovedExemption: boolean;
  hasPendingExemption: boolean;
  todayDate: string;
}

export function SubmitWorkbench({
  userId,
  initialTarget,
  initialSubmissions,
  hasApprovedExemption,
  hasPendingExemption,
  todayDate,
}: SubmitWorkbenchProps) {
  const [submissions, setSubmissions] = useState<WorkSubmission[]>(initialSubmissions);
  const [target, setTarget] = useState(initialTarget);

  // Form State
  const [contentText, setContentText] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Uploaded screenshots in current form
  const [screenshotFiles, setScreenshotFiles] = useState<Array<{ previewUrl: string; storagePath: string }>>([]);

  // Computed Quota Stats
  const submittedCount = submissions.length;
  const gap = Math.max(0, target - submittedCount);
  const isTargetMet = submittedCount >= target;

  // Refresh submissions list for today
  const refreshSubmissions = async () => {
    try {
      const res = await fetch(`/api/work-submissions?date=${todayDate}`);
      const result = await res.json();
      if (result.data) {
        setSubmissions(result.data);
      }
    } catch (err) {
      console.error("Failed to refresh submissions:", err);
    }
  };

  // Handle uploading files
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newUploads = [...screenshotFiles];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Local Preview
      const previewUrl = URL.createObjectURL(file);

      // Upload to server
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/work-screenshots/upload", {
          method: "POST",
          body: formData,
        });
        const result = await res.json();

        if (res.ok && result.data?.path) {
          newUploads.push({
            previewUrl,
            storagePath: result.data.path,
          });
        } else {
          toast.error(`图片 ${file.name} 上传失败`, {
            description: result.error || "接口错误",
          });
        }
      } catch (err) {
        toast.error("文件上传失败", {
          description: "网络连接失败，请重试",
        });
      }
    }

    setScreenshotFiles(newUploads);
    setUploading(false);
    e.target.value = "";
  };

  // Remove screenshot from current form list
  const removeScreenshot = (index: number) => {
    const targetItem = screenshotFiles[index];
    URL.revokeObjectURL(targetItem.previewUrl);
    setScreenshotFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Work Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contentText.trim() && screenshotFiles.length === 0) {
      toast.error("无法提交", {
        description: "请至少填写文案内容或上传一张截图",
      });
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
        toast.success("提交成功", {
          description: "已登记您的今日产量作品凭证",
        });
        trackUsageEvent({ path: "/video-review/submit", eventType: "submit_work_submission" });
        // Clear Form
        setContentText("");
        setNote("");
        screenshotFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setScreenshotFiles([]);
        // Refresh List
        await refreshSubmissions();
      } else {
        toast.error("提交失败", {
          description: result.error || "服务接口出错",
        });
      }
    } catch (err) {
      toast.error("提交失败", {
        description: "网络连接失败，请重试",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Delete today's submission
  const handleDeleteSubmission = async (id: string) => {
    try {
      const res = await fetch(`/api/work-submissions/${id}`, {
        method: "DELETE",
      });
      const result = await res.json();

      if (res.ok) {
        toast.success("删除成功", {
          description: "已移除该条提交记录",
        });
        await refreshSubmissions();
      } else {
        toast.error("删除失败", {
          description: result.error || "删除操作失败",
        });
      }
    } catch (err) {
      toast.error("删除失败", {
        description: "网络错误，请重试",
      });
    }
  };

  // Cleanup ObjectURLs on unmount
  useEffect(() => {
    return () => {
      screenshotFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [screenshotFiles]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* 左侧：提交表单 + 状态卡片 */}
      <div className="lg:col-span-2 space-y-6">
        {/* 归档提示 */}
        <div className="flex items-start gap-2.5 rounded-xl border border-stone-200 bg-white p-3.5 text-[13px] text-stone-600 shadow-sm">
          <Info className="mt-0.5 size-4 shrink-0 stroke-[1.5] text-[#8AA8C7]" />
          <div className="leading-relaxed">
            <span className="font-medium text-stone-800">功能已归档：</span>
            该页面仅保留历史提交记录查看，不再接受新的作品凭证上传与提交。如需登记产量，请使用工作台日报入口。
          </div>
        </div>

        {/* 今日统计大数 (A.3/C.3) */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col justify-between h-[100px]">
            <span className="text-[13px] text-stone-500">今日目标</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[18px] font-medium tabular-nums text-stone-900">
                {target}
              </span>
              <span className="text-[12px] text-stone-500 ml-1">个作品</span>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col justify-between h-[100px]">
            <span className="text-[13px] text-stone-500">已交凭证</span>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                "text-[18px] font-medium tabular-nums",
                isTargetMet ? "text-[#6FAA7D]" : "text-stone-900"
              )}>
                {submittedCount}
              </span>
              <span className="text-[12px] text-stone-500 ml-1">个作品</span>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col justify-between h-[100px]">
            <span className="text-[13px] text-stone-500">还差额</span>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                "text-[24px] font-medium tabular-nums",
                gap > 0 ? "text-[#C9604D]" : "text-[#6FAA7D]"
              )}>
                {gap}
              </span>
              <span className="text-[12px] text-stone-500 ml-1">个作品</span>
            </div>
          </div>
        </div>

        {/* 豁免提示区 */}
        {!isTargetMet && (
          <div className={cn(
            "rounded-xl border p-4 text-[13px] leading-[1.6]",
            hasApprovedExemption
              ? "bg-[#6FAA7D]/5 border-[#6FAA7D]/20 text-[#6FAA7D] flex items-start gap-2"
              : hasPendingExemption
              ? "bg-[#D99E55]/5 border-[#D99E55]/20 text-[#D99E55] flex items-start gap-2"
              : "bg-[#C9604D]/5 border-[#C9604D]/20 text-[#C9604D] flex items-start gap-2"
          )}>
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <div>
              {hasApprovedExemption ? (
                <p className="font-medium">
                  今日有已通过的免责豁免，您的“未交齐”红灯已被消除，今日指标豁免不扣分。
                </p>
              ) : hasPendingExemption ? (
                <p className="font-medium">
                  今日免责豁免申请处理中。管理员审核通过后，未交齐红灯将自动消除。
                </p>
              ) : (
                <p className="font-medium">
                  今日尚未交齐发片指标，且未提交豁免请假申请。建议及时点击右上角进行豁免报备。
                </p>
              )}
            </div>
          </div>
        )}

        {/* 提交表单白色卡片 */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
          <div>
            <h2 className="text-[18px] font-medium text-stone-900">
              凭证上传登记
            </h2>
            <p className="text-[13px] text-stone-500 mt-1 leading-[1.5]">
              请如实填写发片凭证，支持提交视频标题文案或截图。
            </p>
          </div>

          <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
            {/* 文案内容 */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-stone-500">
                文案内容 / 话术原文
              </label>
              <textarea
                id="submit-content-input"
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
                placeholder="功能已归档，不再接受新提交"
                rows={4}
                disabled
                className="w-full rounded-lg bg-stone-50 border border-stone-200 p-4 text-[13px] text-stone-700 placeholder:text-stone-400 focus:outline-none disabled:cursor-not-allowed transition-[background-color,box-shadow]"
              />
            </div>

            {/* 截图上传区 */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-stone-500">
                作品截图凭证
              </label>
              <div className="flex flex-wrap gap-2.5">
                {screenshotFiles.map((item, index) => (
                  <div 
                    key={index} 
                    className="relative size-20 rounded-lg border border-stone-200 bg-stone-50 overflow-hidden group"
                  >
                    <img 
                      src={item.previewUrl} 
                      alt="预览" 
                      className="size-full object-cover" 
                    />
                  </div>
                ))}

                <label className="flex size-20 cursor-not-allowed flex-col items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-50 text-stone-400 transition-all">
                  <Plus className="size-5" />
                  <span className="text-[12px] mt-1 font-medium">上传截图</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled
                  />
                </label>
              </div>
            </div>

            {/* 备注 */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-stone-500">
                备注 (可选)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="功能已归档，不再接受新提交"
                disabled
                className="w-full h-10 rounded-lg bg-stone-50 border border-stone-200 px-4 text-[13px] text-stone-700 placeholder:text-stone-400 focus:outline-none disabled:cursor-not-allowed transition-[background-color,box-shadow]"
              />
            </div>

            {/* 提交按钮 — 已归档禁用 */}
            <button
              type="submit"
              disabled
              title="功能已归档，不再接受新提交"
              className="w-full h-11 flex items-center justify-center gap-1.5 rounded-xl bg-stone-300 text-white text-[13px] font-medium cursor-not-allowed"
            >
              提交凭证
            </button>
          </form>
        </div>
      </div>

      {/* 右侧历史记录列表 */}
      <div className="lg:col-span-1 space-y-4">
        <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4 space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto">
          <SubmissionHistory
            submissions={submissions}
            onDelete={handleDeleteSubmission}
            onCtaClick={() => document.getElementById("submit-content-input")?.focus()}
            readOnly
          />
        </div>
      </div>
    </div>
  );
}
