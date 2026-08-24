import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[100dvh] flex-col bg-claude-canvas">
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto px-5 pb-2 pt-[calc(env(safe-area-inset-top)+20px)]">
          {children}
        </main>
        <MobileTabBar />
      </div>
    </div>
  );
}
