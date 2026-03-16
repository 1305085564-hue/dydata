import { NavBar } from "@/components/nav-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="min-h-screen bg-muted/30 px-4 pb-8 pt-[calc(var(--app-top-offset)+2rem)] sm:px-6">
        {children}
      </main>
    </div>
  );
}
