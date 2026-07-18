import type { Metadata } from "next";
import { Suspense } from "react";
import "@/styles/components/app-shell.css";
// dashboard.css 仍包含 content-tools、growth、admin 与通用 skeleton 使用的共享类；
// 只从公开首页剥离，不能缩到 /dashboard 子路由。
import "@/styles/components/dashboard.css";
import { NavBar } from "@/components/nav-bar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { NotificationProvider } from "@/components/notifications/notification-store";
import { FeedbackNotificationBridge } from "@/components/notifications/feedback-notification-bridge";
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
              className="fixed inset-x-0 top-0 z-50 h-[var(--app-top-offset)] border-b border-stone-200/40 bg-stone-50/80 backdrop-blur-md"
            />
          }
        >
          <NavBar />
        </Suspense>
        {/* JoinBanner 现在只往通知中心注册条目，无视觉占位 */}
        <Suspense fallback={null}>
          <JoinBanner />
        </Suspense>
        <main className="app-main w-full min-h-screen px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(var(--app-top-offset)+1.25rem)] sm:px-6">
          {children}
        </main>
        <FeedbackNotificationBridge />
        <ScrollToTop />
        {/* 全局选题录入弹窗：任何页面都可以通过 triggerGlobalTopicCreate 触发 */}
        <DeferredGlobalTopicCreate />
      </div>
    </NotificationProvider>
  );
}
