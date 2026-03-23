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
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-[0.24em] text-slate-400 uppercase">Video Signals</p>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">本周关键结论</h2>
      </div>

      {insufficient ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              数据不足（未满10篇）
            </span>
          </div>
          <p className="text-sm leading-relaxed text-slate-400 italic">{EXAMPLE_TEXT}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
