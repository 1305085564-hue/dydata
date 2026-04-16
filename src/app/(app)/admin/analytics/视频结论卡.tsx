"use client";

import { useMemo } from "react";
import { 生成视频结论卡结果 } from "./视频结论卡-计算";
import { 干预结论单卡, 视频结论单卡 } from "./视频结论卡-单卡";
import type { 视频结论卡Props } from "./视频结论卡-类型";

const EXAMPLE_TEXT =
  '【示范参考】本周团队共发布42条视频，平均播放量8.3万。爆款率23%，较上周提升5个百分点。话题"大盘复盘"表现最佳，平均播放12.1万。建议本周继续围绕市场热点创作。';

function VideoConclusionCards(props: 视频结论卡Props) {
  const result = useMemo(() => 生成视频结论卡结果(props), [props]);
  const insufficient = props.videos.length < 10;

  return (
    <section className="relative space-y-6">
      <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[var(--color-primary)] uppercase">Video Signals</p>
          <h2 className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">本周经营洞察</h2>
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">快速定位最值得执行的增长信号与需干预风险。</p>
        </div>
        {!insufficient ? (
          <div className="inline-flex items-center gap-2.5 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-sm shadow-[var(--shadow-light)] backdrop-blur-md">
            <div className="relative flex size-2.5 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-primary)] opacity-40"></span>
              <span className="relative inline-flex size-1.5 rounded-full bg-[var(--color-primary)]"></span>
            </div>
            <span className="font-semibold text-[var(--color-text-primary)]">基于 {props.videos.length} 条视频生成</span>
          </div>
        ) : null}
      </div>

      {insufficient ? (
        <div className="relative overflow-hidden rounded-[24px] border border-dashed border-slate-300/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(248,250,252,0.7))] p-8 shadow-sm">
          <div className="relative z-10 flex items-center gap-3 mb-4">
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 shadow-sm">
              数据不足（未满10篇）
            </span>
          </div>
          <p className="relative z-10 text-base leading-relaxed text-[var(--color-text-secondary)] italic">{EXAMPLE_TEXT}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4 md:grid-rows-2 xl:grid-rows-1">
          <视频结论单卡 card={result.bestTopic} className="md:col-span-1 xl:col-span-1" />
          <视频结论单卡 card={result.bestFormat} className="md:col-span-1 xl:col-span-1" />
          <视频结论单卡 card={result.bestPublishHour} className="md:col-span-1 xl:col-span-1" />
          <干预结论单卡 card={result.intervention} className="md:col-span-1 xl:col-span-1" />
        </div>
      )}
    </section>
  );
}

export const 视频结论卡 = VideoConclusionCards;
