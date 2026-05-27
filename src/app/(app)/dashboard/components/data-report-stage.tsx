"use client";

import dynamic from "next/dynamic";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import type { ExemptionGrantLike, ExemptionProfileLike } from "@/lib/豁免";
import type { TodaySubmissionReportLike } from "../video-submit-panel-state";

const VideoSubmitPanel = dynamic(
  () => import("../video-submit-panel").then((module) => module.VideoSubmitPanel),
  {
    loading: () => <DataReportStageSkeleton />,
  },
);

interface DataReportStageProps {
  accounts: { id: string; name: string; display_name: string; content_direction: string | null }[];
  selectedAccountId: string;
  onSelectedAccountChange: (accountId: string) => void;
  activeBizDate: string;
  onActiveBizDateChange: (date: string) => void;
  userId: string;
  userDisplayName: string;
  today: string;
  todayReports: TodaySubmissionReportLike[];
  monthReports: Array<
    Omit<TodaySubmissionReportLike, "account_id"> & { id: string; account_id: string }
  >;
  history: Array<
    Omit<TodaySubmissionReportLike, "account_id"> & { id: string; account_id: string }
  >;
  accountIds: string[];
  ownContentDirections: string[];
  accountDisplayNameMap: Record<string, string>;
  hasPendingExemption: boolean;
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
  teamReviewRequests: DashboardPageData["teamReviewRequests"];
}

function DataReportStageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 bg-[var(--color-bg)] px-6 py-7 sm:px-8 sm:py-8">
        <div className="space-y-4">
          <div className="h-5 w-24 animate-pulse rounded-full bg-zinc-200" />
          <div className="h-9 w-48 animate-pulse rounded-xl bg-zinc-200" />
          <div className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
        </div>
      </div>
      <div className="space-y-5 px-5 py-6 sm:px-8 sm:py-8">
        <div className="h-12 w-40 animate-pulse rounded-xl bg-zinc-100" />
        <div className="h-[420px] animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    </div>
  );
}

/**
 * 数据报表阶段
 * 直接承载 VideoSubmitPanel，延后加载重表单与弹层逻辑，先让 dashboard 首屏更轻
 */
export function DataReportStage({
  accounts,
  selectedAccountId,
  onSelectedAccountChange,
  activeBizDate,
  onActiveBizDateChange,
  userId,
  userDisplayName,
  today,
  todayReports,
  monthReports,
  history,
  accountIds,
  ownContentDirections,
  accountDisplayNameMap,
  hasPendingExemption,
  userExemptionProfile,
  userExemptionGrants,
  teamReviewRequests,
}: DataReportStageProps) {
  return (
    <div>
      <VideoSubmitPanel
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectedAccountChange={onSelectedAccountChange}
        activeBizDate={activeBizDate}
        onActiveBizDateChange={onActiveBizDateChange}
        userId={userId}
        userDisplayName={userDisplayName}
        today={today}
        todayReports={todayReports}
        monthReports={monthReports}
        history={history}
        accountIds={accountIds}
        ownContentDirections={ownContentDirections}
        accountDisplayNameMap={accountDisplayNameMap}
        hasPendingExemption={hasPendingExemption}
        userExemptionProfile={userExemptionProfile}
        userExemptionGrants={userExemptionGrants}
        teamReviewRequests={teamReviewRequests}
        embeddedChrome
      />
    </div>
  );
}
