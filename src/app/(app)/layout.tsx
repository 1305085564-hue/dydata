import { NavBar } from "@/components/nav-bar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";

import { JoinBanner } from "./_components/join-banner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-main min-h-screen px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(var(--app-top-offset)+1.25rem)] sm:px-6">
        <JoinBanner />
        {children}
      </main>
      <ScrollToTop />
    </div>
  );
}
