import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import type {
  ExemptionGrantLike,
  ExemptionProfileLike,
} from "@/lib/豁免";
import type { VideoSubmissionEditDetail } from "@/app/(app)/dashboard/video-submit-form-state";
import type { TodaySubmissionReportLike } from "@/lib/dashboard-submission-state";

export type MonthReport = Omit<TodaySubmissionReportLike, "account_id"> & {
  id: string;
  account_id: string;
};

export type AsyncActivityData = {
  history: MonthReport[];
};

export type ActivityRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type EditDetailLoadState =
  | { status: "idle" | "loading"; detail: null; error: null }
  | { status: "ready"; detail: VideoSubmissionEditDetail; error: null }
  | { status: "error"; detail: null; error: string };
export interface VideoSubmitPanelV2Props {
  accounts: { id: string; name: string; display_name: string; content_direction: string | null }[];
  userId: string;
  userDisplayName: string;
  today: string;
  todayReports: TodaySubmissionReportLike[];
  monthSubmittedDates?: string[];
  monthReports: MonthReport[];
  history: MonthReport[];
  accountIds: string[];
  accountDisplayNameMap: Record<string, string>;
  hasPendingExemption?: boolean;
  pendingExemptionDates?: string[];
  userExemptionReviewNotice?: DashboardPageData["userExemptionReviewNotice"];
  userExemptionProfile: ExemptionProfileLike;
  userExemptionGrants: ExemptionGrantLike[];
  embeddedChrome?: boolean;
  selectedAccountId?: string;
  onSelectedAccountChange?: (accountId: string) => void;
  activeBizDate?: string;
  onActiveBizDateChange?: (date: string) => void;
  initialTopicId?: string | null;
  initialTopicTitle?: string | null;
}
