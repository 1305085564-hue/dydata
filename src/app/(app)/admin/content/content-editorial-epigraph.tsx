"use client";

import { useSyncExternalStore } from "react";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import { cn } from "@/lib/utils";

export const DEFAULT_CONTENT_EPIGRAPH =
  "每一支作品都是团队的落笔——于完播与互动的真实回响里，看清生长脉络。";

export interface ContentEpigraphSnapshot {
  isDefault: boolean;
  isEmpty: boolean;
  totalCount: number;
  excellentCount: number;
  goodCount: number;
  maxPlay: number;
  anomalyCount: number;
  isExcellentActive: boolean;
  isAnomalyActive: boolean;
}

export interface ContentEpigraphHandlers {
  onToggleExcellent?: () => void;
  onToggleAnomaly?: () => void;
}

export function formatCompactCount(val: number): string {
  if (val >= 100_000_000) {
    return `${(val / 100_000_000).toFixed(1).replace(/\.0$/, "")}亿`;
  }
  if (val >= 10_000) {
    return `${(val / 10_000).toFixed(1).replace(/\.0$/, "")}万`;
  }
  return String(Math.round(val));
}

export function summarizeContentEpigraph(
  rows: ProcessedContentRow[],
  options?: {
    anomalyCount?: number;
    isExcellentActive?: boolean;
    isAnomalyActive?: boolean;
  },
): ContentEpigraphSnapshot {
  let maxPlay = 0;
  let excellentCount = 0;
  let goodCount = 0;

  for (const row of rows) {
    if (typeof row.playCount === "number" && row.playCount > maxPlay) {
      maxPlay = row.playCount;
    }
    if (row.quality?.overallGrade === "优") {
      excellentCount += 1;
    } else if (row.quality?.overallGrade === "良") {
      goodCount += 1;
    }
  }

  return {
    isDefault: false,
    isEmpty: rows.length === 0,
    totalCount: rows.length,
    excellentCount,
    goodCount,
    maxPlay,
    anomalyCount: options?.anomalyCount ?? 0,
    isExcellentActive: Boolean(options?.isExcellentActive),
    isAnomalyActive: Boolean(options?.isAnomalyActive),
  };
}

export function buildContentEditorialEpigraph(
  rows: ProcessedContentRow[],
  options?: {
    anomalyCount?: number;
    isExcellentActive?: boolean;
    isAnomalyActive?: boolean;
  },
): string {
  const s = summarizeContentEpigraph(rows, options);
  if (s.isEmpty) {
    return "当前筛选下暂无作品记录——可切换上方日期或重置筛选条件查看其他作品。";
  }

  const gradeSummary = `优 ${s.excellentCount} 篇 · 良 ${s.goodCount} 篇`;
  const parts: string[] = [`收录 ${s.totalCount} 篇`, gradeSummary];
  if (s.maxPlay > 0) {
    parts.push(`榜首 ${formatCompactCount(s.maxPlay)}`);
  }
  const base = `每一支作品都是团队的落笔——${parts.join("，")}`;
  return s.anomalyCount > 0 ? `${base} · 异常 ${s.anomalyCount} 篇。` : `${base}。`;
}

const DEFAULT_SNAPSHOT: ContentEpigraphSnapshot = {
  isDefault: true,
  isEmpty: false,
  totalCount: 0,
  excellentCount: 0,
  goodCount: 0,
  maxPlay: 0,
  anomalyCount: 0,
  isExcellentActive: false,
  isAnomalyActive: false,
};

let currentSnapshot: ContentEpigraphSnapshot = DEFAULT_SNAPSHOT;
let currentHandlers: ContentEpigraphHandlers = {};
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export function setContentEditorialEpigraphState(
  nextSnapshot: ContentEpigraphSnapshot,
  handlers: ContentEpigraphHandlers = {},
) {
  currentHandlers = handlers;
  if (
    currentSnapshot.isDefault === nextSnapshot.isDefault &&
    currentSnapshot.isEmpty === nextSnapshot.isEmpty &&
    currentSnapshot.totalCount === nextSnapshot.totalCount &&
    currentSnapshot.excellentCount === nextSnapshot.excellentCount &&
    currentSnapshot.goodCount === nextSnapshot.goodCount &&
    currentSnapshot.maxPlay === nextSnapshot.maxPlay &&
    currentSnapshot.anomalyCount === nextSnapshot.anomalyCount &&
    currentSnapshot.isExcellentActive === nextSnapshot.isExcellentActive &&
    currentSnapshot.isAnomalyActive === nextSnapshot.isAnomalyActive
  ) {
    return;
  }
  currentSnapshot = nextSnapshot;
  notifyListeners();
}

