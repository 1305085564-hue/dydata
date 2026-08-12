"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Star, Video } from "lucide-react";
import type { TalentRow } from "./types";
import { formatBigNumber } from "./types";

interface TalentTabProps {
  talents: TalentRow[];
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson: (userId: string) => void;
}

type SortField = "totalPlay" | "reportCount" | "hitCount" | "accountCount";

export function TalentTab({
  talents,
  onSelectPerson,
  onPrefetchPerson,
}: TalentTabProps) {
  const [sortField, setSortField] = useState<SortField>("totalPlay");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const list = [...talents];
    list.sort((a, b) => {
      const diff =
        sortOrder === "desc"
          ? b[sortField] - a[sortField]
          : a[sortField] - b[sortField];
      return diff || a.name.localeCompare(b.name, "zh-CN");
    });
    return list;
  }, [talents, sortField, sortOrder]);

  if (talents.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-2xs">
        <Video className="mx-auto size-8 text-zinc-300" />
        <p className="mt-3 text-[14px] font-medium text-zinc-500">
          本月暂无达人数据
        </p>
        <p className="mt-1 text-[12px] text-zinc-400">
          达人 = 名下有账号的出镜成员
        </p>
      </div>
    );
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === "desc" ? (
      <ChevronDown className="inline size-3 ml-0.5" />
    ) : (
      <ChevronUp className="inline size-3 ml-0.5" />
    );
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/60">
              <th className="py-2.5 pl-4 pr-2 text-left font-medium text-zinc-500 w-[140px]">
                达人
              </th>
              <th
                className="py-2.5 px-2 text-right font-medium text-zinc-500 cursor-pointer hover:text-zinc-900 transition-colors"
                onClick={() => toggleSort("accountCount")}
              >
                账号数
                <SortIcon field="accountCount" />
              </th>
              <th
                className="py-2.5 px-2 text-right font-medium text-zinc-500 cursor-pointer hover:text-zinc-900 transition-colors"
                onClick={() => toggleSort("reportCount")}
              >
                本月发布
                <SortIcon field="reportCount" />
              </th>
              <th
                className="py-2.5 px-2 text-right font-medium text-zinc-500 cursor-pointer hover:text-zinc-900 transition-colors"
                onClick={() => toggleSort("totalPlay")}
              >
                总播放
                <SortIcon field="totalPlay" />
              </th>
              <th
                className="py-2.5 px-2 text-right font-medium text-zinc-500 cursor-pointer hover:text-zinc-900 transition-colors"
                onClick={() => toggleSort("hitCount")}
              >
                爆款
                <SortIcon field="hitCount" />
              </th>
              <th className="py-2.5 px-2 text-left font-medium text-zinc-500">
                名下账号
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.userId}
                className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors cursor-pointer"
                onClick={() => onSelectPerson(row.userId)}
                onMouseEnter={() => onPrefetchPerson(row.userId)}
              >
                <td className="py-2.5 pl-4 pr-2">
                  <div className="flex items-center gap-1.5">
                    <Star className="size-3.5 text-[#F59E0B] fill-[#F59E0B] shrink-0" />
                    <span className="font-medium text-zinc-900 truncate">
                      {row.name}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-zinc-700">
                  {row.accountCount}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-zinc-700">
                  {row.reportCount}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-zinc-700">
                  {formatBigNumber(row.totalPlay)}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {row.hitCount > 0 ? (
                    <span className="text-[#D97757] font-semibold">
                      {row.hitCount}
                    </span>
                  ) : (
                    <span className="text-zinc-400">0</span>
                  )}
                </td>
                <td className="py-2.5 px-2">
                  <div className="flex flex-wrap gap-1">
                    {row.accounts.slice(0, 3).map((account) => (
                      <span
                        key={account.accountId}
                        className="inline-block px-1.5 py-0.5 rounded bg-zinc-100 text-[11px] text-zinc-600 truncate max-w-[100px]"
                        title={account.accountName}
                      >
                        {account.accountName}
                      </span>
                    ))}
                    {row.accounts.length > 3 && (
                      <span className="inline-block px-1.5 py-0.5 text-[11px] text-zinc-400">
                        +{row.accounts.length - 3}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
