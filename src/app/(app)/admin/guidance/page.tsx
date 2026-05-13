import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
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
  if (!hasPermission(perm.businessRole, perm.permissions, "view_analytics")) redirect("/dashboard");

  const data = await loadGuidancePageData({ supabase });

  return (
    <AdminWorkspaceLayout
      eyebrow="Conversion Guidance"
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
          <h2 className="text-[15px] font-medium tracking-tight text-zinc-800">动作名单</h2>
        </div>
        <CultivationList accounts={data.accounts} reports={data.reports} />
      </section>
    </AdminWorkspaceLayout>
  );
}
