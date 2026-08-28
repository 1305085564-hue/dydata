import type { Metadata } from "next";
import { Suspense } from "react";
import "@/styles/components/app-shell.css";
// dashboard.css 仍包含 content-tools、growth、admin 与通用 skeleton 使用的共享类；
// 只从公开首页剥离，不能缩到 /dashboard 子路由。
import "@/styles/components/dashboard.css";
import { NavBar } from "@/components/nav-bar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { NotificationProvider } from "@/components/notifications/notification-store";
import { PageViewTracker } from "@/components/usage-events/page-view-tracker";
import { DeferredGlobalTopicCreate } from "@/components/topics/deferred-global-topic-create";

import { JoinBanner } from "./_components/join-banner";
import { NetworkStatusBar } from "@/components/network-status-bar";

export const metadata: Metadata = {
  title: "工作台",
  description: "DYData 团队内部抖音数据工作台。",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider enabled>
      <div className="app-shell">
        <PageViewTracker />
        <NetworkStatusBar />
        <Suspense
          fallback={
            <div
              aria-hidden="true"
              className="fixed inset-x-0 top-0 z-50 h-[var(--app-top-offset)] border-b border-[#E5E0D6] bg-[#FBF9F5]/80 backdrop-blur-md"
            />
          }
        >
          <NavBar />
        </Suspense>
        <main className="app-main w-full min-h-screen px-3.5 pb-[calc(var(--app-bottom-offset,4.5rem)+1.25rem)] pt-[calc(var(--app-top-offset)+0.5rem)] sm:px-6 md:pb-[calc(2rem+env(safe-area-inset-bottom))] md:pt-[calc(var(--app-top-offset)+0.75rem)]">
          {/* JoinBanner 会在无团队/待审核时给出顶部工作台提示 */}
          <Suspense fallback={null}>
            <JoinBanner />
          </Suspense>
          {children}
        </main>
        <ScrollToTop />
        {/* 全局选题录入弹窗：任何页面都可以通过 triggerGlobalTopicCreate 触发 */}
        <DeferredGlobalTopicCreate />
      </div>
    </NotificationProvider>
  );
}
