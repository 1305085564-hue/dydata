import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { getShanghaiDate } from "@/app/api/production/_shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { VideoReviewTabs } from "./components/video-review-tabs";
import { ProductionDashboard } from "./components/production-dashboard";

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
  const { businessRole, role } = permInfo;
  const isOwner = role === "owner";
  const isAdmin = ["owner", "team_admin", "group_leader"].includes(businessRole);

  if (!isAdmin) {
    redirect("/video-review/submit");
  }

  const resolved = await searchParams;
  const rawDate = resolved.date;
  const selectedDate = typeof rawDate === "string" ? rawDate.trim() : getShanghaiDate();

  const rawTeamId = resolved.team_id;
  const selectedTeamId = typeof rawTeamId === "string" && rawTeamId !== "all" ? rawTeamId : "";

  const rawGroupId = resolved.group_id;
  const selectedGroupId = typeof rawGroupId === "string" && rawGroupId !== "all" ? rawGroupId : "";

  const { data: dashboardData, error: dashboardError } = await supabase.rpc(
    "get_production_dashboard",
    {
      p_date: selectedDate,
      p_team_id: selectedTeamId || null,
      p_group_id: selectedGroupId || null,
    }
  );

  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name")
    .order("name", { ascending: true });

  const { data: groupsData } = await supabase
    .from("groups")
    .select("id, name")
    .order("name", { ascending: true });

  const teams = (teamsData ?? []) as Array<{ id: string; name: string }>;
  const groups = (groupsData ?? []) as Array<{ id: string; name: string }>;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Breadcrumb
        items={[
          { label: "视频审核", href: "/video-review" },
          { label: "产量看板" },
        ]}
      />

      <header className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 sm:px-8 sm:py-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400 font-mono">
              Fulfillment & Quota
            </p>
            <h1 className="mt-2 text-[24px] font-semibold leading-[1.33] tracking-tight text-zinc-800">
              产量对账看板
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-zinc-500">
              统计并对账全队每日视频发布履约。红灯亮起表示未达标且无豁免。
            </p>
          </div>
        </div>

        <VideoReviewTabs isAdmin={isAdmin} />
      </header>

      {dashboardError ? (
        <div className="rounded-xl border border-[#C9604D] bg-[#C9604D]/5 p-5 text-[13px] leading-[1.7] text-[#C9604D]">
          读取产量对账数据失败: {dashboardError.message}
        </div>
      ) : (
        <ProductionDashboard
          initialData={dashboardData ?? []}
          teams={teams}
          groups={groups}
          selectedDate={selectedDate}
          selectedTeamId={selectedTeamId || "all"}
          selectedGroupId={selectedGroupId || "all"}
        />
      )}
    </div>
  );
}
