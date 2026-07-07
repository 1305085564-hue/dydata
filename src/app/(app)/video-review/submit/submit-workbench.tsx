"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { 
  Upload, 
  Trash2, 
  Plus, 
  FileText, 
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";

interface WorkSubmission {
  id: string;
  content_text: string | null;
  screenshot_urls: string[];
  screenshot_items: Array<{ path: string; signed_url: string | null }>;
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
  // We keep track of local preview URL and remote storage path
  const [screenshotFiles, setScreenshotFiles] = useState<Array<{ previewUrl: string; storagePath: string }>>([]);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

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
    // Reset file input value
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
    if (!confirm("确定要删除这条提交记录吗？")) return;

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
        {/* 今日统计大数 (A.3/C.3) */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 flex flex-col justify-between h-[100px]">
            <span className="text-[13px] text-stone-500">今日目标</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[28px] font-bold font-mono tabular-nums text-stone-800">
                {target}
              </span>
              <span className="text-[12px] text-stone-400 ml-1">个作品</span>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 flex flex-col justify-between h-[100px]">
            <span className="text-[13px] text-stone-500">已交凭证</span>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                "text-[28px] font-bold font-mono tabular-nums",
                isTargetMet ? "text-[#6FAA7D]" : "text-stone-800"
              )}>
                {submittedCount}
              </span>
              <span className="text-[12px] text-stone-400 ml-1">个作品</span>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 flex flex-col justify-between h-[100px]">
            <span className="text-[13px] text-stone-500">还差额</span>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                "text-[28px] font-bold font-mono tabular-nums",
                gap > 0 ? "text-[#C9604D]" : "text-[#6FAA7D]"
              )}>
                {gap}
              </span>
              <span className="text-[12px] text-stone-400 ml-1">个作品</span>
            </div>
          </div>
        </div>

        {/* 豁免提示区 */}
        {!isTargetMet && (
          <div className={cn(
            "rounded-xl border p-4 flex items-start justify-between gap-3 text-[13px] leading-[1.6]",
            hasApprovedExemption 
              ? "border-[#6FAA7D] bg-[#6FAA7D]/5 text-[#6FAA7D]" 
              : hasPendingExemption
              ? "border-[#D99E55] bg-[#D99E55]/5 text-[#D99E55]"
              : "border-[#C9604D] bg-[#C9604D]/5 text-[#C9604D]"
          )}>
            <div className="flex gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {hasApprovedExemption 
                    ? "今日已豁免成功" 
                    : hasPendingExemption 
                    ? "豁免申请正在审批中" 
                    : "今日发片指标尚未达成"}
                </p>
                <p className="mt-0.5 text-stone-500">
                  {hasApprovedExemption 
                    ? "您今天的差额已被审核减免，今日无需继续补交。" 
                    : hasPendingExemption
                    ? "您的豁免申请已提交，请耐心等待管理员审批。若今日仍发了片，可继续在此提交凭证。"
                    : "如确有请假、账号限流或技术故障等异常，请在今天内主动提交豁免申请。"}
                </p>
              </div>
            </div>
            {!hasApprovedExemption && !hasPendingExemption && (
              <Link
                href="/video-review/exemption"
                className="group shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[#D97757] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#C96442] active:translate-y-0"
              >
                申请豁免
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
        )}

        {/* 填报表单 (U1) */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
          <h2 className="text-[16px] font-bold text-stone-800">
            上传发片凭证
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 文案内容 */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-stone-500">
                文案内容 / 话术原文
              </label>
              <textarea
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
                placeholder="粘贴已发视频的标题、文案或话术原文..."
                rows={4}
                className="w-full rounded-xl border-0 bg-stone-100/70 p-4 text-[13px] text-stone-800 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950/5 transition-[background-color,box-shadow]"
              />
            </div>

            {/* 截图上传区 */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-stone-500">
                作品截图凭证
              </label>
              
              <div className="flex flex-wrap gap-2.5">
                {/* 已上传截图缩略图 */}
                {screenshotFiles.map((file, sIdx) => (
                  <div 
                    key={sIdx}
                    className="size-[84px] relative rounded-lg border border-stone-200 bg-stone-50 overflow-hidden group/thumb"
                  >
                    <img 
                      src={file.previewUrl} 
                      alt="预览" 
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeScreenshot(sIdx)}
                      className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity text-white"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}

                {/* 上传槽位按钮 */}
                {screenshotFiles.length < 9 && (
                  <label className={cn(
                    "size-[84px] flex flex-col items-center justify-center border border-dashed border-stone-300 rounded-lg cursor-pointer bg-stone-50 hover:bg-stone-100/60 transition",
                    uploading && "cursor-not-allowed opacity-60"
                  )}>
                    {uploading ? (
                      <Loader2 className="size-4 text-stone-400 animate-spin" />
                    ) : (
                      <>
                        <Plus className="size-4 text-stone-500" />
                        <span className="text-[11px] text-stone-400 mt-1">添加截图</span>
                      </>
                    )}
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFileChange}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                )}
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
                placeholder="例如：发在XXX号，今天第一条..."
                className="w-full h-10 rounded-xl border-0 bg-stone-100/70 px-4 text-[13px] text-stone-800 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950/5 transition-[background-color,box-shadow]"
              />
            </div>

            {/* 提交按钮 (唯一主 CTA `#D97757`) */}
            <button
              type="submit"
              disabled={submitting || uploading}
              className={cn(
                "w-full h-11 flex items-center justify-center gap-1.5 rounded-xl bg-[#D97757] text-white text-[14px] font-semibold shadow-sm transition hover:bg-[#C96442] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  提交登记中...
                </>
              ) : (
                "提交凭证"
              )}
            </button>
          </form>
        </div>
      </div>

      {/* 右侧：今日已交记录列表 (U2) */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between px-1">
          <h3 className="text-[14px] font-bold text-stone-800">
            今日提交历史
          </h3>
          <span className="font-mono text-[12px] tabular-nums text-stone-400">
            共 {submissions.length} 条
          </span>
        </div>

        {submissions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center text-stone-400 text-[13px]">
            今天还没有提交发片凭证
          </div>
        ) : (
          <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {submissions.map((sub) => (
              <div 
                key={sub.id} 
                className="rounded-2xl border border-zinc-200 bg-white p-4.5 space-y-3 relative group"
              >
                {/* 删除按钮 */}
                <button
                  type="button"
                  onClick={() => handleDeleteSubmission(sub.id)}
                  className="absolute top-3 right-3 text-stone-400 hover:text-[#C9604D] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  title="删除"
                >
                  <Trash2 className="size-4" />
                </button>

                {/* 话术文本预览 */}
                {sub.content_text && (
                  <p className="text-[13px] text-stone-800 leading-[1.6] line-clamp-3 whitespace-pre-wrap">
                    {sub.content_text}
                  </p>
                )}

                {/* 截图列表 */}
                {sub.screenshot_items && sub.screenshot_items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {sub.screenshot_items.map((item, imgIdx) => (
                      <div
                        key={imgIdx}
                        onClick={() => { if (item.signed_url) setZoomImage(item.signed_url); }}
                        className="size-11 relative rounded border border-stone-200 bg-stone-50 overflow-hidden cursor-zoom-in"
                      >
                        {item.signed_url ? (
                          <img 
                            src={item.signed_url} 
                            alt="截图" 
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="size-full flex items-center justify-center text-[10px] text-stone-400">
                            失败
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 备注 */}
                {sub.note && (
                  <div className="flex items-start gap-1 text-[11px] text-stone-400 truncate">
                    <FileText className="size-3 mt-0.5 shrink-0" />
                    <span>{sub.note}</span>
                  </div>
                )}

                {/* 提交时间 */}
                <div className="text-[10px] text-stone-400 font-mono">
                  {new Date(sub.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 放大预览 Dialog */}
      <Dialog open={zoomImage !== null} onOpenChange={(open) => { if (!open) setZoomImage(null); }}>
        <DialogContent className="bg-black/90 border-0 p-2 rounded-2xl flex items-center justify-center overflow-hidden" style={{ maxWidth: '1024px' }}>
          <div className="relative max-h-[85vh] max-w-full">
            {zoomImage && (
              <img 
                src={zoomImage} 
                alt="放大截图" 
                className="max-h-[80vh] object-contain rounded-lg shadow-2xl mx-auto"
              />
            )}
            <DialogClose className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors">
              <X className="size-4" />
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
