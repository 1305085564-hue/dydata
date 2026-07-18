import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { RewriteWorkbenchV3 } from "@/components/content-tools/rewrite-v3";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { canUseAiCopywriting } from "@/lib/permission-utils";

export const metadata: Metadata = {
  title: "AI 文案改写",
  description: "输入原文，使用团队配置的 AI 模型辅助改写抖音文案。",
};

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
    <div className="mx-auto mt-[-1.25rem] ml-[-1rem] h-[calc(100dvh-var(--app-top-offset)-1.25rem)] w-[calc(100%+2rem)] max-w-[1400px] overflow-hidden border-t border-stone-200 bg-stone-50 font-sans sm:ml-[-1.5rem] sm:w-[calc(100%+3rem)]">
      <RewriteWorkbenchV3 />
    </div>
  )
}
