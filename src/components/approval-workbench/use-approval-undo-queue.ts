"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActiveUndoItem, ReviewAction } from "@/lib/command-hub/types";
import type { ExemptionRequest } from "@/lib/exemption-approvals";
import {
  computeRemainingSeconds,
  createUndoQueueController,
  DEFAULT_UNDO_DURATION_MS,
  type UndoCountdownSnapshot,
} from "@/lib/command-hub/domain/undo-countdown";

export interface UndoEntry {
  id: string;
  title: string;
  requestIds: string[];
  action: ReviewAction;
  originalItems: ExemptionRequest[];
  feedback?: string;
  dates?: string[];
  source: "exemption" | "fulfillment_appeal";
  suppressedTodoIds?: string[];
}

function newUndoId() {
  return `undo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function sendKeepalive(url: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const sent =
    typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
      ? navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))
      : false;
  if (!sent) {
    void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
      .catch((error) => console.error("Failed to flush pending review", error));
  }
}

function mergeUndoSnapshots(prev: ActiveUndoItem[], snapshots: UndoCountdownSnapshot[]): ActiveUndoItem[] {
  let changed = prev.length !== snapshots.length;
  const next: ActiveUndoItem[] = [];
  for (const item of prev) {
    const matched = snapshots.find((snapshot) => snapshot.id === item.id);
    if (!matched) {
      changed = true;
      continue;
    }
    if (matched.remainingSeconds !== item.remainingSeconds) changed = true;
    next.push(
      matched.remainingSeconds === item.remainingSeconds
        ? item
        : { ...item, remainingSeconds: matched.remainingSeconds },
    );
  }
  return changed ? next : prev;
}

export function useApprovalUndoQueue({
  open,
  onExpire,
}: {
  open: boolean;
  onExpire: (entry: UndoEntry) => void;
}) {
  const [undoList, setUndoList] = useState<ActiveUndoItem[]>([]);

  const [controller] = useState(() =>
    createUndoQueueController<UndoEntry>({
      onChange: (snapshots) => {
        setUndoList((prev) => mergeUndoSnapshots(prev, snapshots));
      },
      onExpire: () => undefined,
    }),
  );

  useEffect(() => {
    controller.setOnExpire(onExpire);
  }, [controller, onExpire]);

  const schedule = useCallback((entry: Omit<UndoEntry, "id">) => {
    if (entry.requestIds.length === 0) return;
    const id = newUndoId();
    const title = entry.feedback ? `${entry.title}（附原因）` : entry.title;
    setUndoList((current) => [
      ...current,
      { id, title, action: entry.action, remainingSeconds: computeRemainingSeconds(DEFAULT_UNDO_DURATION_MS) },
    ]);
    controller.schedule({ ...entry, id });
  }, [controller]);

  const pauseUndo = useCallback(() => {
    controller.pause();
  }, [controller]);

  const resumeUndo = useCallback(() => {
    controller.resume();
  }, [controller]);

  const takeUndoEntry = useCallback((undoId: string): UndoEntry | null => {
    return controller.take(undoId);
  }, [controller]);

  // 关面板、关页面时，撤回窗口里还没提交的审批立刻补发，不能丢
  const flushUndoQueue = useCallback((syncUi = true) => {
    const entries = controller.flush();
    if (entries.length === 0) return;
    if (syncUi) {
      queueMicrotask(() => setUndoList([]));
    }
    for (const entry of entries) {
      if (entry.source === "fulfillment_appeal") {
        sendKeepalive("/api/admin/fulfillment/appeal/handle", {
          appealId: entry.requestIds[0],
          decision: entry.action === "approved" ? "approve" : "reject",
          reason: entry.feedback || undefined,
        });
      } else {
        for (const requestId of entry.requestIds) {
          sendKeepalive("/api/exemptions/review", {
            request_id: requestId,
            action: entry.action,
            feedback: entry.feedback ?? null,
            dates: entry.dates,
          });
        }
      }
    }
  }, [controller]);

  useEffect(() => {
    const handleBeforeUnload = () => flushUndoQueue(false);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
      flushUndoQueue(false);
    };
  }, [flushUndoQueue]);

  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (wasOpenRef.current && !open) flushUndoQueue(true);
    wasOpenRef.current = open;
  }, [flushUndoQueue, open]);

  return {
    undoList,
    pauseUndo,
    resumeUndo,
    schedule,
    takeUndoEntry,
  };
}
