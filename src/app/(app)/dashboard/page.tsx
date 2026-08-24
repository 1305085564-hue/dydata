import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardContent } from "./dashboard-content";

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
 * - 测试路由：/dashboard/test-v2（独立测试页面）
 */
export default function DashboardPage() {
  return (
    <AppShell width="full" className="max-w-none">
      <Suspense fallback={<div className="p-6 text-[#78716C]">加载中...</div>}>
        <DashboardContent />
      </Suspense>
    </AppShell>
  );
}
