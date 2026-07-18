import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getShanghaiDate } from "@/app/api/production/_shared";

import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { QuotaConfigPanel } from "./components/quota-config-panel";

export const metadata: Metadata = {
  title: "系统维护",
  description: "维护 DYData 成员权限、团队分组与系统配置。",
};

interface SettingCardProps {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

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

function SettingCard({ href, title, description, icon }: SettingCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 transition duration-200 ease-out",
        "hover:border-[#D97757]/40 active:translate-y-0",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 text-stone-700 transition group-hover:border-[#D97757]/30 group-hover:text-[#D97757]">
          {icon}
        </span>
        <span className="flex-1 pt-1 text-[18px] font-medium tracking-[-0.02em] text-stone-900">
          {title}
        </span>
      </div>
      <span className="text-[13px] leading-6 text-stone-500">{description}</span>
    </Link>
  );
}

export default async function AdminSettingsPage() {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  if (!canAccessAdminPath("/admin/settings", permission.businessRole, permission.permissions)) redirect("/admin");
  const isOwner = permission.businessRole === "owner" || permission.role === "owner";

  const supabase = await createClient();
  const today = getShanghaiDate();

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
      description="负责人处理成员权限和团队分组；owner 额外管理 AI 配置。"
      indexItems={[]}
    >
      <div className="space-y-10">
        {/* 系统设置大卡片区 */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SettingCard
            href="/admin/modules"
            title="成员管理"
            description="系统团队架构、分组归属维护、一键入团审批及成员精细化授权。"
            icon={<UsersRound className="size-5 text-[#D97757]" />}
          />
          {isOwner ? (
            <SettingCard
              href="/admin/ai-config"
              title="AI 配置"
              description="模型渠道、功能绑定、文案改写和执行路线管理."
              icon={<Sparkles className="size-5 text-[#D97757]" />}
            />
          ) : null}
        </div>

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
