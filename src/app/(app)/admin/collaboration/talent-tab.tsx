"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Star, Video } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { TalentRow } from "./types";
import { formatBigNumber } from "./types";

interface TalentTabProps {
  talents: TalentRow[];
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson: (userId: string) => void;
}

type SortField = "totalPlay" | "reportCount" | "hitCount" | "accountCount";

function SortIcon({
  field,
  sortField,
  sortOrder,
}: {
  field: SortField;
  sortField: SortField;
  sortOrder: "asc" | "desc";
}) {
  if (sortField !== field) return null;
  return sortOrder === "desc" ? (
    <ChevronDown className="inline size-3 ml-0.5" />
  ) : (
    <ChevronUp className="inline size-3 ml-0.5" />
  );
}

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
      <div className="py-12 text-center">
        <EmptyState
          variant="collaboration"
          size={88}
          title="本月静待达人协同立卷"
          description="名下有账号的出镜成员作品发布后，此处将汇聚达人产出与转化数据。"
        />
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

  return (
    <div className="rounded-xl border border-[#ECE7DE] bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#ECE7DE]/60 bg-transparent text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
              <th className="py-2.5 pl-4 pr-2 text-left font-medium text-[#78716C] w-[140px]">
                达人
              </th>
              <th
                className="py-2.5 px-2 text-right font-medium text-[#78716C] cursor-pointer hover:text-[#1C1917] transition-colors"
                onClick={() => toggleSort("accountCount")}
              >
                账号数
                <SortIcon field="accountCount" sortField={sortField} sortOrder={sortOrder} />
              </th>
              <th
                className="py-2.5 px-2 text-right font-medium text-[#78716C] cursor-pointer hover:text-[#1C1917] transition-colors"
                onClick={() => toggleSort("reportCount")}
              >
                本月发布
                <SortIcon field="reportCount" sortField={sortField} sortOrder={sortOrder} />
              </th>
              <th
                className="py-2.5 px-2 text-right font-medium text-[#78716C] cursor-pointer hover:text-[#1C1917] transition-colors"
                onClick={() => toggleSort("totalPlay")}
              >
                总播放
                <SortIcon field="totalPlay" sortField={sortField} sortOrder={sortOrder} />
              </th>
              <th
                className="py-2.5 px-2 text-right font-medium text-[#78716C] cursor-pointer hover:text-[#1C1917] transition-colors"
                onClick={() => toggleSort("hitCount")}
              >
                爆款
                <SortIcon field="hitCount" sortField={sortField} sortOrder={sortOrder} />
              </th>
              <th className="py-2.5 px-2 text-left font-medium text-[#78716C]">
                名下账号
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.userId}
                className="border-b border-[#ECE7DE] hover:bg-[#FBF9F5]/50 transition-colors cursor-pointer"
                onClick={() => onSelectPerson(row.userId)}
                onMouseEnter={() => onPrefetchPerson(row.userId)}
              >
                <td className="py-2.5 pl-4 pr-2">
                  <div className="flex items-center gap-1.5">
                    <Star className="size-3.5 text-[#D99E55] fill-[#D99E55] shrink-0" />
                    <span className="font-serif font-semibold text-[#1C1917] truncate tracking-tight">
                      {row.name}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-[#292524]">
                  {row.accountCount}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-[#292524]">
                  {row.reportCount}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-[#292524]">
                  {formatBigNumber(row.totalPlay)}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {row.hitCount > 0 ? (
                    <span className="text-[#D97757] font-semibold">
                      {row.hitCount}
                    </span>
                  ) : (
                    <span className="text-[#78716C]">0</span>
                  )}
                </td>
                <td className="py-2.5 px-2">
                  <div className="flex flex-wrap gap-1">
                    {row.accounts.slice(0, 3).map((account) => (
                      <span
                        key={account.accountId}
                        className="inline-block px-1.5 py-0.5 rounded bg-[#F5F3EE] text-[11px] text-[#292524] truncate max-w-[100px]"
                        title={account.accountName}
                      >
                        {account.accountName}
                      </span>
                    ))}
                    {row.accounts.length > 3 && (
                      <span className="inline-block px-1.5 py-0.5 text-[11px] text-[#78716C]">
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
