"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global] unhandled error", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body className="antialiased tabular-nums">
        <main className="flex min-h-screen items-center justify-center px-4 py-12">
          <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-[#E5E0D6] bg-white px-8 py-10 text-center">
            <p className="text-[48px] font-semibold leading-none text-[#E5E0D6]">!</p>
            <h1 className="text-lg font-medium text-[#1C1917]">页面出错了</h1>
            <p className="text-sm leading-6 text-[#78716C]">
              发生了意外错误，请刷新页面或稍后再试。
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-2 inline-flex h-9 items-center rounded-lg border border-[#E5E0D6] bg-white px-4 text-[13px] font-medium text-[#1C1917] transition-colors hover:bg-[#FBF9F5]"
            >
              重试
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
