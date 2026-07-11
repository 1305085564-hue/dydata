"use client";

import type { 视频结论卡Props } from "./视频结论卡-类型";

export function 视频结论卡({ videos }: 视频结论卡Props) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-[12px] tracking-[0.12em] text-stone-500">
            Video Signals
          </p>
          <h2 className="text-[18px] font-medium tracking-tight text-stone-900">本周经营洞察</h2>
          <p className="text-[13px] leading-[1.7] text-stone-500">当前仓库里的旧版结论卡文件损坏，这里先保留稳定可用入口。</p>
        </div>
        <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[12px] text-stone-500">
          基于 {videos.length} 条视频生成
        </div>
      </div>
    </section>
  );
}
