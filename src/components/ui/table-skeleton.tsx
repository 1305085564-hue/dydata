"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TableSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  columnCount?: number;
  rowCount?: number;
  showHeader?: boolean;
}

export function TableSkeleton({
  columnCount = 6,
  rowCount = 5,
  showHeader = true,
  className,
  ...props
}: TableSkeletonProps) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm",
        className
      )}
      {...props}
    >
      <table className="w-full border-collapse text-[13px]">
        {showHeader && (
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/10">
              {Array.from({ length: columnCount }).map((_, i) => (
                <th
                  key={i}
                  className="h-9 px-3 text-left align-middle text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400"
                >
                  <div className="h-3 w-16 animate-pulse-soft rounded bg-zinc-200/60 dark:bg-zinc-700/60" />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-b-0 [&:nth-child(even)]:bg-zinc-50/20 dark:[&:nth-child(even)]:bg-zinc-800/5"
            >
              {Array.from({ length: columnCount }).map((_, colIndex) => {
                // Vary width for a more natural feel
                const widths = ["w-2/3", "w-1/2", "w-3/4", "w-5/6", "w-11/12"];
                const widthClass = widths[(rowIndex + colIndex) % widths.length];

                return (
                  <td key={colIndex} className="px-3 py-2.5 align-middle">
                    <div
                      className={cn(
                        "h-4 animate-pulse-soft rounded bg-zinc-100 dark:bg-zinc-800",
                        widthClass
                      )}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
