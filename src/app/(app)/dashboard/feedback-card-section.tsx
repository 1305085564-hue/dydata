"use client";

import { useCallback, useEffect, useState } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
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

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-xl border border-zinc-200 bg-white p-4">
          <div className="h-3 w-2/3 rounded bg-zinc-100" />
          <div className="mt-3 h-3 w-1/2 rounded bg-zinc-100" />
          <div className="mt-2 h-3 w-3/4 rounded bg-zinc-100" />
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
}: {
  item: FeedbackCardItem;
  expanded: boolean;
  onToggle: () => void;
  onMarkViewed: () => void;
}) {
  const isUnread = item.feedback_card.workflow_status === "sent";
  const confirmed = item.feedback_card.confirmed;

  function handleClick() {
    onToggle();
    if (isUnread) onMarkViewed();
  }

  return (
    <div
      className={[
        "rounded-xl border border-zinc-200 bg-white transition-[box-shadow,border-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
        isUnread && "border-l-2 border-l-[#D97757]",
        expanded && "shadow-sm",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 p-4 text-left active:translate-y-0"
        onClick={handleClick}
      >
        {/* Status dot */}
        <span className="mt-1 shrink-0">
          {isUnread ? (
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-[pulse_2s_ease-in-out_infinite] rounded-full bg-[#D99E55] opacity-40" />
              <span className="relative inline-flex size-2 rounded-full bg-[#D99E55]" />
            </span>
          ) : (
            <span className="inline-flex size-2 rounded-full bg-[#6FAA7D]" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-medium text-zinc-800">
              {item.video?.video_title || "（无标题）"}
            </span>
            {item.video?.published_at && (
              <span className="shrink-0 text-[11px] text-zinc-400">
                {formatDate(item.video.published_at)}
              </span>
            )}
          </div>

          {confirmed?.summary.one_line && (
            <p className="mt-1 line-clamp-1 text-[12px] text-zinc-500">
              {confirmed.summary.one_line}
            </p>
          )}

          {confirmed?.summary.problem_tags && confirmed.summary.problem_tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {confirmed.summary.problem_tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <span className="mt-0.5 shrink-0 text-[11px] text-zinc-400">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && confirmed && (
        <div className="space-y-3 border-t border-zinc-100 px-4 pb-4 pt-3 transition-all duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]">
          {confirmed.actions.instructions.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-zinc-400">下一步动作</div>
              <ol className="mt-1 space-y-0.5">
                {confirmed.actions.instructions.map((inst, i) => (
                  <li key={i} className="flex gap-1.5 text-[13px] leading-relaxed text-zinc-700">
                    <span className="shrink-0 font-medium text-[#D97757]">{i + 1}.</span>
                    <span>{inst}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {confirmed.actions.message_for_member && (
            <div>
              <div className="text-[11px] font-medium text-zinc-400">管理者反馈</div>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700">
                {confirmed.actions.message_for_member}
              </p>
            </div>
          )}

          {item.account?.name && (
            <div className="text-[11px] text-zinc-400">
              账号：{item.account.name}
            </div>
          )}
        </div>
      )}
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
          <h3 className="text-[14px] font-medium text-zinc-800">复盘反馈</h3>
        </div>
        <Skeleton />
      </section>
    );
  }

  if (!data || data.items.length === 0) return null;

  const displayItems = data.items.slice(0, 5);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-4 w-px bg-[#D97757]" />
          <h3 className="text-[14px] font-medium text-zinc-800">复盘反馈</h3>
          {data.summary.unread > 0 && (
            <span className="inline-flex items-center rounded-full bg-[#D97757]/6 px-2 py-0.5 text-[11px] font-medium text-[#D97757]">
              {data.summary.unread} 条未读
            </span>
          )}
        </div>
        <span className="text-[11px] text-zinc-400">
          共 {data.summary.total} 条
        </span>
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
            />
          );
        })}
      </div>
    </section>
  );
}
