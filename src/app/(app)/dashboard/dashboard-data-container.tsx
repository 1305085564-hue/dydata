import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDashboardPageData } from "@/lib/loaders/dashboard-page";
import { measureAsync } from "@/lib/perf";
import { DashboardContent } from "./dashboard-content";
import { DashboardAnimatedSection } from "./dashboard-animated-section";
import { loadPendingVideoReviewTickets, type VideoReviewTicket } from "@/lib/video-review-tickets";

export async function DashboardDataContainer() {
  const { supabase, user } = await getCurrentUserContext();
  if (!user) redirect("/login");

  const data = await measureAsync("dashboard.pageData", () =>
    loadDashboardPageData({
      supabase,
      userId: user.id,
      adminSupabase: createAdminClient(),
    }),
  );

  let reviewTickets: VideoReviewTicket[] = [];
  let reviewTicketsError: string | null = null;
  try {
    reviewTickets = await loadPendingVideoReviewTickets(createAdminClient(), user.id);
  } catch {
    reviewTicketsError = "复盘待办暂不可用，请联系管理员检查工单服务";
  }

  return (
    <DashboardAnimatedSection index={0}>
      <DashboardContent
        today={data.today}
        userDisplayName={data.userDisplayName}
        hasActiveTeamMembership={data.hasActiveTeamMembership}
        accounts={data.accounts}
        reviewTickets={reviewTickets}
        reviewTicketsError={reviewTicketsError}
        userId={data.userId}
        todayReports={data.todayReports}
        monthSubmittedDates={data.monthSubmittedDates}
        monthReports={data.monthReports}
        history={data.history}
        accountIds={data.accountIds}
        accountDisplayNameMap={data.accountDisplayNameMap}
        hasPendingExemption={data.hasPendingExemption}
        pendingExemptionDates={data.pendingExemptionDates}
        absentDates={data.absentDates}
        absentReasons={data.absentReasons}
        userExemptionReviewNotice={data.userExemptionReviewNotice}
        userExemptionProfile={data.userExemptionProfile}
        userExemptionGrants={data.userExemptionGrants}
      />
    </DashboardAnimatedSection>
  );
}
