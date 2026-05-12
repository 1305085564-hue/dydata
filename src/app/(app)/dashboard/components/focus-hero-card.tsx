"use client";

import { useMemo } from "react";

import type { TodaySubmissionReportLike } from "../video-submit-panel-state";
import { ProfileEditDialog } from "@/components/profile-edit-dialog";

interface FocusHeroCardProps {
  todayReports: TodaySubmissionReportLike[];
  totalAccounts: number;
  userDisplayName: string;
  userRole: string;
  today: string;
}

function formatPlayCount(value: number) {
  if (value >= 100_000_000) return { num: (value / 100_000_000).toFixed(1), unit: "亿" };
  if (value >= 10_000) return { num: (value / 10_000).toFixed(1), unit: "万" };
  return { num: value.toLocaleString("zh-CN"), unit: "" };
}

function sumField(
  reports: TodaySubmissionReportLike[],
  key: "play_count" | "likes" | "comments" | "shares" | "favorites" | "follower_gain" | "follower_convert",
) {
  return reports.reduce((total, report) => total + (report[key] ?? 0), 0);
}

export function FocusHeroCard({
  todayReports,
  totalAccounts,
  userDisplayName,
  userRole,
  today,
}: FocusHeroCardProps) {
  const stats = useMemo(() => {
    const submittedAccountIds = new Set(
      todayReports.map((report) => report.account_id).filter((id): id is string => Boolean(id)),
    );
    return {
      totalPlay: sumField(todayReports, "play_count"),
      followerGain: sumField(todayReports, "follower_gain"),
      followerConvert: sumField(todayReports, "follower_convert"),
      engagement:
        sumField(todayReports, "likes") +
        sumField(todayReports, "comments") +
        sumField(todayReports, "shares") +
        sumField(todayReports, "favorites"),
      submittedAccounts: submittedAccountIds.size,
    };
  }, [todayReports]);

  const hasData = todayReports.length > 0 && stats.totalPlay > 0;
  const { num, unit } = hasData ? formatPlayCount(stats.totalPlay) : { num: "—", unit: "" };

  return (
    <div className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#D97757] bg-white px-8 py-8">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
            <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-[#D97757]">
              Daily Focus
            </p>
            <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
              {today}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <h2 className="line-clamp-1 text-[18px] font-medium tracking-tight text-zinc-800">
              {userDisplayName} · 今日节奏
            </h2>
            <ProfileEditDialog currentName={userDisplayName} role={userRole} />
          </div>
          <p className="mt-1 text-[12px] text-zinc-400 font-mono tabular-nums">
            {hasData
              ? `已填报 ${stats.submittedAccounts} / ${totalAccounts} 个账号`
              : "今日首次填报后点亮"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-1.5">
            <span className="text-[32px] font-semibold font-mono tabular-nums leading-none text-zinc-800">
              {num}
            </span>
            {unit ? (
              <span className="text-[12px] font-normal text-zinc-400">{unit}</span>
            ) : null}
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
            Play Count
          </p>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-6 border-t border-zinc-100 pt-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
            转粉
          </p>
          <p className="mt-1.5 text-[13px] font-medium font-mono tabular-nums text-zinc-800">
            {hasData ? stats.followerConvert.toLocaleString("zh-CN") : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
            涨粉
          </p>
          <p className="mt-1.5 text-[13px] font-medium font-mono tabular-nums text-zinc-800">
            {hasData ? stats.followerGain.toLocaleString("zh-CN") : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
            互动总量
          </p>
          <p className="mt-1.5 text-[13px] font-medium font-mono tabular-nums text-zinc-800">
            {hasData ? stats.engagement.toLocaleString("zh-CN") : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
