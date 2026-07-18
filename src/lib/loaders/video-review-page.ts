import type { SupabaseClient } from "@supabase/supabase-js";

import { loadApprovedList, type ApprovedDraftItem } from "@/lib/publish-drafts/read-model";
import { createAdminClient } from "@/lib/supabase/admin";
import { measureAsync } from "@/lib/perf";

type VideoReviewSupabase = SupabaseClient;

type WorkSubmissionRow = {
  id: string;
  user_id: string;
  team_id: string | null;
  group_id: string | null;
  submit_date: string;
  content_text: string | null;
  screenshot_urls: string[] | null;
  note: string | null;
  created_at: string;
};

export type SignedWorkSubmissionRow = WorkSubmissionRow & {
  screenshot_items: Array<{
    path: string;
    signed_url: string | null;
  }>;
};

export type DashboardRecord = {
  user_id: string;
  user_name: string;
  team_id: string;
  team_name: string;
  group_id: string;
  group_name: string;
  daily_target: number;
  submitted_count: number;
  gap: number;
  exemption_status: "none" | "pending" | "approved" | "rejected";
  alert_level: "green" | "yellow" | "red";
};

export type TeamOrGroup = {
  id: string;
  name: string;
};

export type VideoReviewDashboardData = {
  approvedItems: ApprovedDraftItem[];
  target: number;
  submissions: SignedWorkSubmissionRow[];
  submittedCount: number;
  dashboardData: DashboardRecord[];
  teams: TeamOrGroup[];
  groups: TeamOrGroup[];
};

export const VIDEO_REVIEW_HOME_APPROVED_LIMIT = 24;

function uniquePaths(rows: WorkSubmissionRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const path of row.screenshot_urls ?? []) {
      if (typeof path !== "string" || path.length === 0 || seen.has(path)) continue;
      seen.add(path);
    }
  }
  return [...seen];
}

export async function attachSignedSubmissionScreenshots(
  adminSupabase: Pick<ReturnType<typeof createAdminClient>, "storage">,
  rows: WorkSubmissionRow[],
): Promise<SignedWorkSubmissionRow[]> {
  const allPaths = uniquePaths(rows);
  const signedUrlByPath = new Map<string, string | null>();

  if (allPaths.length > 0) {
    const { data, error } = await measureAsync("videoReview.signSubmissionScreenshots", () =>
      adminSupabase.storage.from("work-screenshots").createSignedUrls(allPaths, 60 * 10),
    );

    if (error) {
      console.error("[video-review] createSignedUrls error:", error);
    }

    for (const item of data ?? []) {
      if (typeof item.path === "string") {
        signedUrlByPath.set(item.path, item.signedUrl ?? null);
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    screenshot_items: (row.screenshot_urls ?? []).map((path) => ({
      path,
      signed_url: signedUrlByPath.get(path) ?? null,
    })),
  }));
}

export async function loadVideoReviewDashboardData({
  supabase,
  userId,
  selectedDate,
  searchQuery,
  isAdmin,
  selectedTeamId,
  selectedGroupId,
}: {
  supabase: VideoReviewSupabase;
  userId: string;
  selectedDate: string;
  searchQuery: string;
  isAdmin: boolean;
  selectedTeamId: string;
  selectedGroupId: string;
}): Promise<VideoReviewDashboardData> {
  const approvedPromise = measureAsync("videoReview.approvedList", async () => {
    const { data, errorMessage } = await loadApprovedList({
      limit: VIDEO_REVIEW_HOME_APPROVED_LIMIT,
      search: searchQuery || null,
    });
    if (errorMessage) {
      console.error("[video-review] loadApprovedList error:", errorMessage);
    }
    return data ?? [];
  });

  const quotaPromise = measureAsync("videoReview.dailyQuota", async () => {
    const { data, error } = await supabase.rpc("get_daily_quota", { p_date: selectedDate });
    if (error) {
      throw new Error(`获取每日产量目标失败: ${error.message}`);
    }
    return typeof data === "number" ? data : 4;
  });

  const submissionsPromise = measureAsync("videoReview.workSubmissions", async () => {
    const { data, error } = await supabase
      .from("work_submissions")
      .select("id, user_id, team_id, group_id, submit_date, content_text, screenshot_urls, note, created_at")
      .eq("user_id", userId)
      .eq("submit_date", selectedDate)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`获取作品提交记录失败: ${error.message}`);
    }

    return (data ?? []) as WorkSubmissionRow[];
  });

  const adminPanelPromise = isAdmin
    ? measureAsync("videoReview.adminPanel", async () => {
        const [dashboardResult, teamsResult, groupsResult] = await Promise.all([
          supabase.rpc("get_production_dashboard", {
            p_date: selectedDate,
            p_team_id: selectedTeamId || null,
            p_group_id: selectedGroupId || null,
          }),
          supabase.from("teams").select("id, name").order("name", { ascending: true }),
          supabase.from("groups").select("id, name").order("name", { ascending: true }),
        ]);

        if (dashboardResult.error) {
          throw new Error(`获取产量看板数据失败: ${dashboardResult.error.message}`);
        }
        if (teamsResult.error) {
          throw new Error(`获取团队列表失败: ${teamsResult.error.message}`);
        }
        if (groupsResult.error) {
          throw new Error(`获取小组列表失败: ${groupsResult.error.message}`);
        }

        return {
          dashboardData: (dashboardResult.data ?? []) as DashboardRecord[],
          teams: (teamsResult.data ?? []) as TeamOrGroup[],
          groups: (groupsResult.data ?? []) as TeamOrGroup[],
        };
      })
    : Promise.resolve({
        dashboardData: [] as DashboardRecord[],
        teams: [] as TeamOrGroup[],
        groups: [] as TeamOrGroup[],
      });

  const [approvedItems, target, submissionRows, adminPanelData] = await Promise.all([
    approvedPromise,
    quotaPromise,
    submissionsPromise,
    adminPanelPromise,
  ]);

  const submissions = await attachSignedSubmissionScreenshots(createAdminClient(), submissionRows);

  return {
    approvedItems,
    target,
    submissions,
    submittedCount: submissions.length,
    dashboardData: adminPanelData.dashboardData,
    teams: adminPanelData.teams,
    groups: adminPanelData.groups,
  };
}
