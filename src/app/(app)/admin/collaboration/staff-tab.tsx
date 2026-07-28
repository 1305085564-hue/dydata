"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBigNumber, type StaffRow } from "./types";

interface StaffTabProps {
  rows: StaffRow[];
  role: "writer" | "editor";
  isLoading?: boolean;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
}

export function StaffTab({ rows, role, isLoading, onSelectPerson, onPrefetchPerson }: StaffTabProps) {
  const roleLabel = role === "writer" ? "文案" : "剪辑";

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 bg-white rounded-xl border border-zinc-200">
        <EmptyState
          title={`本月暂无${roleLabel}归属记录`}
          description="2026-07-27 起开始统计团队作品分工"
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-2xs">
      <Table>
        <TableHeader>
          <TableRow className="bg-zinc-50/70 hover:bg-zinc-50/70 text-[12px]">
            <TableHead className="text-left font-medium text-zinc-600 pl-4">姓名</TableHead>
            <TableHead className="text-right font-medium text-zinc-600">本月篇数 ↓</TableHead>
            <TableHead className="text-left font-medium text-zinc-600 pl-4">给谁做的</TableHead>
            <TableHead className="text-right font-medium text-zinc-600">
              总播放 <span className="text-[11px] font-normal text-zinc-400">（参考）</span>
            </TableHead>
            <TableHead className="text-right font-medium text-zinc-600">
              人均播放 <span className="text-[11px] font-normal text-zinc-400">（参考）</span>
            </TableHead>
            <TableHead className="text-right font-medium text-zinc-600 pr-4">自运营条数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-[13px]">
          {rows.map((row) => {
            const displayedAccounts = row.involvedAccounts.map((a) => a.accountName).join("、");
            const extraCount = row.involvedAccountTotal - row.involvedAccounts.length;

            return (
              <TableRow key={row.userId} className="hover:bg-zinc-50/50 transition-colors">
                <TableCell className="text-left font-medium pl-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelectPerson(row.userId)}
                    onMouseEnter={() => onPrefetchPerson?.(row.userId)}
                    onFocus={() => onPrefetchPerson?.(row.userId)}
                    className="text-zinc-900 hover:text-[#D97757] hover:underline transition-colors font-medium"
                  >
                    {row.name}
                  </button>
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-zinc-900 py-3">
                  {row.reportCount}
                </TableCell>
                <TableCell className="text-left py-3 pl-4 text-zinc-700">
                  <span>{displayedAccounts || "—"}</span>
                  {extraCount > 0 && (
                    <span className="ml-1 text-[11px] text-zinc-400">
                      等 {row.involvedAccountTotal} 个账号
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-700 py-3">
                  {formatBigNumber(row.totalPlay)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-700 py-3">
                  {formatBigNumber(row.avgPlay)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-400 py-3 pr-4">
                  {row.selfHandledCount}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
