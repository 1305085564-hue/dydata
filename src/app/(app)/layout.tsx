import { NavBar } from "@/components/nav-bar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <NavBar />
      <main
        className="min-h-screen px-4 pb-8 pt-[calc(var(--app-top-offset)+2rem)] sm:px-6"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(224,231,255,0.2) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(199,210,254,0.15) 0%, transparent 50%), hsl(var(--muted) / 0.3)",
        }}
      >
        {children}
      </main>
      <ScrollToTop />
    </div>
  );
}
