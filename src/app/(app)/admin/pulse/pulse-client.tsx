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

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* 顶部工具栏：日期选择。晨会只看昨日及更早（当天发布的作品当天没有数据回流），
          因此不提供「今日」入口，日期上限锁在昨日。 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="s"
          variant={date === yesterday ? "outline" : "ghost"}
          onClick={() => handleDateChange(yesterday)}
        >
          昨日
        </Button>
        <Input
          type="date"
          value={date}
          max={yesterday}
          aria-label="选择日期"
          onChange={(e) => handleDateChange(e.target.value)}
          className="min-h-[44px] sm:min-h-0 sm:h-7 w-36 rounded-md border-[#E2E2DF] bg-white px-2 text-[12px] shadow-input"
        />
      </div>

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
