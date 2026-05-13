import { NavBar } from "@/components/nav-bar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { canUseAiManagement } from "@/lib/permission-utils";
import { AiAssistantFloatingWindow } from "@/components/ai-assistant/ai-assistant-floating-window";
import type { UserRole } from "@/types";

import { JoinBanner } from "./_components/join-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let showFloatingAssistant = false;
  let floatingRole: UserRole = "member";

  if (user) {
    const permissionInfo = await getUserPermissions();

    if (permissionInfo) {
      if (canUseAiManagement(permissionInfo.businessRole, permissionInfo.permissions)) {
        showFloatingAssistant = true;
        floatingRole = permissionInfo.role;
      }
    }
  }

  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-main min-h-screen px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(var(--app-top-offset)+1.25rem)] sm:px-6">
        <JoinBanner />
        {children}
      </main>
      <ScrollToTop />
      {showFloatingAssistant ? <AiAssistantFloatingWindow actorRole={floatingRole} /> : null}
    </div>
  );
}
