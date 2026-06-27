import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { RewriteWorkbench } from "@/components/content-tools/rewrite";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { canUseAiCopywriting } from "@/lib/permission-utils";

export const metadata: Metadata = {
  title: 'AI 文案改写 | 抖音数据平台',
  description: '输入原文，一键改写成爆款文案。',
}

export default async function RewritePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const permissionInfo = await getUserPermissions();

  if (!permissionInfo || !canUseAiCopywriting(permissionInfo.businessRole, permissionInfo.permissions)) {
    redirect("/content-tools");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 h-[calc(100dvh-var(--app-top-offset))] w-full overflow-hidden">
      <RewriteWorkbench />
    </div>
  )
}
