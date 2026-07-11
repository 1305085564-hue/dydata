"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface TableProps extends React.ComponentProps<"table"> {
  freezeFirst?: boolean
}

function Table({ className, freezeFirst, ...props }: TableProps) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        data-freeze-first={freezeFirst}
        className={cn(
          "w-full caption-bottom text-[13px] text-stone-700 dark:text-[#E7E5E4] tabular-nums",
          freezeFirst && [
            "[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-30 [&_th:first-child]:bg-white/95 [&_th:first-child]:backdrop-blur-md [&_th:first-child]:dark:bg-stone-900/95",
            "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-20 [&_td:first-child]:bg-white [&_td:first-child]:dark:bg-stone-900",
            "[&_th:first-child]:after:content-[''] [&_th:first-child]:after:absolute [&_th:first-child]:after:right-0 [&_th:first-child]:after:top-0 [&_th:first-child]:after:bottom-0 [&_th:first-child]:after:w-[8px] [&_th:first-child]:after:translate-x-full [&_th:first-child]:after:bg-gradient-to-r [&_th:first-child]:after:from-black/[0.03] [&_th:first-child]:after:to-transparent [&_th:first-child]:after:pointer-events-none [&_th:first-child]:after:dark:from-black/10",
            "[&_td:first-child]:after:content-[''] [&_td:first-child]:after:absolute [&_td:first-child]:after:right-0 [&_td:first-child]:after:top-0 [&_td:first-child]:after:bottom-0 [&_td:first-child]:after:w-[8px] [&_td:first-child]:after:translate-x-full [&_td:first-child]:after:bg-gradient-to-r [&_td:first-child]:after:from-black/[0.03] [&_td:first-child]:after:to-transparent [&_td:first-child]:after:pointer-events-none [&_td:first-child]:after:dark:from-black/10",
            "[&_tr:nth-child(even)_td:first-child]:bg-stone-50/50 [&_tr:nth-child(even)_td:first-child]:dark:bg-stone-800/20",
            "[&_tr:hover_td:first-child]:bg-stone-100 [&_tr:hover_td:first-child]:dark:bg-stone-800"
          ],
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("sticky top-0 z-10 backdrop-blur-md bg-white/90 dark:bg-stone-900/90", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:nth-child(even)]:bg-stone-50/50", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-stone-50 font-medium text-stone-700",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-stone-100 data-[state=selected]:bg-stone-50",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 px-3 text-left align-middle whitespace-nowrap text-[12px] font-medium text-stone-500 [&:has([role=checkbox])]:pr-0 sticky top-0 z-10 backdrop-blur-md bg-white/90 dark:bg-stone-900/90",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "py-2.5 px-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-[13px] text-stone-500", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
