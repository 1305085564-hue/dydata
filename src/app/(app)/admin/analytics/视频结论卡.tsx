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
    <section className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-white/65 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[var(--color-text-tertiary)] uppercase">Video Signals</p>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">本周关键结论</h2>
          <p className="text-sm leading-6 text-[var(--color-text-secondary)]">先看最值得执行的信号，再深入到话题、形式、发布时间和干预对象。</p>
        </div>
        {!insufficient ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/88 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)]">
            <span className="size-1.5 rounded-full bg-[var(--color-primary)]" aria-hidden />
            <span className="font-medium text-[var(--color-text-primary)]">样本满足结论条件</span>
            <span>{props.videos.length} 条视频</span>
          </div>
        ) : null}
      </div>

      {insufficient ? (
        <div className="space-y-3 rounded-[22px] border border-dashed border-slate-200 bg-[linear-gradient(145deg,rgba(248,250,252,0.9),rgba(241,245,249,0.7))] p-6">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              数据不足（未满10篇）
            </span>
          </div>
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] italic">{EXAMPLE_TEXT}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <视频结论单卡 card={result.bestTopic} />
          <视频结论单卡 card={result.bestFormat} />
          <视频结论单卡 card={result.bestPublishHour} />
          <干预结论单卡 card={result.intervention} />
        </div>
      )}
    </section>
  );
}

export const 视频结论卡 = VideoConclusionCards;
