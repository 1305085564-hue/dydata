import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { loadAdminAdvicePageData } from "@/lib/loaders/admin-advice-page";
export type { AdviceRow } from "@/lib/loaders/admin-advice-page";
import { AdviceList } from "./advice-list";

export default async function AdminAdvicePage() {
  const permission = await getUserPermissions();

  if (!permission) {
    redirect("/login");
  }

  if (!hasPermission(permission.businessRole, permission.permissions, "view_analytics")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const data = await loadAdminAdvicePageData({ supabase });

  return (
    <AdminWorkspaceLayout
      eyebrow="Advice Queue"
      title="转化建议"
      description="按员工、账号、状态和来源筛选建议，统一复核和执行。"
      indexItems={[]}
      className="pb-8"
    >
      <section
        id="advice-queue"
        className="scroll-mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6"
      >
        <div className="flex items-center border-l-2 border-[#D97757] pl-3">
          <h2 className="text-[15px] font-medium tracking-tight text-zinc-800">建议队列</h2>
        </div>
        <AdviceList
          advice={data.advice}
          profiles={data.profiles}
          accounts={data.accounts}
          currentUserId={permission.userId}
        />
      </section>
    </AdminWorkspaceLayout>
  );
}
