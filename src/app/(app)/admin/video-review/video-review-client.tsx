"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Video, Profile } from "@/types";
import { CheckCircle2, Clock, Eye, FileVideo, RefreshCw, Search, X } from "lucide-react";

type ReviewStatus = "pending" | "ai_done" | "reviewing" | "feedback_sent" | "verified" | "archived";

interface VideoReviewItem {
  id: string;
  video_id: string;
  reviewer_id: string | null;
  status: ReviewStatus;
  ai_diagnosis: unknown;
  feedback_card: { title: string; action: string; reason: string; example: string } | null;
  ai_diagnosis_at: string | null;
  feedback_sent_at: string | null;
  created_at: string;
  video: Video | null;
  reviewer: Pick<Profile, "id" | "name"> | null;
}

// Raw Supabase response: relations come back as arrays by default
// video/reviewer typed as unknown to avoid mismatch with @/types Video (Supabase only returns a subset of fields)
type RawVideoReviewItem = {
  id: string;
  video_id: string;
  reviewer_id: string | null;
  status: ReviewStatus;
  ai_diagnosis: unknown;
  feedback_card: { title: string; action: string; reason: string; example: string } | null;
  ai_diagnosis_at: string | null;
  feedback_sent_at: string | null;
  created_at: string;
  video: unknown;
  reviewer: unknown;
};

interface Props {
  initialItems: RawVideoReviewItem[];
  initialQuery: string;
}

