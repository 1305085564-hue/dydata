import type { Metadata } from "next";

import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
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
      description="绑定一次后，系统会定时同步公开作品和账号趋势。无法确认的作品会留在待确认状态，不会直接替你判定履约。"
    >
      <DouyinAccountsPage />
    </AdminWorkspaceLayout>
  );
}
