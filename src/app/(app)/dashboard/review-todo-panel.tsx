"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VIDEO_REVIEW_ISSUE_TAGS, type VideoReviewIssueTag, type VideoReviewTicket } from "@/lib/video-review-tickets";

interface ReviewTodoPanelProps {
  initialTickets: VideoReviewTicket[];
  loadError?: string | null;
}

export function ReviewTodoPanel({ initialTickets, loadError = null }: ReviewTodoPanelProps) {
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets);
  const [selectedTags, setSelectedTags] = useState<Record<string, VideoReviewIssueTag>>(
    Object.fromEntries(initialTickets.map((ticket) => [ticket.id, VIDEO_REVIEW_ISSUE_TAGS[0]])),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError);

  const resolveTicket = async (ticketId: string) => {
    setBusyId(ticketId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/pulse/review-tickets/${ticketId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ issueTag: selectedTags[ticketId] ?? VIDEO_REVIEW_ISSUE_TAGS[0] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "确认改进失败，请刷新后重试");
        return;
      }
      setTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
    } catch {
      setError("确认改进请求失败，请稍后重试");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-label="复盘待办">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[20px] font-medium text-[#141413]">复盘待办</h2>
        {tickets.length > 0 && <span className="text-[12px] text-[#78716C]">{tickets.length} 条待确认</span>}
      </div>
      {error && <div role="alert" className="rounded-md border border-[#E2B4B4] bg-[#FFF8F8] px-3 py-2 text-[12px] text-[#9B3A3A]">{error}</div>}
      {tickets.length === 0 ? (
        <Card className="p-4 text-[14px] text-[#78716C]">今日没有待复盘工单。</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-[14px] text-[#1F1E1D]">【待复盘】{ticket.videoTitle}</div>
                <div className="mt-1 text-[12px] text-[#78716C]">
                  {ticket.reporterName} · {ticket.issueTag} · {new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ticket.createdAt))}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  size="s"
                  variant="ghost"
                  onClick={() => {
                    // 带上作品发布日，让复盘页列表落在稿子所在那天；无发布日则保持原跳转（最近一天）
                    const params = new URLSearchParams({ videoId: ticket.videoId });
                    if (ticket.videoDate) {
                      params.set("startDate", ticket.videoDate);
                      params.set("endDate", ticket.videoDate);
                    }
                    router.push(`/admin/content?${params.toString()}`);
                  }}
                >
                  查看作品
                </Button>
                <select
                  aria-label={`选择 ${ticket.videoTitle} 的改进标签`}
                  value={selectedTags[ticket.id] ?? VIDEO_REVIEW_ISSUE_TAGS[0]}
                  onChange={(event) => setSelectedTags((current) => ({ ...current, [ticket.id]: event.target.value as VideoReviewIssueTag }))}
                  className="h-8 rounded-md border border-[#E2E2DF] bg-white px-2 text-[12px] text-[#1F1E1D]"
                >
                  {VIDEO_REVIEW_ISSUE_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
                <Button size="s" variant="outline" disabled={busyId === ticket.id} onClick={() => void resolveTicket(ticket.id)}>
                  {busyId === ticket.id ? "确认中…" : "确认改进"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
