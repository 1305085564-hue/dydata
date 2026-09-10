import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getShanghaiDate } from "@/app/api/production/_shared";
import { loadAdminSettingsPageData } from "@/lib/loaders/admin-settings-page";

import { buildVideoReviewThresholdsGetResponse } from "@/app/api/admin/settings/thresholds/route";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { QuotaConfigPanel } from "./components/quota-config-panel";
import { ThresholdsConfigPanel } from "./components/thresholds-config-panel";

export const metadata: Metadata = {
  title: "系统设置 - DYData",
  description: "配置 DYData 视频复盘阈值、日报目标与系统参数。",
};

export default async function AdminSettingsPage() {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  if (!canAccessAdminPath("/admin/settings", permission.role, permission.permissions)) redirect("/admin");
  const isOwner = permission.role === "owner" || permission.permissions.manage_system === true;
  const canManageThresholds = isOwner;

  const supabase = await createClient();
  const today = getShanghaiDate();

  const settingsData = await loadAdminSettingsPageData({
    today,
    loadThresholds: async () => {
      const response = await buildVideoReviewThresholdsGetResponse();
      const json = await response.json();
      return json.thresholds;
    },
    loadCurrentQuota: async (date) => {
      const { data } = await supabase.rpc("get_daily_quota", { p_date: date });
      return data;
    },
    loadRules: async () => {
      const { data } = await supabase
        .from("daily_quota_config")
        .select(`
          id,
          effective_date,
          daily_target,
          created_by,
          note,
          created_at,
          profiles:created_by ( name )
        `)
        .order("effective_date", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  return (
    <AdminWorkspaceLayout
      eyebrow="系统设置"
      title="系统设置"
      description="配置视频复盘阈值、日报目标与系统参数。"
      indexItems={[]}
      className="max-w-5xl"
    >
      <div className="space-y-8">
        {/* 异常阈值配置区块 */}
        <ThresholdsConfigPanel
          initialThresholds={settingsData.thresholds}
          canManage={canManageThresholds}
        />

        {/* 产量目标配置区块 */}
        <QuotaConfigPanel
          initialRules={settingsData.rules}
          currentDailyTarget={settingsData.currentDailyTarget}
          isOwner={isOwner}
          todayDate={today}
        />
      </div>
    </AdminWorkspaceLayout>
  );
}
