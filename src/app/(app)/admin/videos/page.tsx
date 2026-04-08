import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import { AppShell, AppShellHero, AppShellMetricStrip, AppShellSection } from "@/components/app-shell";
import { loadAdminVideosPageData } from "@/lib/loaders/admin-videos-page";
import { VideoList } from "./video-list";

export default async function AdminVideosPage() {
  const perm = await getUserPermissions();

  if (!perm) {
    redirect("/login");
  }

  if (!isAdminLevel(perm.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const data = await loadAdminVideosPageData({ supabase });

  return (
    <AppShell width="wide" className="pb-8">
      <AppShellHero
        eyebrow="Video Console"
        title="视频管理"
        description="按账号、负责人、日期和状态查看全部视频与 24h 快照。"
      >
        <AppShellMetricStrip
          columns={4}
          items={[
            { label: "视频总量", value: data.summary.totalVideos, hint: "当前已录入视频", tone: "primary" },
            { label: "已打标签", value: data.summary.taggedVideos, hint: "已有标签结果", tone: "success" },
            { label: "24h 快照", value: data.summary.snapshotCount, hint: "已生成的快照数", tone: "neutral" },
            { label: "异常视频", value: data.summary.abnormalCount, hint: "需要优先排查", tone: data.summary.abnormalCount > 0 ? "warning" : "neutral" },
          ]}
        />
      </AppShellHero>

      <AppShellSection
        eyebrow="Video Table"
        title="视频列表"
        description="筛选、补齐 24h 数据、查看详情都集中在这一块。"
      >
        <VideoList
          videos={data.videos}
          snapshots={data.snapshots}
          profiles={data.profiles}
          accounts={data.accounts}
          videoTags={data.videoTags}
        />
      </AppShellSection>
    </AppShell>
  );
}
