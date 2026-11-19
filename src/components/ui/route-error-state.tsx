"use client";

import { Button } from "@/components/ui/button";

interface RouteErrorStateProps {
  title: string;
  description: string;
  reset: () => void;
}

/** 页面出错兜底：标题直说哪一页没打开，下一句说怎么办，一个「重试」。不加卡片、图标。 */
export function RouteErrorState({ title, description, reset }: RouteErrorStateProps) {
  return (
    <main className="flex min-h-[50dvh] flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <h1 className="font-serif text-[20px] leading-[1.25] text-[#141413]">{title}</h1>
      <p className="max-w-md text-[14px] leading-[1.60] text-[#78716C]">{description}</p>
      <Button type="button" variant="secondary" size="m" onClick={reset} className="mt-2">
        重试
      </Button>
    </main>
  );
}
