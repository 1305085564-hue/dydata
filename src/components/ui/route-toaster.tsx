"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const Toaster = dynamic(
  () => import("@/components/ui/sonner").then((module) => module.Toaster),
  { ssr: false },
);

export function RouteToaster() {
  const pathname = usePathname();

  if (pathname === "/") return null;
  return <Toaster richColors position="top-right" />;
}
