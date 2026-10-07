"use client";

import { useCallback, useState } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { requestVideoLifecycleAction } from "@/lib/content/data/detail";
import type { VideoRow } from "@/lib/content/domain/detail";

export type ContentLifecycleAction = "trash" | "restore" | "purge";

const PURGE_PROTECTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isContentPurgeEligible(trashedAt: string | null | undefined, now: number) {
  if (!trashedAt) return false;
  return now - new Date(trashedAt).getTime() >= PURGE_PROTECTION_DAYS * DAY_MS;
}

export function getContentPurgeTooltip(trashedAt: string | null | undefined, now: number) {
  if (!trashedAt) return "";
  const targetDate = new Date(
    new Date(trashedAt).getTime() + PURGE_PROTECTION_DAYS * DAY_MS,
  );
  const diff = targetDate.getTime() - now;
  if (diff <= 0) return "";
  const daysLeft = Math.ceil(diff / DAY_MS);
  return `未满 30 天（剩余约 ${daysLeft} 天，可于 ${targetDate.toLocaleString("zh-CN")} 后删除）`;
}

interface UseContentDetailLifecycleArgs {
  video: VideoRow | null;
  onLifecycleChanged: () => void;
}

export function useContentDetailLifecycle({
  video,
  onLifecycleChanged,
}: UseContentDetailLifecycleArgs) {
  // 捕获挂载时刻用于回收站 30 天保护期判断，避免 render 中调用 Date.now()（React Compiler purity）
  const [now] = useState(() => Date.now());
  const [isOperating, setIsOperating] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<ContentLifecycleAction | null>(null);
  const clearConfirmation = useCallback(() => setConfirmationAction(null), []);

  const handleLifecycleAction = useCallback(async (action: ContentLifecycleAction) => {
    if (!video) return;
    setIsOperating(true);
    try {
      const { res, data } = await requestVideoLifecycleAction(video.id, action);
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "操作失败");
      }
      setConfirmationAction(null);
      if (action === "trash") {
        feedbackToast.success("作品已移入回收站，关联日报已作废");
      } else if (action === "restore") {
        feedbackToast.success("作品已恢复，关联日报已复活");
      } else {
        feedbackToast.success("作品已彻底物理删除");
      }
      onLifecycleChanged();
    } catch (error) {
      feedbackToast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setIsOperating(false);
    }
  }, [onLifecycleChanged, video]);

  const isPurgeEligible = useCallback(
    (trashedAt: string | null | undefined) => isContentPurgeEligible(trashedAt, now),
    [now],
  );

  const getPurgeTooltip = useCallback(
    (trashedAt: string | null | undefined) => getContentPurgeTooltip(trashedAt, now),
    [now],
  );

  return {
    isOperating,
    confirmationAction,
    isConfirmingTrash: confirmationAction === "trash",
    isConfirmingRestore: confirmationAction === "restore",
    isConfirmingPurge: confirmationAction === "purge",
    requestConfirmation: setConfirmationAction,
    clearConfirmation,
    handleLifecycleAction,
    isPurgeEligible,
    getPurgeTooltip,
  };
}
