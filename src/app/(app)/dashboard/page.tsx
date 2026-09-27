import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardDataContainer } from "./dashboard-data-container";
import DashboardLoading from "./loading";

export const metadata: Metadata = {
  title: "工作台 - DYData",
  description: "记录抖音运营数据，查看团队进度与今日待办。",
};

// 禁用静态生成 - dashboard 页面需要用户会话数据
export const dynamic = "force-dynamic";

/**
 * 今日提交页面
 *
 * 注意：V2 改造已完成
 * - 生产路由：/dashboard（使用 VideoSubmitPanelV2）
 */
export default function DashboardPage() {
  return (
    <AppShell
      eyebrow="工作台"
      title="创作立卷 · 表达纪事"
      description="从容记录每一次真实表达 · 数据沉淀与运营复盘"
      width="wide"
    >
      <Suspense fallback={<DashboardLoading />}>
        <DashboardDataContainer />
      </Suspense>
    </AppShell>
  );
}
