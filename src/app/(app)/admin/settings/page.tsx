import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserPermissions } from "@/lib/permissions";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { Sparkles, UsersRound, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";

interface SettingCardProps {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

function SettingCard({ href, title, description, icon }: SettingCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 transition duration-200 ease-out",
        "hover:border-[#D97757]/40 active:translate-y-0",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-700 transition group-hover:border-[#D97757]/30 group-hover:text-[#D97757]">
          {icon}
        </span>
        <span className="flex-1 pt-1 text-[18px] font-semibold tracking-[-0.02em] text-zinc-800">
          {title}
        </span>
      </div>
      <span className="text-sm leading-6 text-zinc-500">{description}</span>
    </Link>
  );
}

export default async function AdminSettingsPage() {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  if (!canAccessAdminPath("/admin/settings", permission.businessRole, permission.permissions)) redirect("/admin");
  const isOwner = permission.businessRole === "owner" || permission.role === "owner";

  return (
    <AdminWorkspaceLayout
      eyebrow="系统设置"
      title="系统维护"
      description="负责人处理成员权限和团队分组；owner 额外管理 AI 配置。"
      indexItems={[]}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SettingCard
          href="/admin/modules"
          title="成员权限"
          description="成员审批、角色分配、权限开关和邀请码管理。"
          icon={<UsersRound className="size-5" />}
        />
        <SettingCard
          href="/admin/modules?focus=teams"
          title="团队分组"
          description="团队结构、分组维护和成员归属调整。"
          icon={<ShieldCheck className="size-5" />}
        />
        {isOwner ? (
        <SettingCard
          href="/admin/ai-config"
          title="AI 配置"
          description="模型渠道、功能绑定、文案改写和执行路线管理。"
          icon={<Sparkles className="size-5" />}
        />
        ) : null}
      </div>
    </AdminWorkspaceLayout>
  );
}
