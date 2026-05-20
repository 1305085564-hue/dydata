import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { loadAdminAdvicePageData } from "@/lib/loaders/admin-advice-page";
export type { AdviceRow } from "@/lib/loaders/admin-advice-page";
import { AdviceList } from "./advice-list";

export default async function AdminAdvicePage() {
  const permission = await getUserPermissions();

  if (!permission) {
    redirect("/login");
  }

  if (!canAccessAdminPath("/admin/advice", permission.businessRole, permission.permissions)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const data = await loadAdminAdvicePageData({ supabase });

  return (
    <AdminWorkspaceLayout
      eyebrow="建议队列"
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
          <h2 className="text-[24px] font-semibold tracking-tight text-zinc-800">建议队列</h2>
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
