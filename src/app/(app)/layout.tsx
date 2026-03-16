import { NavBar } from "@/components/nav-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
