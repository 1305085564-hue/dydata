import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPermissions } from "@/lib/permissions";
import { getShanghaiDate } from "@/app/api/production/_shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { VideoReviewWorkbench } from "./components/video-review-workbench";
import { loadApprovedList } from "@/lib/publish-drafts/read-model";

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

  const resolved = await searchParams;
  const rawDate = resolved.date;
  const selectedDate = typeof rawDate === "string" ? rawDate.trim() : getShanghaiDate();

  const rawTeamId = resolved.team_id;
  const selectedTeamId = typeof rawTeamId === "string" && rawTeamId !== "all" ? rawTeamId : "";

  const rawGroupId = resolved.group_id;
  const selectedGroupId = typeof rawGroupId === "string" && rawGroupId !== "all" ? rawGroupId : "";

  const queryRaw = resolved.q;
  const searchQuery = typeof queryRaw === "string" ? queryRaw.trim() : "";

  // 1. 获取已发案例列表（首页主卡片网格流）
  const { data: approvedData } = await loadApprovedList({
    limit: 100,
    search: searchQuery || null,
  });
  const approvedItems = approvedData ?? [];

  // 2. 获取今日对账指标（当前用户的今日计划指标数与已交凭证数）
  const { data: quotaTarget } = await supabase.rpc("get_daily_quota", { p_date: selectedDate });
  const target = typeof quotaTarget === "number" ? quotaTarget : 4;

  const { data: submissionsRaw } = await supabase
    .from("work_submissions")
    .select("id, user_id, team_id, group_id, submit_date, content_text, screenshot_urls, note, created_at")
    .eq("user_id", user.id)
    .eq("submit_date", selectedDate)
    .order("created_at", { ascending: false });

  const adminSupabase = createAdminClient();
  const initialSubmissions = await Promise.all(
    (submissionsRaw ?? []).map(async (row) => {
      const paths = (row.screenshot_urls ?? []) as string[];
      if (paths.length === 0) return { ...row, screenshot_items: [] };

      const { data: signedData } = await adminSupabase
        .storage
        .from("work-screenshots")
        .createSignedUrls(paths, 60 * 10);

      const byPath = new Map((signedData ?? []).map((item) => [item.path, item.signedUrl]));
      return {
        ...row,
        screenshot_items: paths.map((path: string) => ({
          path,
          signed_url: byPath.get(path) ?? null,
        })),
      };
    })
  );
  const submittedCount = initialSubmissions.length;

  // 3. 获取产量看板数据（管理特权，提供对账看板大弹窗使用）
  let dashboardData: any[] = [];
  let teams: Array<{ id: string; name: string }> = [];
  let groups: Array<{ id: string; name: string }> = [];

  if (isAdmin) {
    const { data: dbData } = await supabase.rpc("get_production_dashboard", {
      p_date: selectedDate,
      p_team_id: selectedTeamId || null,
      p_group_id: selectedGroupId || null,
    });
    dashboardData = dbData ?? [];

    const { data: teamsData } = await supabase
      .from("teams")
      .select("id, name")
      .order("name", { ascending: true });

    const { data: groupsData } = await supabase
      .from("groups")
      .select("id, name")
      .order("name", { ascending: true });

    teams = (teamsData ?? []) as Array<{ id: string; name: string }>;
    groups = (groupsData ?? []) as Array<{ id: string; name: string }>;
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
      />
    </div>
  );
}
