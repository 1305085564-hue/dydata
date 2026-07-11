"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ContentFeedbackCardView, NextDayReviewResult } from "@/types";

type FeedbackCardItem = {
  video: {
    id: string;
    video_title: string | null;
    video_url: string | null;
    published_at: string | null;
    anomaly_status: string;
  } | null;
  account: { id: string; name: string | null } | null;
  feedback_card: ContentFeedbackCardView & { confirmed: NextDayReviewResult | null };
};

type FeedbackResponse = {
  items: FeedbackCardItem[];
  summary: { total: number; unread: number; viewed: number };
};

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function FeedbackSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="mt-1 size-2 rounded-full" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex gap-1.5">
                <Skeleton className="h-4 w-12 rounded-md" />
                <Skeleton className="h-4 w-16 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CardRow({
  item,
  expanded,
  onToggle,
  onMarkViewed,
  onReplySubmitted,
}: {
  item: FeedbackCardItem;
  expanded: boolean;
  onToggle: () => void;
  onMarkViewed: () => void;
  onReplySubmitted: (cardId: string, replyStatus: "acknowledged" | "disputed", replyText: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const isUnread = item.feedback_card.workflow_status === "sent";
  const confirmed = item.feedback_card.confirmed;

  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmitReply(status: "acknowledged" | "disputed") {
    if (!replyText.trim() || !item.feedback_card.card_id) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/content/feedback/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: item.feedback_card.card_id,
          replyStatus: status,
          replyText: replyText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "回传失败");
      feedbackToast.success("复盘已成功回传");
      onReplySubmitted(item.feedback_card.card_id, status, replyText.trim());
      setReplyText("");
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClick() {
    onToggle();
    if (isUnread) onMarkViewed();
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-stone-200 bg-white transition-[box-shadow,border-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
        isUnread && "border-l-2 border-l-[#D97757]",
        expanded && "shadow-sm",
      )}
    >
      <button
        type="button"
        className="active:translate-y-0 flex w-full items-start gap-3 p-4 text-left"
        onClick={handleClick}
        aria-expanded={expanded}
      >
        <span className="mt-1 shrink-0">
          <span
            className={cn(
              "inline-flex size-2 rounded-full",
              isUnread ? "bg-[#D99E55]" : "bg-[#6FAA7D]",
            )}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-medium text-stone-700">
              {item.video?.video_title || "（无标题）"}
            </span>
            {item.video?.published_at && (
              <span className="shrink-0 text-[12px] text-stone-500">
                {formatDate(item.video.published_at)}
              </span>
            )}
          </div>

          {confirmed?.summary.one_line && (
            <p className="mt-1 line-clamp-1 text-[12px] text-stone-500">
              {confirmed.summary.one_line}
            </p>
          )}

          {confirmed?.summary.problem_tags && confirmed.summary.problem_tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {confirmed.summary.problem_tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[12px] text-stone-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <ChevronDownIcon
          className={cn(
            "mt-0.5 size-3.5 shrink-0 stroke-[1.5] text-stone-500 transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
            expanded && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && confirmed && (
          <motion.div
            key="content"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-stone-100 px-4 pb-4 pt-3">
              {(() => {
                const mainProblem =
                  confirmed.summary.one_line ||
                  (confirmed.summary.problem_tags?.length
                    ? confirmed.summary.problem_tags.join(" / ")
                    : "");
                const improvement = confirmed.actions.message_for_member || "";
                return (
                  <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                    {mainProblem && (
                      <div className="space-y-1">
                        <div className="text-[12px] font-medium tracking-[0.12em] text-stone-500">
                          主要问题
                        </div>
                        <p className="text-[13px] leading-[1.7] text-stone-700">{mainProblem}</p>
                      </div>
                    )}
                    {improvement && (
                      <div className="border-l-2 border-[#D97757] pl-3">
                        <div className="text-[12px] font-medium tracking-[0.12em] text-stone-500">
                          建议下次
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[13px] font-medium leading-[1.7] text-stone-700">
                          {improvement}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {item.account?.name && (
                <div className="text-[12px] text-stone-500">账号：{item.account.name}</div>
              )}

              {/* Employee reply section */}
              {item.feedback_card.employee_reply_status && item.feedback_card.employee_reply_status !== "pending" ? (
                <div className={cn(
                  "rounded-xl border p-3 mt-2 text-[12px] space-y-1",
                  item.feedback_card.employee_reply_status === "acknowledged"
                    ? "border-green-200 bg-green-50/40 text-green-950"
                    : "border-amber-200 bg-amber-50/40 text-amber-950"
                )}>
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className={cn(
                      "size-1.5 rounded-full",
                      item.feedback_card.employee_reply_status === "acknowledged" ? "bg-green-500" : "bg-amber-500"
                    )} />
                    我的复盘：{item.feedback_card.employee_reply_status === "acknowledged" ? "已认可并采纳" : "已提出申诉/解释"}
                  </div>
                  {item.feedback_card.employee_reply_text && (
                    <p className="leading-relaxed text-stone-700 font-medium pl-3 border-l border-stone-300">
                      {item.feedback_card.employee_reply_text}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4 pt-3 border-t border-stone-100 space-y-3">
                  <div className="text-[12px] font-medium tracking-[0.12em] text-stone-500">
                    复盘回传
                  </div>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={submitting}
                    className="w-full min-h-[64px] rounded-xl border border-stone-200 p-2.5 text-[12px] leading-relaxed text-stone-700 placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-[#D97757] disabled:bg-stone-50"
                    placeholder="在此输入你对本条视频数据波动的复盘分析、客观原因或下一步改进方案..."
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={submitting || !replyText.trim()}
                      onClick={() => handleSubmitReply("acknowledged")}
                      className="active:translate-y-0 inline-flex h-8 items-center justify-center rounded-lg bg-green-600 px-4 text-[12px] font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                    >
                      {submitting ? "提交中..." : "认可并采纳"}
                    </button>
                    <button
                      type="button"
                      disabled={submitting || !replyText.trim()}
                      onClick={() => handleSubmitReply("disputed")}
                      className="active:translate-y-0 inline-flex h-8 items-center justify-center rounded-lg bg-stone-900 px-4 text-[12px] font-medium text-white transition-colors hover:bg-stone-900 disabled:opacity-50"
                    >
                      {submitting ? "提交中..." : "申诉/解释复盘"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FeedbackCardSection() {
  const [data, setData] = useState<FeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/content-feedback-cards")
      .then((res) => res.json())
      .then((json: FeedbackResponse) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleMarkViewed = useCallback(
    (cardId: string) => {
      fetch(`/api/dashboard/content-feedback-cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "viewed" }),
      })
        .then((res) => res.json())
        .then((json: { ok?: boolean }) => {
          if (json.ok && data) {
            setData({
              ...data,
              items: data.items.map((item) =>
                item.feedback_card.card_id === cardId
                  ? {
                      ...item,
                      feedback_card: {
                        ...item.feedback_card,
                        workflow_status: "viewed",
                        workflow_label: "员工已查看",
                      },
                    }
                  : item,
              ),
              summary: {
                ...data.summary,
                unread: Math.max(0, data.summary.unread - 1),
                viewed: data.summary.viewed + 1,
              },
            });
          }
        })
        .catch(() => {
          feedbackToast.error("标记已读失败");
        });
    },
    [data],
  );

  if (loading) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-px bg-[#D97757]" />
          <h3 className="text-[13px] font-medium text-stone-700">复盘反馈</h3>
        </div>
        <FeedbackSkeleton />
      </section>
    );
  }

  if (!data || data.items.length === 0) return null;

  const displayItems = data.items.slice(0, 8);

  const handleReplySubmitted = useCallback((cardId: string, replyStatus: 'acknowledged' | 'disputed', replyText: string) => {
    setData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.feedback_card.card_id === cardId
            ? {
                ...item,
                feedback_card: {
                  ...item.feedback_card,
                  employee_reply_status: replyStatus,
                  employee_reply_text: replyText,
                },
              }
            : item
        ),
      };
    });
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-4 w-px bg-[#D97757]" />
          <h3 className="text-[13px] font-medium text-stone-700">复盘反馈</h3>
          {data.summary.unread > 0 && (
            <span className="inline-flex items-center rounded-full bg-[#D97757]/6 px-2 py-0.5 text-[12px] font-medium text-[#D97757]">
              {data.summary.unread} 条未读
            </span>
          )}
        </div>
        <span className="text-[12px] text-stone-500">共 {data.summary.total} 条</span>
      </div>

      <div className="space-y-2">
        {displayItems.map((item) => {
          const cardId = item.feedback_card.card_id;
          if (!cardId) return null;
          return (
            <CardRow
              key={cardId}
              item={item}
              expanded={expandedId === cardId}
              onToggle={() => setExpandedId(expandedId === cardId ? null : cardId)}
              onMarkViewed={() => handleMarkViewed(cardId)}
              onReplySubmitted={handleReplySubmitted}
            />
          );
        })}
      </div>
    </section>
  );
}
