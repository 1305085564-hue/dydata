"use client";

import { useSyncExternalStore } from "react";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";

export const DEFAULT_CONTENT_EPIGRAPH =
  "每一支作品都是团队的落笔——于完播与互动的真实回响里，看清生长脉络。";

export function formatCompactCount(val: number): string {
  if (val >= 100_000_000) {
    return `${(val / 100_000_000).toFixed(1).replace(/\.0$/, "")}亿`;
  }
  if (val >= 10_000) {
    return `${(val / 10_000).toFixed(1).replace(/\.0$/, "")}万`;
  }
  return String(Math.round(val));
}

export function buildContentEditorialEpigraph(rows: ProcessedContentRow[]): string {
  if (rows.length === 0) {
    return "这一刻案头尚无落笔记录——可切换上方日期或放宽筛选，寻回其他时刻的作品回响。";
  }

  let maxPlay = 0;
  const healthyCompletions: number[] = [];

  for (const row of rows) {
    if (typeof row.playCount === "number" && row.playCount > maxPlay) {
      maxPlay = row.playCount;
    }
    if (
      !row.lowSample &&
      typeof row.completionRate === "number" &&
      Number.isFinite(row.completionRate) &&
      row.completionRate > 0 &&
      row.completionRate <= 100
    ) {
      healthyCompletions.push(row.completionRate);
    }
  }

  healthyCompletions.sort((a, b) => a - b);
  const mid = Math.floor(healthyCompletions.length / 2);
  const medianCompletion =
    healthyCompletions.length === 0
      ? null
      : healthyCompletions.length % 2 === 1
        ? healthyCompletions[mid]!
        : (healthyCompletions[mid - 1]! + healthyCompletions[mid]!) / 2;

  const parts: string[] = [`收录 ${rows.length} 篇`];
  if (maxPlay > 0) {
    parts.push(`榜首 ${formatCompactCount(maxPlay)}`);
  }
  if (medianCompletion !== null) {
    parts.push(`完播中位 ${medianCompletion.toFixed(1)}%`);
  }

  return `每一支作品都是团队的落笔——${parts.join("，")}，于真实回响里校准方向。`;
}

let currentEpigraph = DEFAULT_CONTENT_EPIGRAPH;
const listeners = new Set<() => void>();

export function setContentEditorialEpigraph(nextText: string) {
  if (currentEpigraph === nextText) return;
  currentEpigraph = nextText;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentEpigraph;
}

function getServerSnapshot() {
  return DEFAULT_CONTENT_EPIGRAPH;
}

export function ContentEditorialEpigraph() {
  const text = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <span className="inline-flex items-center gap-1 text-[#78716C] max-w-full">
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
      <span className="truncate">{text}</span>
    </span>
  );
}
