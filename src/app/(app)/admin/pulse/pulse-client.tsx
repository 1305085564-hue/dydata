"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VideoMetricsSnapshot } from "@/types";
import type { WorkContentQuality } from "@/lib/collaboration/content-quality-contract";
import {
  type PulseCap,
  type PulseMemberRow,
  type PulseSummary,
  type PulseVideoRow,
} from "./pulse-filters";
import { PulseBarometer } from "./pulse-barometer";
import { PulseMemberTable } from "./pulse-member-table";
import { PulseVideoList } from "./pulse-video-list";

interface PulseClientProps {
  date: string;
  yesterday: string;
  today: string;
  initialCap: PulseCap;
  summary: PulseSummary;
  members: PulseMemberRow[];
  dayVideos: PulseVideoRow[];
  snapshots: VideoMetricsSnapshot[];
  contentQualityByVideoId: Record<string, WorkContentQuality>;
}

export function PulseClient({
  date,
  yesterday,
  today,
  initialCap,
  summary,
  members,
  dayVideos,
  snapshots,
  contentQualityByVideoId,
}: PulseClientProps) {
  const router = useRouter();
  const [cap, setCap] = useState<PulseCap>(initialCap);

  const snapshotByVideoId = useMemo(() => {
    return new Map(snapshots.map((s) => [s.video_id, s]));
  }, [snapshots]);

  const handleDateChange = (newDate: string) => {
    if (!newDate || newDate === date) return;
    const params = new URLSearchParams(window.location.search);
    if (newDate === yesterday) {
      params.delete("date");
    } else {
      params.set("date", newDate);
    }
    const query = params.toString();
    router.replace(`/admin/pulse${query ? `?${query}` : ""}`);
  };

  const handleCapChange = (newCap: PulseCap) => {
    setCap(newCap);
    const params = new URLSearchParams(window.location.search);
    if (newCap === "all") {
      params.delete("cap");
    } else {
      params.set("cap", newCap);
    }
    const query = params.toString();
    const nextUrl = `/admin/pulse${query ? `?${query}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  };

  const isToday = date === today;

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* 顶部工具栏：日期选择 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="s"
          variant={date === yesterday ? "outline" : "ghost"}
          onClick={() => handleDateChange(yesterday)}
        >
          昨日
        </Button>
        <Button
          size="s"
          variant={date === today ? "outline" : "ghost"}
          onClick={() => handleDateChange(today)}
        >
          今日
        </Button>
        <Input
          type="date"
          value={date}
          max={today}
          aria-label="选择日期"
          onChange={(e) => handleDateChange(e.target.value)}
          className="min-h-[44px] sm:min-h-0 sm:h-7 w-36 rounded-md border-[#E2E2DF] bg-white px-2 text-[12px] shadow-input"
        />
      </div>

      {/* 今日黄条提示 */}
      {isToday && (
        <div
          role="status"
          className="w-full rounded-md bg-[#B98A54]/8 px-3 py-2 text-[12px] text-[#B98A54]"
        >
          今日数据回流中，仅供预览，不参与涨跌结论。
        </div>
      )}

      {/* 晴雨表 */}
      <PulseBarometer summary={summary} />

      {/* 人员日战报 */}
      <PulseMemberTable
        members={members}
        snapshotByVideoId={snapshotByVideoId}
        contentQualityByVideoId={contentQualityByVideoId}
      />

      {/* 红黑胶囊与作品列表 */}
      <PulseVideoList
        date={date}
        selectedCap={cap}
        onSelectCap={handleCapChange}
        dayVideos={dayVideos}
        snapshotByVideoId={snapshotByVideoId}
        contentQualityByVideoId={contentQualityByVideoId}
      />
    </div>
  );
}
