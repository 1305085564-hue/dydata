import { DemoNav } from "@/components/demo/demo-nav";
import { ScrollToTop } from "@/components/ui/scroll-to-top";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <DemoNav />
      <main className="app-main min-h-screen px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(var(--app-top-offset)+1.25rem)] sm:px-6">
        {children}
      </main>
      <ScrollToTop />
    </div>
  );
}
