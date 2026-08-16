"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HealthBar } from "./health-bar";
import { OperatorTab } from "./operator-tab";
import { StaffTab } from "./staff-tab";
import { TalentTab } from "./talent-tab";
import { PersonalCard, prefetchPersonData } from "./personal-card";
import type { OperatorRow, StaffRow, SummaryData, TalentRow } from "./types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TabKey = "talents" | "operators" | "writers" | "editors";

interface CollaborationWorkbenchProps {
  year: number;
  month: number;
  defaultTab: TabKey;
  summary: SummaryData | null;
  operators: OperatorRow[];
  talents: TalentRow[];
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
  talents,
}: CollaborationWorkbenchProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(defaultTab);
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

  const handleTabChange = (nextTab: TabKey) => {
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

  const handlePrevMonth = () => {
    let prevY = year;
    let prevM = month - 1;
    if (prevM < 1) {
      prevM = 12;
      prevY--;
    }
    if (prevY < 2026 || (prevY === 2026 && prevM < 7)) return;
    router.push(`/admin/collaboration?year=${prevY}&month=${prevM}&tab=${tab}`);
  };

  const handleNextMonth = () => {
    const now = new Date();
    let nextY = year;
    let nextM = month + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY++;
    }
    const currentY = now.getFullYear();
    const currentM = now.getMonth() + 1;
    if (nextY > currentY || (nextY === currentY && nextM > currentM)) return;
    router.push(`/admin/collaboration?year=${nextY}&month=${nextM}&tab=${tab}`);
  };

  const currentStaffRows = useMemo(() => {
    if (tab === "operators") return [];
    const role = tab === "writers" ? "writer" : "editor";
    const key = `${year}-${month}-${role}`;
    return staffCache[key] ?? [];
  }, [tab, year, month, staffCache]);

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
      {/* 整合型流线控制舱：去盒子化平铺 */}
      <div className="flex flex-col gap-3 py-1">
        {/* 控制舱顶栏：月份快捷翻页与标题 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* 快捷翻月控制组 (微底气垫) */}
            <div className="flex items-center gap-0.5 bg-zinc-100/70 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={handlePrevMonth}
                title="上一月"
                className="size-7 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-950 hover:bg-white active:scale-95 transition-all cursor-pointer"
              >
                <ChevronLeft className="size-4" />
              </button>
              <div className="w-32">
                <Select value={currentMonthValue} onValueChange={handleMonthChange}>
                  <SelectTrigger className="h-7 text-xs bg-transparent border-0 shadow-none font-medium text-zinc-800 hover:text-zinc-950 transition-colors focus:ring-0">
                    <SelectValue placeholder="选择月份" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                title="下一月"
                className="size-7 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-950 hover:bg-white active:scale-95 transition-all cursor-pointer"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <span className="text-[14px] font-semibold text-zinc-950 tracking-tight">
              {year} 年 {month} 月 团队协作概览
            </span>
          </div>

          {/* 右侧：健康度极轻静默芯片 */}
          <HealthBar summary={summary} />
        </div>

        {/* 角色导航 Tab (微气垫岛屿平铺) */}
        <div className="inline-flex items-center gap-1 bg-zinc-100/70 p-1 rounded-xl select-none w-fit">
          <button
            type="button"
            onClick={() => handleTabChange("talents")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer ${
              tab === "talents"
                ? "bg-white text-zinc-950 shadow-2xs font-medium"
                : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50"
            }`}
          >
            达人 ({talents.length})
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("operators")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer ${
              tab === "operators"
                ? "bg-white text-zinc-950 shadow-2xs font-medium"
                : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50"
            }`}
          >
            运营团队 ({operators.length})
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("writers")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer ${
              tab === "writers"
                ? "bg-white text-zinc-950 shadow-2xs font-medium"
                : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50"
            }`}
          >
            文案人员
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("editors")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer ${
              tab === "editors"
                ? "bg-white text-zinc-950 shadow-2xs font-medium"
                : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50"
            }`}
          >
            剪辑人员
          </button>
        </div>
      </div>

      {/* Tab Content 区域 */}
      {tab === "talents" ? (
        <TalentTab
          talents={talents}
          onSelectPerson={(id) => setSelectedPersonId(id)}
          onPrefetchPerson={(id) => prefetchPersonData(id, year, month)}
        />
      ) : tab === "operators" ? (
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

      {/* 个人档案卡对话框 */}
      <PersonalCard
        userId={selectedPersonId}
        year={year}
        month={month}
        onClose={() => setSelectedPersonId(null)}
      />
    </div>
  );
}
