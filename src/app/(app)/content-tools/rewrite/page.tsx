import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { RewriteWorkbenchV3 } from "@/components/content-tools/rewrite-v3";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { canUseAiCopywriting } from "@/lib/permission-utils";

export const metadata: Metadata = {
  title: "文案助手 - DYData",
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

  if (!permissionInfo || !canUseAiCopywriting(permissionInfo.role, permissionInfo.permissions)) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto h-[calc(100dvh-var(--app-top-offset)-var(--app-bottom-offset,4.5rem)-1rem)] w-full max-w-[1400px] overflow-hidden rounded-2xl border border-[#E5E0D6] bg-[#FBF9F5] font-sans md:h-[calc(100dvh-var(--app-top-offset)-1.25rem)]">
      <RewriteWorkbenchV3 />
    </div>
  );
}
