import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { DashboardAnimatedSection } from "./dashboard-animated-section";
import { loadDashboardPageData } from "@/lib/loaders/dashboard-page";
import { measureAsync } from "@/lib/perf";
import { DashboardContent } from "./dashboard-content";
import type { UserRole } from "@/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [data, profile] = await Promise.all([
    measureAsync("dashboard.pageData", () =>
      loadDashboardPageData({
        supabase,
        userId: user.id,
      }),
    ),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ]);
  const userRole = ((profile.data?.role as UserRole | undefined) ?? "member") as UserRole;

  return (
    <AppShell width="full" className="dashboard-shell max-w-none pb-8 md:pb-4">
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
    </AppShell>
  );
}
