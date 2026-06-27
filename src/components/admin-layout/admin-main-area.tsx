"use client";

import { usePathname } from "next/navigation";

const FULLSCREEN_PATHS: string[] = [];

export function AdminMainArea({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullscreen = FULLSCREEN_PATHS.some((p) => pathname.startsWith(p));

  if (isFullscreen) {
    return <div className="w-full">{children}</div>;
  }

  return (
    <div className="w-full flex flex-col">
      {children}
    </div>
  );
}
