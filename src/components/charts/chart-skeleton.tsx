"use client";

import { cn } from "@/lib/utils";

interface ChartSkeletonProps {
  className?: string;
}

export function ChartSkeleton({ className }: ChartSkeletonProps) {
  return (
    <div
      className={cn(
        "chart-skeleton relative flex h-full w-full overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-y-0 left-[-35%] w-[32%] -skew-x-12 rounded-full bg-gradient-to-r from-transparent via-white/45 to-transparent blur-2xl chart-skeleton-sweep" />

      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-3 w-20 rounded-full bg-muted" />
          <div className="h-3 w-32 rounded-full bg-muted/80" />
        </div>
        <div className="h-8 w-24 rounded-2xl bg-muted/80" />
      </div>

      <div className="relative flex-1 overflow-hidden rounded-2xl border border-border/40 bg-muted/[0.14] px-4 py-5">
        <div className="absolute inset-y-5 left-4 w-px bg-border/80" />
        <div className="absolute inset-x-4 bottom-5 h-px bg-border/80" />

        <svg aria-hidden="true" viewBox="0 0 320 180" className="h-full w-full text-slate-300">
          <defs>
            <linearGradient id="chart-skeleton-wave-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
              <stop offset="40%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="50%" stopColor="white" stopOpacity="0.95" />
              <stop offset="60%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.14" />
            </linearGradient>
          </defs>
          <path d="M22 24v122" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
          <path d="M22 146h274" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
          <path d="M34 132c18-20 30-18 48-30 18-12 26-40 42-38 20 2 26 38 44 39 18 1 28-30 44-32 16-2 22 12 34 5" className="chart-skeleton-wave chart-skeleton-wave-primary" stroke="url(#chart-skeleton-wave-gradient)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M34 119c20-14 34-18 46-14 17 6 24 28 39 28 16 0 24-19 40-18 14 1 21 12 31 12 12 0 22-9 34-14" className="chart-skeleton-wave chart-skeleton-wave-secondary" stroke="url(#chart-skeleton-wave-gradient)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.7" />
          <path d="M34 105c18-10 30-13 40-10 14 4 24 18 37 18 14 0 22-14 34-14 10 0 17 7 27 7 10 0 20-7 31-10" className="chart-skeleton-wave chart-skeleton-wave-tertiary" stroke="url(#chart-skeleton-wave-gradient)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.45" />
        </svg>
      </div>

      <style jsx>{`
        .chart-skeleton-sweep {
          animation: chart-skeleton-sweep 2.4s ease-in-out infinite;
        }

        .chart-skeleton-wave {
          stroke-dasharray: 24 128;
          animation: chart-skeleton-wave 1.9s linear infinite;
        }

        .chart-skeleton-wave-secondary {
          animation-duration: 2.2s;
        }

        .chart-skeleton-wave-tertiary {
          animation-duration: 2.5s;
        }

        @keyframes chart-skeleton-sweep {
          0% {
            transform: translateX(0);
            opacity: 0;
          }
          18% {
            opacity: 0.45;
          }
          55% {
            opacity: 0.65;
          }
          100% {
            transform: translateX(520%);
            opacity: 0;
          }
        }

        @keyframes chart-skeleton-wave {
          0% {
            stroke-dashoffset: 180;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}
