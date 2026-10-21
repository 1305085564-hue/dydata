import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import {
  getShanghaiDateOffset,
  parsePulseCap,
  parsePulseDate,
} from "./pulse-filters";
import { PulseDataContainer } from "./pulse-data-container";

export const metadata: Metadata = {
  title: "每日大盘 - DYData",
  description: "管理层晨间大盘：总播放、人员日战报与红黑两头。",
};

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdminPulsePage({ searchParams }: Props) {
  const params = await searchParams;
  const permissionContext = await getCurrentPermissionContext("company", null);

  if (!permissionContext) {
    redirect("/login");
  }

  const { permissionInfo: perm } = permissionContext;
  if (!canAccessAdminPath("/admin/pulse", perm.role, perm.permissions)) {
    redirect("/dashboard");
  }

  const yesterday = getShanghaiDateOffset(-1);
  const selectedDate = parsePulseDate(params.date, yesterday);
  const selectedCap = parsePulseCap(params.cap);

  return (
    <AdminWorkspaceLayout
      eyebrow="管理大盘"
      title="每日大盘"
      description="晨间 3 分钟：大盘涨跌、人员战报、红黑两头。"
      indexItems={[]}
      width="wide"
      hideHeaderOnMobile={true}
    >
      <Suspense
        key={selectedDate}
        fallback={
          <div className="mt-4">
            <TableSkeleton columnCount={7} rowCount={6} showHeader={true} />
          </div>
        }
      >
        <PulseDataContainer
          selectedDate={selectedDate}
          selectedCap={selectedCap}
          permissionInfo={perm}
        />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}
