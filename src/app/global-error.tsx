"use client";

import { useEffect } from "react";

import { captureRouteError } from "@/lib/sentry/capture-route-error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global] unhandled error", error);
    captureRouteError(error, "global");
  }, [error]);

  return (
    <html lang="zh-CN">
      <body className="tabular-nums">
        <main className="flex min-h-screen min-h-dvh flex-col items-center justify-center gap-2 bg-[#FCFCFB] px-4 py-12 text-center">
          <h1 className="font-serif text-[20px] leading-[1.25] text-[#141413]">页面出错了</h1>
          <p className="text-[14px] leading-[1.60] text-[#78716C]">刷新一下通常就好。</p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 inline-flex h-7 cursor-pointer items-center rounded-md border border-[#E2E2DF] bg-white px-3 text-[14px] text-[#1F1E1D] transition-colors duration-150 hover:bg-[#EBEBE9]"
          >
            重试
          </button>
        </main>
      </body>
    </html>
  );
}
