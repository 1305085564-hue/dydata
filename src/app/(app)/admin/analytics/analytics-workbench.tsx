"use client";

import { useMemo, useState } from "react";
import type { VideoMetricsSnapshot, VideoTag } from "@/types";
import type { AnalyticsSection } from "./analytics-sections";
import { AnalyticsSections } from "./analytics-sections";
import { HitAnalyzer } from "./hit-analyzer";
import { PersonnelAnalysis } from "./personnel-analysis";
import { TimeAnalysis } from "./time-analysis";
import { AiInsight } from "./ai-insight";
import type { AnalyticsVideoRow } from "./视频结论卡-类型";
import { FollowerConvertTrend } from "./follower-convert-trend";
import { Button } from "@/components/ui/button";

interface ReportRow {
  id: string;
  submitter: string;
  title: string | null;
  report_date: string;
  play_count: number | null;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  content?: string | null;
  published_at?: string | null;
  uploaded_at?: string;
  cover_url?: string | null;
}

interface AnalyticsWorkbenchProps {
  userId: string;
  isPrivilegedUser: boolean;
  filteredReports: ReportRow[];
  filteredVideos: AnalyticsVideoRow[];
  filteredSnapshots: VideoMetricsSnapshot[];
  filteredVideoTags: VideoTag[];
  submitters: string[];
}

export function AnalyticsWorkbench({
  userId,
  isPrivilegedUser,
  filteredReports,
  submitters,
}: AnalyticsWorkbenchProps) {
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [lockedSubmitter, setLockedSubmitter] = useState<string | null>(null);

  const scopedReports = useMemo(
    () => (lockedSubmitter ? filteredReports.filter((report) => report.submitter === lockedSubmitter) : filteredReports),
    [filteredReports, lockedSubmitter],
  );

  const scopedReportsForTimeAnalysis = useMemo(
    () =>
      scopedReports.map((report) => ({
        ...report,
        follower_gain: report.follower_gain ?? 0,
        follower_convert: report.follower_convert ?? 0,
      })),
    [scopedReports],
  );

  function focusSection(sectionId: string, submitter?: string | null) {
    if (typeof submitter === "string") {
      setLockedSubmitter(submitter);
    }
    setFocusedSectionId(sectionId);
  }

  const sections: AnalyticsSection[] = [
    ...(isPrivilegedUser
      ? [
          {
            id: "follower-convert-trend",
            title: "导粉趋势",
            content: <FollowerConvertTrend reports={scopedReports} />,
          },
        ]
      : []),
    {
      id: "hit-analyzer",
      title: "爆款分析器",
      content: (
        <HitAnalyzer
          reports={scopedReports}
          submitters={submitters}
          lockedSubmitter={lockedSubmitter}
          onLockedSubmitterChange={setLockedSubmitter}
        />
      ),
    },
    {
      id: "personnel-analysis",
      title: isPrivilegedUser ? "人员深度分析" : "我的表现分析",
      content: (
        <PersonnelAnalysis
          reports={filteredReports}
          title={isPrivilegedUser ? "团队成员表现" : "仅展示我的个人数据"}
          activePersonName={lockedSubmitter}
          onSelectPerson={(name) => focusSection("hit-analyzer", name)}
        />
      ),
    },
    {
      id: "time-analysis",
      title: "时间维度分析",
      content: <TimeAnalysis reports={scopedReportsForTimeAnalysis} />,
    },
    {
      id: "ai-insight",
      title: "AI 洞察",
      content: <AiInsight scopeEntityId={userId} />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-3">

        {lockedSubmitter ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 border-l-[2px] border-l-[#D97757] bg-zinc-50 px-3 py-2 text-[12px] text-zinc-600">
            <span className="font-medium">当前已锁定成员：</span>
            <span className="rounded-[10px] bg-white px-3 py-1 font-medium text-zinc-800">{lockedSubmitter}</span>
            <span className="text-zinc-500">下方爆款分析、时间分析和结论卡都已同步切到该成员样本。</span>
            <Button type="button" variant="outline" size="sm" className="bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50" onClick={() => setLockedSubmitter(null)}>
              清除联动
            </Button>
          </div>
        ) : null}
      </div>

      <AnalyticsSections sections={sections} focusSectionId={focusedSectionId} />
    </div>
  );
}
