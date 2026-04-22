"use client";

import type { 视频结论卡Props } from "./视频结论卡-类型";

export function 视频结论卡({ videos }: 视频结论卡Props) {
  return (
    <section className="rounded-[24px] border border-white/70 bg-white/82 p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Video Signals
          </p>
          <h2 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)]">本周经营洞察</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">当前仓库里的旧版结论卡文件损坏，这里先保留稳定可用入口。</p>
        </div>
        <div className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">
          基于 {videos.length} 条视频生成
        </div>
      </div>
    </section>
  );
}
