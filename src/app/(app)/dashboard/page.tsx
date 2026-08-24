import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { VideoSubmitPanel } from "./video-submit-panel";

export const metadata: Metadata = {
  title: "工作台 - DYData",
  description: "记录抖音运营数据，查看团队进度与今日待办。",
};

/**
 * 今日提交页面
 *
 * 注意：V2 改造正在进行中
 * - 测试路由：/dashboard/test-v2（VideoSubmitFormV2 单独测试）
 * - 生产路由：/dashboard（使用原有 Antigravity 版本 + VideoSubmitForm）
 */
export default function DashboardPage() {
  return (
    <AppShell width="full" className="max-w-none">
      <Suspense fallback={<div className="p-6 text-[#78716C]">加载中...</div>}>
        <VideoSubmitPanel />
      </Suspense>
    </AppShell>
  );
}
