"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { HealthBar } from "./health-bar";
import { OperatorTab } from "./operator-tab";
import { StaffTab } from "./staff-tab";
import { TalentTab } from "./talent-tab";
import { prefetchPersonData } from "./person-data";
import type { OperatorRow, StaffRow, SummaryData, TalentRow } from "./types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// 图表弹窗按需加载：recharts 只在首次点开个人档案卡时才下载
const PersonalCard = dynamic(
  () => import("./personal-card").then((mod) => mod.PersonalCard),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <Loader2 className="size-6 animate-spin text-[#78716C]" />
      </div>
    ),
  },
);

function preloadPersonalCardChunk() {
  void import("./personal-card");
}

function prefetchPerson(
  id: string,
  year: number,
  month: number,
) {
  preloadPersonalCardChunk();
  prefetchPersonData(id, year, month);
}

type TabKey = "talents" | "operators" | "writers" | "editors";

interface CollaborationWorkbenchProps {
  year: number;
  month: number;
  defaultTab: TabKey;
  summary: SummaryData | null;
  operators: OperatorRow[];
  talents: TalentRow[];
  isOwnerOrTeamAdmin: boolean;
  /** 首屏共享数据集加载失败：明确报错，不把失败伪装成空数据 */
  loadFailed?: boolean;
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
  loadFailed = false,
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
    <div className="space-y-6">
      {/* 整合型流线控制舱：裸铺自然分层 */}
      <div className="space-y-3.5 pb-4 border-b border-[#ECE7DE]/80">
        {/* 控制舱顶栏：月份快捷翻页与标题 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#ECE7DE]/60">
          <div className="flex items-center gap-3">
            {/* 快捷翻月控制组 */}
            <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-[#E5E0D6] shadow-2xs">
              <button
                type="button"
                onClick={handlePrevMonth}
                title="上一月"
                className="size-7 rounded flex items-center justify-center text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F3EE] transition-colors cursor-pointer"
              >
                <ChevronLeft className="size-4" />
              </button>
              <div className="w-36">
                <Select value={currentMonthValue} onValueChange={handleMonthChange}>
                  <SelectTrigger className="h-7 text-[13px] bg-transparent border-0 shadow-none font-medium hover:bg-[#FBF9F5] transition-colors focus-visible:ring-0 outline-none cursor-pointer">
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
              <button
                type="button"
                onClick={handleNextMonth}
                title="下一月"
                className="size-7 rounded flex items-center justify-center text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F3EE] transition-colors cursor-pointer"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <span className="text-[14px] font-semibold text-[#1C1917]">
              {year} 年 {month} 月 团队协作概览
            </span>
          </div>

          {/* 右侧：健康度极轻静默芯片 */}
          <HealthBar summary={summary} />
        </div>

        {loadFailed && (
          <div className="rounded-xl border border-[#C0685C]/30 bg-[#C0685C]/5 px-4 py-3 text-[13px] text-[#C0685C]">
            协作数据加载失败，当前展示为空；请刷新重试。
          </div>
        )}

        {/* 暖橙主体风格导航 Tab */}
        <div className="flex items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => handleTabChange("talents")}
            className={`px-4 py-2 text-[13px] font-medium rounded-lg transition-colors duration-100 cursor-pointer ${
              tab === "talents"
                ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
            }`}
          >
            达人 ({talents.length})
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("operators")}
            className={`px-4 py-2 text-[13px] font-medium rounded-lg transition-colors duration-100 cursor-pointer ${
              tab === "operators"
                ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
            }`}
          >
            运营团队 ({operators.length})
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("writers")}
            className={`px-4 py-2 text-[13px] font-medium rounded-lg transition-colors duration-100 cursor-pointer ${
              tab === "writers"
                ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
            }`}
          >
            文案人员
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("editors")}
            className={`px-4 py-2 text-[13px] font-medium rounded-lg transition-colors duration-100 cursor-pointer ${
              tab === "editors"
                ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
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
          onPrefetchPerson={(id) => prefetchPerson(id, year, month)}
        />
      ) : tab === "operators" ? (
        <OperatorTab
          operators={operators}
          onSelectPerson={(id) => setSelectedPersonId(id)}
          onPrefetchPerson={(id) => prefetchPerson(id, year, month)}
        />
      ) : (
        <StaffTab
          rows={currentStaffRows}
          role={tab === "writers" ? "writer" : "editor"}
          isLoading={staffLoading && currentStaffRows.length === 0}
          onSelectPerson={(id) => setSelectedPersonId(id)}
          onPrefetchPerson={(id) => prefetchPerson(id, year, month)}
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
