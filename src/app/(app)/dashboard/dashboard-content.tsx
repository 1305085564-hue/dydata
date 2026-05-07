"use client";

import { ProductionControlSystem } from "./production-control-system";
import type { SopMemberStatus, UserRole } from "@/types";
import type { ExemptionGrantLike, ExemptionProfileLike } from "@/lib/豁免";
import type { TodaySubmissionReportLike } from "./video-submit-panel-state";

type MonthReport = Omit<TodaySubmissionReportLike, "account_id"> & {
  id: string;
  account_id: string;
};

interface DashboardContentProps {
  initialMine: SopMemberStatus | null;
  initialMatrix: SopMemberStatus[];
  today: string;
  userDisplayName: string;
  userRole: UserRole;
  accounts: { id: string; name: string; display_name: string; content_direction: string | null }[];
  userId: string;
  todayReports: TodaySubmissionReportLike[];
  monthReports: MonthReport[];
  history: MonthReport[];
  accountIds: string[];
  ownContentDirections: string[];
  accountDisplayNameMap: Record<string, string>;
  hasPendingExemption?: boolean;
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
}

export function DashboardContent(props: DashboardContentProps) {
  return <ProductionControlSystem {...props} />;
}