export function VideoReviewClient({ initialItems, initialQuery }: Props) {
  const [items, setItems] = useState<RawVideoReviewItem[]>(initialItems);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState({ title: "", action: "", reason: "", example: "" });

  const normalizedItems: VideoReviewItem[] = items.map((i) => ({
    ...i,
    video: Array.isArray(i.video) ? (i.video[0] as Video) : (i.video as Video),
    reviewer: Array.isArray(i.reviewer) ? (i.reviewer[0] as Pick<Profile, "id" | "name">) : (i.reviewer as Pick<Profile, "id" | "name">),
  }));

  const filtered = initialQuery
    ? normalizedItems.filter((i) => i.video?.video_title?.toLowerCase().includes(initialQuery.toLowerCase()))
    : statusFilter === "all"
    ? normalizedItems
    : normalizedItems.filter((i) => i.status === statusFilter);

  const statusConfig: Record<ReviewStatus, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: "待诊断", color: "text-gray-500", icon: <Clock className="w-4 h-4" /> },
    ai_done: { label: "AI 已诊断", color: "text-blue-600", icon: <RefreshCw className="w-4 h-4" /> },
    reviewing: { label: "待人工复核", color: "text-amber-600", icon: <Eye className="w-4 h-4" /> },
    feedback_sent: { label: "已下发反馈", color: "text-green-600", icon: <CheckCircle2 className="w-4 h-4" /> },
    verified: { label: "已复验", color: "text-green-700", icon: <CheckCircle2 className="w-4 h-4" /> },
    archived: { label: "已归档", color: "text-gray-400", icon: <CheckCircle2 className="w-4 h-4" /> },
  };

  const visibleStatuses: ReviewStatus[] = ["pending", "ai_done", "reviewing", "feedback_sent"];

  const handleOpenReview = (item: RawVideoReviewItem) => {
    setSelectedId(item.id);
    if (item.feedback_card) {
      setFeedbackDraft(item.feedback_card);
    } else {
      setFeedbackDraft({ title: "", action: "", reason: "", example: "" });
    }
  };

  const handleSubmitReview = async () => {
    if (!selectedId || !feedbackDraft.title || !feedbackDraft.action) return;
    setSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("video_review")
      .update({
        status: "feedback_sent" as ReviewStatus,
        feedback_card: feedbackDraft,
        feedback_sent_at: new Date().toISOString(),
        reviewer_id: user?.id,
      })
      .eq("id", selectedId);
    setSubmitting(false);
    if (!err) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === selectedId ? { ...i, status: "feedback_sent" as ReviewStatus, feedback_card: feedbackDraft, feedback_sent_at: new Date().toISOString() } : i
        )
      );
      setSelectedId(null);
    }
  };

  const handleRunAiDiagnosis = async (item: RawVideoReviewItem) => {
    const supabase = createClient();
    const { error: err } = await supabase
      .from("video_review")
      .update({ status: "ai_done" as ReviewStatus, ai_diagnosis_at: new Date().toISOString() })
      .eq("id", item.id);
    if (!err) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "ai_done" as ReviewStatus, ai_diagnosis_at: new Date().toISOString() } : i))
      );
    }
  };

  const selectedItem = selectedId
    ? (items.find((i) => i.id === selectedId) ?? null)
    : null;
  const normalizedSelectedVideo = (selectedItem
    ? (Array.isArray(selectedItem.video) ? (selectedItem.video[0] as Video) : (selectedItem.video as Video))
    : null) as Video | null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">视频复盘台</h1>
        <p className="mt-1 text-sm text-gray-500">
          查看视频 AI 诊断结果，进行人工复核，下发可执行反馈。
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {visibleStatuses.map((s) => {
          const cfg = statusConfig[s];
          const count = items.filter((i) => i.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={`flex items-center gap-3 p-4 rounded-lg border transition-colors ${
                statusFilter === s ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className={cfg.color}>{cfg.icon}</div>
              <div>
                <div className="text-2xl font-semibold text-gray-900">{count}</div>
                <div className="text-xs text-gray-500">{cfg.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="搜索视频标题..."
          defaultValue={initialQuery}
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
          <FileVideo className="w-12 h-12" />
          <p className="text-sm">暂无待复盘视频</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const cfg = statusConfig[item.status];
            return (
              <div
                key={item.id}
                className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {item.video?.video_title || "未命名视频"}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span className={cfg.color}>{cfg.icon} {cfg.label}</span>
                    {item.reviewer && <span>复核人：{item.reviewer.name}</span>}
                    <span>{new Date(item.created_at).toLocaleDateString("zh-CN")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.status === "pending" && (
                    <button
                      onClick={() => handleRunAiDiagnosis(item)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:border-gray-300"
                    >
                      <RefreshCw className="w-3 h-3" /> AI 诊断
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenReview(item)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    {item.status === "pending" ? "开始复盘" : item.status === "feedback_sent" ? "查看" : "复核"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review drawer */}
      {selectedId && selectedItem && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setSelectedId(null)} />
          <div className="relative w-full max-w-lg bg-white flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">视频复盘</h2>
              <button onClick={() => setSelectedId(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-sm font-medium text-gray-700">
                  {normalizedSelectedVideo?.video_title || "未命名视频"}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  提交时间：{new Date(selectedItem.created_at).toLocaleString("zh-CN")}
                </div>
              </div>

              {selectedItem.ai_diagnosis ? (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">AI 初诊结果</div>
                  <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-900 whitespace-pre-wrap">
                    {typeof selectedItem.ai_diagnosis === "string"
                      ? selectedItem.ai_diagnosis
                      : JSON.stringify(selectedItem.ai_diagnosis, null, 2)}
                  </div>
                </div>
              ) : null}

              <div>
                <div className="text-sm font-medium text-gray-700 mb-3">反馈卡片</div>
                <div className="space-y-3">
                  {(["title", "action", "reason", "example"] as const).map((field) => (
                    <div key={field}>
                      <label className="block text-xs text-gray-500 mb-1">
                        {field === "title" ? "标题" : field === "action" ? "下一步动作" : field === "reason" ? "问题原因" : "参考案例"}
                        {(field === "title" || field === "action") && " *"}
                      </label>
                      {field === "example" ? (
                        <textarea
                          rows={3}
                          value={feedbackDraft[field]}
                          onChange={(e) => setFeedbackDraft((p) => ({ ...p, [field]: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none"
                          placeholder="提供可参考的优秀案例..."
                        />
                      ) : (
                        <input
                          type="text"
                          value={feedbackDraft[field]}
                          onChange={(e) => setFeedbackDraft((p) => ({ ...p, [field]: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                          placeholder={
                            field === "title" ? "如：开场钩子不够强" :
                            field === "action" ? "如：优化前3秒开场" :
                            "如：用户流失在开头"
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t flex gap-2">
              <button
                onClick={() => setSelectedId(null)}
                className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={submitting || !feedbackDraft.title || !feedbackDraft.action}
                className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "保存中..." : "下发反馈"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
