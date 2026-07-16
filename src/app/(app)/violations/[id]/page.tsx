import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { DetailContainer } from "./detail-container";
import ViolationDetailLoading from "./loading";

export default async function ViolationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const permInfo = await getUserPermissions();
  const isOwner = permInfo?.role === "owner";
  const canManageViolations =
    isOwner ||
    (permInfo
      ? hasPermission(permInfo.businessRole, permInfo.permissions, "manage_violations")
      : false);

  const { id } = await params;

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: "避坑案例", href: "/violations" },
          { label: "案例详情" },
        ]}
      />

      <AdminWorkspaceLayout indexItems={[]} width="wide">
        <Suspense fallback={<ViolationDetailLoading />}>
          <DetailContainer
            id={id}
            user={user}
            isOwner={isOwner}
            canManageViolations={canManageViolations}
          />
        </Suspense>
      </AdminWorkspaceLayout>
    </div>
  );
}
