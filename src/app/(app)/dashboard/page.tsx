import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardRedesignContainer } from "./redesign/dashboard-redesign-container";
import { DashboardRedesignSkeleton } from "./redesign/dashboard-redesign-skeleton";

export const metadata: Metadata = {
  title: "工作台 - DYData",
  description: "记录抖音运营数据，查看团队进度与今日待办。",
};

/**
 * 今日提交页面 - 从零重写版
 * 基于 Claude 设计哲学：人文出版物感 + 温润不刺眼 + 安静搭档
 */
export default function DashboardPageRedesign() {
  return (
    <AppShell width="full" className="dashboard-redesign max-w-none">
      <Suspense fallback={<DashboardRedesignSkeleton />}>
        <DashboardRedesignContainer />
      </Suspense>
    </AppShell>
  );
}
