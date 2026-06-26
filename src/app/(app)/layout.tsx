import { NavBar } from "@/components/nav-bar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { getUserPermissions } from "@/lib/permissions";
import { NotificationProvider } from "@/components/notifications/notification-store";
import { FeedbackNotificationBridge } from "@/components/notifications/feedback-notification-bridge";

import { JoinBanner } from "./_components/join-banner";
import { NetworkStatusBar } from "@/components/network-status-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const permissionInfo = await getUserPermissions();

  return (
    <NotificationProvider enabled={Boolean(permissionInfo)}>
      <div className="app-shell">
        <NetworkStatusBar />
        <NavBar />
        {/* JoinBanner 现在只往通知中心注册条目，无视觉占位 */}
        <JoinBanner />
        <main className="app-main min-h-screen px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(var(--app-top-offset)+1.25rem)] sm:px-6">
          {children}
        </main>
        <FeedbackNotificationBridge />
        <ScrollToTop />
      </div>
    </NotificationProvider>
  );
}
