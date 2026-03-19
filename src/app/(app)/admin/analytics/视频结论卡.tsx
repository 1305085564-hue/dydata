"use client";

import { useMemo } from "react";
import { 生成视频结论卡结果 } from "./视频结论卡-计算";
import { 干预结论单卡, 视频结论单卡 } from "./视频结论卡-单卡";
import type { 视频结论卡Props } from "./视频结论卡-类型";

function VideoConclusionCards(props: 视频结论卡Props) {
  const result = useMemo(() => 生成视频结论卡结果(props), [props]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-[0.24em] text-slate-400 uppercase">Video Signals</p>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">本周关键结论</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <视频结论单卡 card={result.bestTopic} />
        <视频结论单卡 card={result.bestFormat} />
        <视频结论单卡 card={result.bestPublishHour} />
        <干预结论单卡 card={result.intervention} />
      </div>
    </section>
  );
}

export const 视频结论卡 = VideoConclusionCards;
