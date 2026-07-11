"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReloadButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border-stone-200 bg-white px-3 text-[12px] font-medium text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-700 disabled:opacity-50"
    >
      <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "正在加载..." : "重新加载"}
    </Button>
  );
}
