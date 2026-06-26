"use client";

import { usePathname } from "next/navigation";

const FULLSCREEN_PATHS: string[] = [];

export function AdminMainArea({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullscreen = FULLSCREEN_PATHS.some((p) => pathname.startsWith(p));

  if (isFullscreen) {
    return <main className="flex-1 overflow-hidden">{children}</main>;
  }

  return (
    <main className="flex-1 overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1400px] flex-col overflow-y-auto px-6 py-8">{children}</div>
    </main>
  );
}
