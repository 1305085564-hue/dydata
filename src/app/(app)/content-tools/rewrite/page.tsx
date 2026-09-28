import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { canUseAiCopywriting } from "@/lib/permission-utils";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "文案助手 - DYData",
  description: "文案助手已下线。",
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
    <div className="mx-auto flex min-h-[50vh] w-full max-w-[1400px] items-center justify-center font-sans">
      <EmptyState
        title="文案助手已下线"
        description="该功能已停止服务，不再提供入口。如有疑问请联系管理员。"
      />
    </div>
  );
}
