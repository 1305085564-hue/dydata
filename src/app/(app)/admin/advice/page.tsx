import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { loadAdminAdvicePageData } from "@/lib/loaders/admin-advice-page";
export type { AdviceRow, AdviceDetailRow } from "@/lib/loaders/admin-advice-page";
import { AdviceList } from "./advice-list";

export default async function AdminAdvicePage() {
  const permission = await getUserPermissions();

  if (!permission) {
    redirect("/login");
  }

  if (!canAccessAdminPath("/admin/advice", permission.businessRole, permission.permissions)) {
    redirect("/dashboard");
  }

  return (
    <AdminWorkspaceLayout
      eyebrow="建议队列"
      title="转化建议"
      description="按员工、账号、状态和来源筛选建议，统一复核和执行。"
      indexItems={[]}
      className="pb-8"
    >
      <Suspense fallback={
        <div className="rounded-2xl border border-stone-200 bg-white p-6 mt-4">
          <TableSkeleton columnCount={5} rowCount={6} showHeader={true} />
        </div>
      }>
        <AdviceDataContainer currentUserId={permission.userId} />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}

async function AdviceDataContainer({ currentUserId }: { currentUserId: string }) {
  const supabase = await createClient();
  const data = await loadAdminAdvicePageData({ supabase });

  return (
    <section
      id="advice-queue"
      className="scroll-mt-8 space-y-4 rounded-2xl border border-stone-200 bg-white p-6 mt-4"
    >
      <div className="flex items-center border-l-2 border-[#D97757] pl-3">
        <h2 className="text-[24px] font-medium tracking-tight text-stone-900">建议队列</h2>
      </div>
      <AdviceList
        advice={data.advice}
        profiles={data.profiles}
        accounts={data.accounts}
        currentUserId={currentUserId}
      />
    </section>
  );
}
