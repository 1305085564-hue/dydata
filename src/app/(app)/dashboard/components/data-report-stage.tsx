"use client";

import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import type { ExemptionGrantLike, ExemptionProfileLike } from "@/lib/豁免";
import { VideoSubmitPanel } from "../video-submit-panel";
import type { TodaySubmissionReportLike } from "../video-submit-panel-state";

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
  userExemptionReviewNotice: DashboardPageData["userExemptionReviewNotice"];
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
  teamReviewRequests: DashboardPageData["teamReviewRequests"];
}

/**
 * 数据报表阶段
 * 直接承载 VideoSubmitPanel，样式由面板内部管控
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
  userExemptionReviewNotice,
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
        userExemptionReviewNotice={userExemptionReviewNotice}
        userExemptionProfile={userExemptionProfile}
        userExemptionGrants={userExemptionGrants}
        teamReviewRequests={teamReviewRequests}
        embeddedChrome
      />
    </div>
  );
}
