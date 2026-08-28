"use client";

import { ProductionControlSystem } from "./production-control-system";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import type { ExemptionGrantLike, ExemptionProfileLike } from "@/lib/豁免";
import type { TodaySubmissionReportLike } from "./video-submit-panel-state";

type MonthReport = Omit<TodaySubmissionReportLike, "account_id"> & {
  id: string;
  account_id: string;
};

interface DashboardContentProps {
  today: string;
  userDisplayName: string;
  accounts: { id: string; name: string; display_name: string; content_direction: string | null }[];
  userId: string;
  hasActiveTeamMembership: boolean;
  todayReports: TodaySubmissionReportLike[];
  monthSubmittedDates: string[];
  monthReports: MonthReport[];
  history: MonthReport[];
  accountIds: string[];
  accountDisplayNameMap: Record<string, string>;
  hasPendingExemption?: boolean;
  userExemptionReviewNotice: DashboardPageData["userExemptionReviewNotice"];
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
}

export function DashboardContent(props: DashboardContentProps) {
  if (!props.hasActiveTeamMembership) {
    return null;
  }

  return <ProductionControlSystem {...props} />;
}
