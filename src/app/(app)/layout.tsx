import { NavBar } from "@/components/nav-bar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { getUserPermissions } from "@/lib/permissions";
import { canUseAiManagement } from "@/lib/permission-utils";
import { AiAssistantFloatingWindow } from "@/components/ai-assistant/ai-assistant-floating-window";
import { AlertContextProvider } from "@/components/ai-assistant/alert-context-store";
import { NotificationProvider } from "@/components/notifications/notification-store";
import type { UserRole } from "@/types";

import { JoinBanner } from "./_components/join-banner";
import { NetworkStatusBar } from "@/components/network-status-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const permissionInfo = await getUserPermissions();
  let showFloatingAssistant = false;
  let floatingRole: UserRole = "member";

  if (permissionInfo && canUseAiManagement(permissionInfo.businessRole, permissionInfo.permissions)) {
    showFloatingAssistant = true;
    floatingRole = permissionInfo.role;
  }

  return (
    <AlertContextProvider>
      <NotificationProvider enabled={Boolean(permissionInfo)}>
        <div className="app-shell">
          <NetworkStatusBar />
          <NavBar />
          {/* JoinBanner 现在只往通知中心注册条目，无视觉占位 */}
          <JoinBanner />
          <main className="app-main min-h-screen px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(var(--app-top-offset)+1.25rem)] sm:px-6">
            {children}
          </main>
          <ScrollToTop />
          {showFloatingAssistant ? <AiAssistantFloatingWindow actorRole={floatingRole} /> : null}
        </div>
      </NotificationProvider>
    </AlertContextProvider>
  );
}
