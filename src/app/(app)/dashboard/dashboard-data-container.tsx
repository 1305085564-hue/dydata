import { createClient } from "@/lib/supabase/server";
import { loadDashboardPageData } from "@/lib/loaders/dashboard-page";
import { measureAsync } from "@/lib/perf";
import { DashboardContent } from "./dashboard-content";
import { DashboardAnimatedSection } from "./dashboard-animated-section";
import type { UserRole } from "@/types";

interface DashboardDataContainerProps {
  userId: string;
  userRole: UserRole;
}

export async function DashboardDataContainer({
  userId,
  userRole,
}: DashboardDataContainerProps) {
  const supabase = await createClient();

  const data = await measureAsync("dashboard.pageData", () =>
    loadDashboardPageData({
      supabase,
      userId,
    }),
  );

  return (
    <DashboardAnimatedSection index={0}>
      <DashboardContent
        today={data.today}
        userDisplayName={data.userDisplayName}
        userRole={userRole}
        accounts={data.accounts}
        userId={data.userId}
        todayReports={data.todayReports}
        monthReports={data.monthReports}
        history={data.history}
        accountIds={data.accountIds}
        ownContentDirections={data.ownContentDirections}
        accountDisplayNameMap={data.accountDisplayNameMap}
        hasPendingExemption={data.hasPendingExemption}
        userExemptionReviewNotice={data.userExemptionReviewNotice}
        userExemptionProfile={data.userExemptionProfile}
        userExemptionGrants={data.userExemptionGrants}
        teamReviewRequests={data.teamReviewRequests}
      />
    </DashboardAnimatedSection>
  );
}
