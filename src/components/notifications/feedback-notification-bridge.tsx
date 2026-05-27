"use client";

import { useEffect, useRef } from "react";
import { useNotifications } from "./notification-store";
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

export function FeedbackNotificationBridge() {
  const { setLocalNotification } = useNotifications();
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch("/api/dashboard/content-feedback-cards")
      .then((res) => res.json())
      .then((json: FeedbackResponse) => {
        if (!json.items?.length) return;

        for (const item of json.items) {
          const cardId = item.feedback_card.card_id;
          if (!cardId) continue;

          const isUnread = item.feedback_card.workflow_status === "sent";
          if (!isUnread) continue;

          const title = item.video?.video_title || "（无标题视频）";
          const confirmed = item.feedback_card.confirmed;
          const oneLine = confirmed?.summary?.one_line || "";
          const tags = confirmed?.summary?.problem_tags?.slice(0, 3).join("、") || "";
          const body = [oneLine, tags ? `问题标签：${tags}` : ""].filter(Boolean).join("\n");

          setLocalNotification(`feedback-card-${cardId}`, {
            key: `feedback-card-${cardId}`,
            type: "feedback_card",
            category: "todo",
            severity: "warning",
            title: `复盘反馈：${title}`,
            body: body || null,
            primaryActionLabel: "确认已读",
            primaryAction: () => {
              fetch(`/api/dashboard/content-feedback-cards/${cardId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "viewed" }),
              });
            },
            secondaryActionLabel: "忽略",
            secondaryAction: () => {},
            createdAt: item.video?.published_at ?? undefined,
          });
        }
      })
      .catch(() => {});
  }, [setLocalNotification]);

  return null;
}
