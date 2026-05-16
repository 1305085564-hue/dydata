import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { DashboardAnimatedSection } from "./dashboard-animated-section";
import { loadDashboardPageData } from "@/lib/loaders/dashboard-page";
import { measureAsync } from "@/lib/perf";
import { loadMyTodaySopStatus, loadSopMatrix } from "@/lib/sop/service";
import { DashboardContent } from "./dashboard-content";
import type { SopMemberStatus, UserRole } from "@/types";

async function safeLoadSopData(today: string, role: UserRole) {
  const isAdminOrOwner = role === "admin" || role === "owner";

  // owner/admin 的 review queue 和 sop matrix 数据来源完全相同，只查一次
  const sharedPromise = isAdminOrOwner
    ? loadSopMatrix(today).catch(() => [] as SopMemberStatus[])
    : Promise.resolve(null);

  const [mine, shared] = await Promise.all([
    loadMyTodaySopStatus(today).catch(() => null),
    sharedPromise,
  ]);

  if (shared) {
    return { mine, matrix: shared };
  }

  return { mine, matrix: [] as SopMemberStatus[] };
}

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
  const sopData = await safeLoadSopData(data.today, userRole);

  return (
    <AppShell width="full" className="dashboard-shell max-w-none pb-24 md:pb-10">
      <DashboardAnimatedSection index={0}>
        <DashboardContent
          initialMine={sopData.mine}
          initialMatrix={sopData.matrix}
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
