import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserPermissions } from "@/lib/permissions";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { Sparkles } from "lucide-react";
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
            这里仅保留 owner 专用的系统级配置。成员权限和团队分组放在团队管理里处理。
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SettingCard
          href="/admin/ai-channels"
          title="AI 配置"
          description="模型渠道、功能绑定、文案改写和执行路线管理。"
          icon={<Sparkles className="size-5" />}
        />
      </div>
    </div>
  );
}
