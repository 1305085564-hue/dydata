import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { DouyinAccountsPage } from "./douyin-accounts-page";

export const metadata: Metadata = {
  title: "抖音账号 - DYData",
  description: "绑定抖音账号，查看自动同步和账号趋势。",
};

export const dynamic = "force-dynamic";

export default function DouyinPage() {
  return (
    <AppShell width="normal">
      <DouyinAccountsPage />
    </AppShell>
  );
}
