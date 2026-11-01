import type { Metadata } from "next";

import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { PageEpigraph } from "@/components/editorial/page-epigraph";
import { DouyinAccountsPage } from "./douyin-accounts-page";

export const metadata: Metadata = {
  title: "抖音账号 - DYData",
  description: "绑定抖音账号，查看自动同步和账号趋势。",
};

export const dynamic = "force-dynamic";

export default function DouyinPage() {
  return (
    <AdminWorkspaceLayout
      width="normal"
      title="抖音账号"
      description={<PageEpigraph pageKey="douyin" />}
    >
      <DouyinAccountsPage />
    </AdminWorkspaceLayout>
  );
}
