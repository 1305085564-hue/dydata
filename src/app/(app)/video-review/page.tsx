import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { getShanghaiDate } from "@/app/api/production/_shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import type {
  ApprovedDraftItem,
} from "@/lib/publish-drafts/types";
import type {
  DashboardRecord,
  SignedWorkSubmissionRow,
  TeamOrGroup,
} from "@/lib/loaders/video-review-page";
import { VideoReviewWorkbench } from "./components/video-review-workbench";
import { loadVideoReviewDashboardData } from "@/lib/loaders/video-review-page";
import { measureAsync } from "@/lib/perf";

export default async function VideoReviewDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const permInfo = await getUserPermissions();
  if (!permInfo) redirect("/login");
  const { businessRole } = permInfo;
  const isAdmin = ["owner", "team_admin", "group_leader"].includes(businessRole);

  const resolved = (await searchParams) ?? {};
  const rawDate = resolved.date;
  const selectedDate = typeof rawDate === "string" ? rawDate.trim() : getShanghaiDate();

  const rawTeamId = resolved.team_id;
  const selectedTeamId = typeof rawTeamId === "string" && rawTeamId !== "all" ? rawTeamId : "";

  const rawGroupId = resolved.group_id;
  const selectedGroupId = typeof rawGroupId === "string" && rawGroupId !== "all" ? rawGroupId : "";

  const queryRaw = resolved.q;
  const searchQuery = typeof queryRaw === "string" ? queryRaw.trim() : "";

  let approvedItems: ApprovedDraftItem[] = [];
  let target = 4;
  let initialSubmissions: SignedWorkSubmissionRow[] = [];
  let submittedCount = 0;
  let dashboardData: DashboardRecord[] = [];
  let teams: TeamOrGroup[] = [];
  let groups: TeamOrGroup[] = [];
  let errorMsg = "";

  try {
    const loaded = await measureAsync("videoReview.pageData", () =>
      loadVideoReviewDashboardData({
        supabase,
        userId: user.id,
        selectedDate,
        searchQuery,
        isAdmin,
        selectedTeamId,
        selectedGroupId,
      }),
    );

    approvedItems = loaded.approvedItems;
    target = loaded.target;
    initialSubmissions = loaded.submissions;
    submittedCount = loaded.submittedCount;
    dashboardData = loaded.dashboardData;
    teams = loaded.teams;
    groups = loaded.groups;
  } catch (err: unknown) {
    console.error("[video-review] SSR data loading failed:", err);
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Breadcrumb
        items={[
          { label: "视频审核", href: "/video-review" },
          { label: "产量对账" },
        ]}
      />

      <VideoReviewWorkbench
        isAdmin={isAdmin}
        userId={user.id}
        todayDate={selectedDate}
        initialTarget={target}
        initialSubmittedCount={submittedCount}
        initialSubmissions={initialSubmissions}
        initialDashboardData={dashboardData}
        teams={teams}
        groups={groups}
        approvedItems={approvedItems}
        searchQuery={searchQuery}
        selectedTeamId={selectedTeamId || "all"}
        selectedGroupId={selectedGroupId || "all"}
        errorMsg={errorMsg || undefined}
      />
    </div>
  );
}
