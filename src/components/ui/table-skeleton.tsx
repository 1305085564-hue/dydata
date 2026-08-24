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
        "w-full overflow-hidden rounded-xl border border-[#E5E0D6] bg-transparent",
        className
      )}
      {...props}
    >
      <table className="w-full border-collapse text-[13px]">
        {showHeader && (
          <thead>
            <tr className="border-b border-[#E5E0D6] bg-[#FBF9F5]/50">
              {Array.from({ length: columnCount }).map((_, i) => (
                <th
                  key={i}
                  className="h-9 px-3 text-left align-middle text-[12px] font-medium text-[#78716C]"
                >
                  <div className="h-3 w-16 animate-pulse-claude rounded bg-[#E5E0D6]/60" />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="bg-white">
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-[#ECE7DE] last:border-b-0 [&:nth-child(even)]:bg-[#FBF9F5]/30"
            >
              {Array.from({ length: columnCount }).map((_, colIndex) => {
                // Vary width for a more natural feel
                const widths = ["w-2/3", "w-1/2", "w-3/4", "w-5/6", "w-11/12"];
                const widthClass = widths[(rowIndex + colIndex) % widths.length];

                return (
                  <td key={colIndex} className="px-3 py-2.5 align-middle">
                    <div
                      className={cn(
                        "h-4 animate-pulse-claude rounded bg-[#F5F3EE]",
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
