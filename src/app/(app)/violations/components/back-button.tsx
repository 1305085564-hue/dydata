"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function BackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-[12px] font-normal text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-700 active:translate-y-0"
    >
      <ArrowLeft className="size-3.5 stroke-[1.5]" />
      返回
    </button>
  );
}
