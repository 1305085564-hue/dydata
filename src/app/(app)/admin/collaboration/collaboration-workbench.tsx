"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HealthBar } from "./health-bar";
import { OperatorTab } from "./operator-tab";
import { StaffTab } from "./staff-tab";
import { PersonalCard, prefetchPersonData } from "./personal-card";
import type { OperatorRow, StaffRow, SummaryData } from "./types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CollaborationWorkbenchProps {
  year: number;
  month: number;
  defaultTab: "operators" | "writers" | "editors";
  summary: SummaryData | null;
  operators: OperatorRow[];
  isOwnerOrTeamAdmin: boolean;
}

function generateMonthOptions() {
  const options: Array<{ year: number; month: number; label: string; value: string }> = [];
  const startYear = 2026;
  const startMonth = 7; // Earliest allowed month 2026-07

  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth() + 1;

  if (currentYear < 2026 || (currentYear === 2026 && currentMonth < 7)) {
    currentYear = 2026;
    currentMonth = 7;
  }

  let y = currentYear;
  let m = currentMonth;

  for (let i = 0; i < 12; i++) {
    if (y < startYear || (y === startYear && m < startMonth)) break;
    options.push({
      year: y,
      month: m,
      label: `${y} 年 ${m} 月`,
      value: `${y}-${m}`,
    });
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
  }

  return options;
}

export function CollaborationWorkbench({
  year,
  month,
  defaultTab,
  summary,
  operators,
}: CollaborationWorkbenchProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"operators" | "writers" | "editors">(defaultTab);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const [staffCache, setStaffCache] = useState<Record<string, StaffRow[]>>({});
  const [staffLoading, setStaffLoading] = useState(false);

  const monthOptions = useMemo(() => generateMonthOptions(), []);
  const currentMonthValue = `${year}-${month}`;

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const fetchStaffData = (targetRole: "writer" | "editor") => {
    const key = `${year}-${month}-${targetRole}`;
    if (staffCache[key]) return;

    setStaffLoading(true);
    fetch(`/api/admin/collaboration/staff?year=${year}&month=${month}&role=${targetRole}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "加载数据失败");
        return data as StaffRow[];
      })
      .then((rows) => {
        setStaffCache((prev) => ({ ...prev, [key]: rows }));
      })
      .catch((err) => {
        console.error("Failed to fetch staff data", err);
      })
      .finally(() => {
        setStaffLoading(false);
      });
  };

  const handleTabChange = (nextTab: "operators" | "writers" | "editors") => {
    setTab(nextTab);
    router.push(`/admin/collaboration?year=${year}&month=${month}&tab=${nextTab}`, { scroll: false });
    if (nextTab === "writers") {
      fetchStaffData("writer");
    } else if (nextTab === "editors") {
      fetchStaffData("editor");
    }
  };

  const handleMonthChange = (val: string | null) => {
    if (!val) return;
    const [y, m] = val.split("-");
    router.push(`/admin/collaboration?year=${y}&month=${m}&tab=${tab}`);
  };

  const currentStaffRows = useMemo(() => {
    if (tab === "operators") return [];
    const role = tab === "writers" ? "writer" : "editor";
    const key = `${year}-${month}-${role}`;
    return staffCache[key] ?? [];
  }, [tab, year, month, staffCache]);

  return (
    <div className="space-y-4">
      {/* Month Bar */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-zinc-200 p-3 shadow-2xs">
        <div className="w-48">
          <Select value={currentMonthValue} onValueChange={handleMonthChange}>
            <SelectTrigger className="h-9 text-[13px] bg-zinc-50 border-zinc-200 font-medium">
              <SelectValue placeholder="选择月份" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-[13px]">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-[14px] font-medium text-zinc-900 pr-2">
          {year} 年 {month} 月 协作概览
        </div>
      </div>

      {/* Health Bar */}
      <HealthBar summary={summary} />

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-200 pb-0.5">
        <button
          type="button"
          onClick={() => handleTabChange("operators")}
          className={`px-4 py-2 text-[13px] font-medium rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
            tab === "operators"
              ? "border-[#D97757] text-[#D97757] bg-white font-semibold"
              : "border-transparent text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
          }`}
        >
          运营团队 ({operators.length})
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("writers")}
          className={`px-4 py-2 text-[13px] font-medium rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
            tab === "writers"
              ? "border-[#D97757] text-[#D97757] bg-white font-semibold"
              : "border-transparent text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
          }`}
        >
          文案人员
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("editors")}
          className={`px-4 py-2 text-[13px] font-medium rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
            tab === "editors"
              ? "border-[#D97757] text-[#D97757] bg-white font-semibold"
              : "border-transparent text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
          }`}
        >
          剪辑人员
        </button>
      </div>

      {/* Tab Content */}
      {tab === "operators" ? (
        <OperatorTab
          operators={operators}
          onSelectPerson={(id) => setSelectedPersonId(id)}
          onPrefetchPerson={(id) => prefetchPersonData(id, year, month)}
        />
      ) : (
        <StaffTab
          rows={currentStaffRows}
          role={tab === "writers" ? "writer" : "editor"}
          isLoading={staffLoading && currentStaffRows.length === 0}
          onSelectPerson={(id) => setSelectedPersonId(id)}
          onPrefetchPerson={(id) => prefetchPersonData(id, year, month)}
        />
      )}

      {/* Personal Card Sheet */}
      <PersonalCard
        userId={selectedPersonId}
        year={year}
        month={month}
        onClose={() => setSelectedPersonId(null)}
      />
    </div>
  );
}
