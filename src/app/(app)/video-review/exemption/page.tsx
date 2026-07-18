import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { getShanghaiDate } from "@/app/api/production/_shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { VideoReviewTabs } from "../components/video-review-tabs";
import { ExemptionWorkbench } from "./exemption-workbench";

export const metadata: Metadata = {
  title: "申请产量豁免",
  description: "提交请假、故障或账号限流等产量豁免申请。",
};

type ExemptionHistoryRow = {
  id: string;
  exemption_type: string;
  start_date: string;
  end_date: string | null;
  reason: string;
  request_status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
};

export default async function ExemptionPage() {
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
  let exemptionHistory: ExemptionHistoryRow[] = [];
  let historyErrorMessage: string | null = null;
  try {
    const { data, error } = await supabase
      .from("exemption_request")
      .select("id, exemption_type, start_date, end_date, reason, request_status, created_at, reviewed_at")
      .eq("applicant_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    exemptionHistory = (data ?? []) as ExemptionHistoryRow[];
  } catch (err) {
    console.error("Failed to load exemption history:", err);
    historyErrorMessage = "暂时无法取得申请历史，请稍后重试。";
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Breadcrumb
        items={[
          { label: "视频审核", href: "/video-review" },
          { label: "申请豁免" },
        ]}
      />

      <header className="rounded-2xl border border-stone-200 bg-white px-6 py-5 sm:px-8 sm:py-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-stone-500">
              产量对账
            </p>
            <h1 className="mt-2 text-[24px] font-medium leading-[1.33] tracking-tight text-stone-900">
              申请产量豁免
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-[1.7] text-stone-500">
              提前请假或在故障、账号限流时申请减免今日发片指标，提交后由负责人进行审批。
            </p>
          </div>
        </div>

        <VideoReviewTabs isAdmin={isAdmin} />
      </header>

      <ExemptionWorkbench
        key={[
          historyErrorMessage ? "error" : "ready",
          exemptionHistory
            .map((row) => `${row.id}:${row.request_status}:${row.reviewed_at ?? ""}`)
            .join(","),
        ].join("|")}
        initialHistory={exemptionHistory}
        todayDate={today}
        historyErrorMessage={historyErrorMessage}
      />
    </div>
  );
}
