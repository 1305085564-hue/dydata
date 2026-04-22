"use client";

import { useMemo, useState } from "react";
import type { VideoMetricsSnapshot, VideoTag } from "@/types";
import type { AnalyticsSection } from "./analytics-sections";
import { AnalyticsSections } from "./analytics-sections";
import { HitAnalyzer } from "./hit-analyzer";
import { PersonnelAnalysis } from "./personnel-analysis";
import { TimeAnalysis } from "./time-analysis";
import { AiInsight } from "./ai-insight";
import { 视频结论卡 } from "./视频结论卡";
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

type AnalyticsSectionTarget = "hit-analyzer" | "personnel-analysis" | "time-analysis";

export function AnalyticsWorkbench({
  userId,
  isPrivilegedUser,
  filteredReports,
  filteredVideos,
  filteredSnapshots,
  filteredVideoTags,
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

  const scopedVideos = useMemo(
    () =>
      lockedSubmitter
        ? filteredVideos.filter((video) => (video.profiles?.name ?? "") === lockedSubmitter)
        : filteredVideos,
    [filteredVideos, lockedSubmitter],
  );

  const scopedVideoIds = useMemo(() => new Set(scopedVideos.map((video) => video.id)), [scopedVideos]);

  const scopedSnapshots = useMemo(
    () => filteredSnapshots.filter((snapshot) => scopedVideoIds.has(snapshot.video_id)),
    [filteredSnapshots, scopedVideoIds],
  );

  const scopedVideoTags = useMemo(
    () => filteredVideoTags.filter((tag) => scopedVideoIds.has(tag.video_id)),
    [filteredVideoTags, scopedVideoIds],
  );

  function focusSection(sectionId: string, submitter?: string | null) {
    if (typeof submitter === "string") {
      setLockedSubmitter(submitter);
    }
    setFocusedSectionId(sectionId);
  }

  function handleConclusionNavigate(target: AnalyticsSectionTarget, submitter?: string | null) {
    focusSection(target, submitter);
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
    <div className="space-y-8">
      <div className="space-y-6">
        <视频结论卡
          videos={scopedVideos as AnalyticsVideoRow[]}
          snapshots={scopedSnapshots}
          videoTags={scopedVideoTags}
          onNavigate={handleConclusionNavigate}
        />

        {lockedSubmitter ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
            <span className="font-medium">当前已锁定成员：</span>
            <span className="rounded-full bg-white/90 px-3 py-1 font-semibold text-blue-700">{lockedSubmitter}</span>
            <span className="text-blue-700/80">下方爆款分析、时间分析和结论卡都已同步切到该成员样本。</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setLockedSubmitter(null)}>
              清除联动
            </Button>
          </div>
        ) : null}
      </div>

      <AnalyticsSections sections={sections} focusSectionId={focusedSectionId} />
    </div>
  );
}
