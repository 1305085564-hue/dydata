import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPermissions } from "@/lib/permissions";
import { getShanghaiDate } from "@/app/api/production/_shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { VideoReviewTabs } from "../components/video-review-tabs";
import { SubmitWorkbench } from "./submit-workbench";

export default async function SubmitPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const permInfo = await getUserPermissions();
  if (!permInfo) redirect("/login");
  const { businessRole } = permInfo;
  const isAdmin = ["owner", "team_admin", "group_leader"].includes(businessRole);

  const today = getShanghaiDate();

  const { data: quotaTarget } = await supabase.rpc("get_daily_quota", { p_date: today });
  const target = typeof quotaTarget === "number" ? quotaTarget : 4;

  const { data: submissionsData } = await supabase
    .from("work_submissions")
    .select("id, user_id, team_id, group_id, submit_date, content_text, screenshot_urls, note, created_at")
    .eq("user_id", user.id)
    .eq("submit_date", today)
    .order("created_at", { ascending: false });

  const adminSupabase = createAdminClient();
  const submissions = await Promise.all(
    (submissionsData ?? []).map(async (row) => {
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

  const { data: exemptions } = await supabase
    .from("exemption_request")
    .select("id, request_status, exemption_type")
    .eq("applicant_user_id", user.id)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`);

  const hasApprovedExemption = (exemptions ?? []).some((e) => e.request_status === "approved");
  const hasPendingExemption = (exemptions ?? []).some((e) => e.request_status === "pending");

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Breadcrumb
        items={[
          { label: "视频审核", href: "/video-review" },
          { label: "提交作品" },
        ]}
      />

      <header className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 sm:px-8 sm:py-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400 font-mono">
              Fulfillment & Quota
            </p>
            <h1 className="mt-2 text-[24px] font-semibold leading-[1.33] tracking-tight text-zinc-800">
              提交作品凭证
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-zinc-500">
              上传今日视频发布凭证（话术内容与截图），登记您的每日产量。
            </p>
          </div>
        </div>

        <VideoReviewTabs isAdmin={isAdmin} />
      </header>

      <SubmitWorkbench
        userId={user.id}
        initialTarget={target}
        initialSubmissions={submissions as any[]}
        hasApprovedExemption={hasApprovedExemption}
        hasPendingExemption={hasPendingExemption}
        todayDate={today}
      />
    </div>
  );
}