export function resetContentEditorialEpigraph() {
  currentHandlers = {};
  if (currentSnapshot === DEFAULT_SNAPSHOT) return;
  currentSnapshot = DEFAULT_SNAPSHOT;
  notifyListeners();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentSnapshot;
}

function getServerSnapshot() {
  return DEFAULT_SNAPSHOT;
}

export function ContentEditorialEpigraph() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const canFilterExcellent = Boolean(currentHandlers.onToggleExcellent) && (s.excellentCount > 0 || s.isExcellentActive);
  const canFilterAnomaly = Boolean(currentHandlers.onToggleAnomaly) && (s.anomalyCount > 0 || s.isAnomalyActive);

  return (
    <span className="inline-flex items-center gap-1 text-[#78716C] max-w-full flex-wrap">
      {/* 有机人文微印记：「落笔与回响」水波柔弧（14px 有机手绘几何，非固定 ✦ 字符） */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 select-none"
        aria-hidden="true"
      >
        <circle cx="5.2" cy="8.2" r="2.1" fill="#D97757" fillOpacity="0.88" />
        <path
          d="M8.8 4.4C10.9 5.5 11.4 10.1 8.6 11.8"
          stroke="#78716C"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <path
          d="M11.6 2.8C14.5 4.8 14.8 10.9 11.4 13.2"
          stroke="#A8A29E"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
      </svg>

      {s.isDefault ? (
        <span className="truncate">{DEFAULT_CONTENT_EPIGRAPH}</span>
      ) : s.isEmpty ? (
        <span className="truncate">当前筛选下暂无作品记录——可切换上方日期或重置筛选条件查看其他作品。</span>
      ) : (
        <span className="inline-flex items-center flex-wrap gap-x-0.5 tabular-nums">
          <span>每一支作品都是团队的落笔——收录 {s.totalCount} 篇，</span>
          {canFilterExcellent ? (
            <button
              type="button"
              onClick={() => currentHandlers.onToggleExcellent?.()}
              aria-pressed={s.isExcellentActive}
              title={s.isExcellentActive ? "点击取消仅看优作品" : "点击仅看综合评级为优的作品"}
              className={cn(
                "inline-flex items-center rounded-md px-1 transition-colors cursor-pointer",
                s.isExcellentActive
                  ? "bg-[#F1F1F0] text-[#141413] underline decoration-[#7E5C99]/60 underline-offset-2"
                  : "text-[#1F1E1D] underline decoration-[#E2E2DF] underline-offset-2 hover:bg-[#EBEBE9] hover:text-[#141413]",
              )}
            >
              优 {s.excellentCount} 篇
            </button>
          ) : (
            <span>优 {s.excellentCount} 篇</span>
          )}
          <span> · 良 {s.goodCount} 篇</span>
          {s.maxPlay > 0 ? <span>，榜首 {formatCompactCount(s.maxPlay)}</span> : null}
          {(s.anomalyCount > 0 || s.isAnomalyActive) ? (
            <>
              <span> · </span>
              {canFilterAnomaly ? (
                <button
                  type="button"
                  onClick={() => currentHandlers.onToggleAnomaly?.()}
                  aria-pressed={s.isAnomalyActive}
                  title={s.isAnomalyActive ? "点击取消仅看异常" : "点击仅看异常作品"}
                  className={cn(
                    "inline-flex items-center rounded-md px-1 transition-colors cursor-pointer",
                    s.isAnomalyActive
                      ? "bg-status-danger/10 text-status-danger"
                      : "text-[#1F1E1D] underline decoration-[#E2E2DF] underline-offset-2 hover:bg-[#EBEBE9] hover:text-[#141413]",
                  )}
                >
                  异常 {s.anomalyCount} 篇
                </button>
              ) : (
                <span>异常 {s.anomalyCount} 篇</span>
              )}
            </>
          ) : null}
          <span>。</span>
        </span>
      )}
    </span>
  );
}
