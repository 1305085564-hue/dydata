import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { getShanghaiDate } from "@/app/api/production/_shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Info } from "lucide-react";
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

export const metadata: Metadata = {
  title: "视频审核",
  description: "核对视频产量、待审稿件与团队提交记录。",
};

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
    errorMsg = "视频复盘数据加载失败，请稍后重试。";
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Breadcrumb
        items={[
          { label: "视频审核", href: "/video-review" },
          { label: "产量对账" },
        ]}
      />

      <div className="flex items-start gap-2.5 rounded-xl border border-stone-200 bg-white p-3.5 text-[13px] text-stone-600 shadow-sm">
        <Info className="mt-0.5 size-4 shrink-0 stroke-[1.5] text-amber-500" />
        <div className="leading-relaxed">
          <span className="font-medium text-stone-800">短期过渡入口：</span>
          本页仍可处理当前提交、豁免申请和历史记录。后续主流程会迁移至新的视频复盘入口，在此之前保留直接访问。
        </div>
      </div>

      <VideoReviewWorkbench
        key={[
          errorMsg ? "error" : "ready",
          selectedDate,
          selectedTeamId || "all",
          selectedGroupId || "all",
          searchQuery,
          initialSubmissions.map((row) => row.id).join(","),
        ].join("|")}
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
