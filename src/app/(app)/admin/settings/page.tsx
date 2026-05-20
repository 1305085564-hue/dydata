import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserPermissions } from "@/lib/permissions";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { Blocks, Sparkles, UsersRound, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

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
        "hover:border-[#D97757]/40 hover:shadow-sm active:translate-y-0",
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

  return (
    <div className="min-w-0 space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            系统设置
          </p>
          <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-800">
            系统维护
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-[1.7] text-zinc-500">
            成员审批、权限配置、AI 渠道和模块开关，低频维护内容集中管理。
          </p>
        </div>
      </header>

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
        <SettingCard
          href="/admin/ai-channels"
          title="AI 配置"
          description="模型渠道、功能绑定、文案改写和执行路线管理。"
          icon={<Sparkles className="size-5" />}
        />
        <SettingCard
          href="/admin/modules?focus=modules"
          title="模块开关"
          description="各功能模块的启用状态和系统规则配置。"
          icon={<Blocks className="size-5" />}
        />
      </div>
    </div>
  );
}
