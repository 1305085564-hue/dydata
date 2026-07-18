import type { Metadata } from "next";
import { NavBar } from "@/components/nav-bar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { getUserPermissions } from "@/lib/permissions";
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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const permissionInfo = await getUserPermissions();

  return (
    <NotificationProvider enabled={Boolean(permissionInfo)}>
      <div className="app-shell">
        <PageViewTracker />
        <NetworkStatusBar />
        <NavBar />
        {/* JoinBanner 现在只往通知中心注册条目，无视觉占位 */}
        <JoinBanner />
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
