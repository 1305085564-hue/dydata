import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getShanghaiDate } from "@/app/api/production/_shared";

import { buildVideoReviewThresholdsGetResponse } from "@/app/api/admin/settings/thresholds/route";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { QuotaConfigPanel } from "./components/quota-config-panel";
import { ThresholdsConfigPanel } from "./components/thresholds-config-panel";

export const metadata: Metadata = {
  title: "系统维护 - DYData",
  description: "维护 DYData 成员权限、团队分组与系统配置。",
};

interface QuotaRule {
  id: string;
  effective_date: string;
  daily_target: number;
  created_by: string;
  note: string | null;
  created_at: string;
  profiles?: { name: string | null } | null;
}

type RawQuotaRule = Omit<QuotaRule, "profiles"> & {
  profiles?: { name: string | null } | { name: string | null }[] | null;
};

export default async function AdminSettingsPage() {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  if (!canAccessAdminPath("/admin/settings", permission.role, permission.permissions)) redirect("/admin");
  const isOwner = permission.role === "owner" || permission.permissions.manage_system === true;
  const canManageThresholds = isOwner;

  const supabase = await createClient();
  const today = getShanghaiDate();

  // Fetch current thresholds
  const thresholdsRes = await buildVideoReviewThresholdsGetResponse();
  const thresholdsJson = await thresholdsRes.json();
  const initialThresholds = thresholdsJson.thresholds;

  // Fetch current daily target
  const { data: currentQuotaVal } = await supabase.rpc("get_daily_quota", { p_date: today });
  
  // Fetch history of quota rules
  const { data: rawRules } = await supabase
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

  const rules: QuotaRule[] = ((rawRules ?? []) as RawQuotaRule[]).map((rule) => ({
    ...rule,
    profiles: Array.isArray(rule.profiles) ? (rule.profiles[0] ?? null) : (rule.profiles ?? null),
  }));

  return (
    <AdminWorkspaceLayout
      eyebrow="系统设置"
      title="系统维护"
      description="负责人处理成员权限和团队分组；owner 额外管理 AI 配置与业务阈值。"
      indexItems={[]}
      className="max-w-5xl"
    >
      <div className="space-y-8">
        {/* 异常阈值配置区块 */}
        <ThresholdsConfigPanel
          initialThresholds={initialThresholds}
          canManage={canManageThresholds}
        />

        {/* 产量目标配置区块 */}
        <QuotaConfigPanel
          initialRules={rules}
          currentDailyTarget={currentQuotaVal ?? 4}
          isOwner={isOwner}
          todayDate={today}
        />
      </div>
    </AdminWorkspaceLayout>
  );
}
