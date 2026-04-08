import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import { AppShell, AppShellHero, AppShellMetricStrip, AppShellSection } from "@/components/app-shell";
import { loadAdminContentPageData } from "@/lib/loaders/admin-content-page";
import { ContentList } from "./content-list";

export default async function AdminContentPage() {
  const perm = await getUserPermissions();

  if (!perm) {
    redirect("/login");
  }

  if (!isAdminLevel(perm.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const data = await loadAdminContentPageData({ supabase });

  return (
    <AppShell width="wide" className="pb-8">
      <AppShellHero
        eyebrow="Content Console"
        title="内容管理"
        description="次日复盘工作台：把昨日文案和今日结果数据放在一起，快速定位问题、输出整改建议。"
      >
        <AppShellMetricStrip
          columns={4}
          items={[
            { label: "内容总量", value: data.summary.totalVideos, hint: "当前纳入复盘的视频", tone: "primary" },
            { label: "已复盘", value: data.summary.reviewedCount, hint: "已有次日复盘结果", tone: "success" },
            { label: "24h 样本", value: data.summary.snapshotCount, hint: "可用于复盘的快照", tone: "neutral" },
            { label: "待复盘", value: data.summary.pendingReviewCount, hint: "还没处理的内容", tone: data.summary.pendingReviewCount > 0 ? "warning" : "neutral" },
          ]}
        />
      </AppShellHero>

      <AppShellSection
        eyebrow="Review Queue"
        title="复盘列表"
        description="按人、账号、样本状态和复盘状态筛选待处理内容。"
      >
        <ContentList
          videos={data.videos}
          snapshots={data.snapshots}
          profiles={data.profiles}
          accounts={data.accounts}
          reviewedVideoIds={data.reviewedVideoIds}
        />
      </AppShellSection>
    </AppShell>
  );
}
