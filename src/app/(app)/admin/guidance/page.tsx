import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { loadGuidancePageData } from "@/lib/loaders/guidance-page";
import { CultivationList } from "./cultivation-list";

export default async function GuidancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (!canAccessAdminPath("/admin/guidance", perm.businessRole, perm.permissions)) redirect("/dashboard");

  const data = await loadGuidancePageData({ supabase });

  return (
    <AdminWorkspaceLayout
      eyebrow="转化指导"
      title="转化指导"
      description="从账号表现里筛出需要推进的人、方向和动作。"
      indexItems={[]}
      className="pb-8"
    >
      <section
        id="guidance-list"
        className="scroll-mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6"
      >
        <div className="flex items-center border-l-2 border-[#D97757] pl-3">
          <h2 className="text-[24px] font-semibold tracking-tight text-zinc-800">动作名单</h2>
        </div>
        <CultivationList accounts={data.accounts} reports={data.reports} />
      </section>
    </AdminWorkspaceLayout>
  );
}
