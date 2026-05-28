"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotifications } from "./notification-store";
import { FeedbackDetailDialog } from "./feedback-detail-dialog";
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
  const { activated, setLocalNotification } = useNotifications();
  const fetchedRef = useRef(false);
  const [items, setItems] = useState<FeedbackCardItem[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!activated) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch("/api/dashboard/content-feedback-cards")
      .then((res) => res.json())
      .then((json: FeedbackResponse) => {
        if (!json.items?.length) return;
        setItems(json.items);
      })
      .catch(() => {});
  }, [activated]);

  const openDetail = useCallback((cardId: string) => {
    setActiveCardId(cardId);
  }, []);

  useEffect(() => {
    for (const item of items) {
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
        primaryActionLabel: "查看详情",
        primaryAction: () => openDetail(cardId),
        createdAt: item.video?.published_at ?? undefined,
      });
    }
  }, [items, setLocalNotification, openDetail]);

  const activeItem = activeCardId
    ? items.find((i) => i.feedback_card.card_id === activeCardId) ?? null
    : null;

  const handleConfirmed = useCallback(
    (cardId: string) => {
      setItems((prev) =>
        prev.map((item) =>
          item.feedback_card.card_id === cardId
            ? { ...item, feedback_card: { ...item.feedback_card, workflow_status: "viewed", workflow_label: "员工已查看" } }
            : item,
        ),
      );
      setLocalNotification(`feedback-card-${cardId}`, null);
      setActiveCardId(null);
    },
    [setLocalNotification],
  );

  return (
    <FeedbackDetailDialog
      open={Boolean(activeItem)}
      onOpenChange={(open) => { if (!open) setActiveCardId(null); }}
      item={activeItem}
      onConfirmed={handleConfirmed}
    />
  );
}
