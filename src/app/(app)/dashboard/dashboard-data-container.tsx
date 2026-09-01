import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { loadDashboardPageData } from "@/lib/loaders/dashboard-page";
import { measureAsync } from "@/lib/perf";
import { DashboardContent } from "./dashboard-content";
import { DashboardAnimatedSection } from "./dashboard-animated-section";

export async function DashboardDataContainer() {
  const { supabase, user } = await getCurrentUserContext();
  if (!user) redirect("/login");

  const data = await measureAsync("dashboard.pageData", () =>
    loadDashboardPageData({
      supabase,
      userId: user.id,
    }),
  );

  return (
    <DashboardAnimatedSection index={0}>
      <DashboardContent
        today={data.today}
        userDisplayName={data.userDisplayName}
        hasActiveTeamMembership={data.hasActiveTeamMembership}
        accounts={data.accounts}
        userId={data.userId}
        todayReports={data.todayReports}
        monthSubmittedDates={data.monthSubmittedDates}
        monthReports={data.monthReports}
        history={data.history}
        accountIds={data.accountIds}
        accountDisplayNameMap={data.accountDisplayNameMap}
        hasPendingExemption={data.hasPendingExemption}
        pendingExemptionDates={data.pendingExemptionDates}
        userExemptionReviewNotice={data.userExemptionReviewNotice}
        userExemptionProfile={data.userExemptionProfile}
        userExemptionGrants={data.userExemptionGrants}
      />
    </DashboardAnimatedSection>
  );
}
