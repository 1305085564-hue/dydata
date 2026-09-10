"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { HealthBar } from "./health-bar";
import { OperatorTab } from "./operator-tab";
import { WriterTab, type WriterCandidateRow } from "./writer-tab";
import { StaffTab } from "./staff-tab";
import { TalentTab } from "./talent-tab";
import { prefetchPersonData } from "./person-data";
import type { OperatorRow, StaffRow, SummaryData, TalentRow } from "./types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { getShanghaiYearMonth } from "@/lib/loaders/shared";
import {
  CollaborationDiagnosisContext,
  type CollaborationDiagnosisDetail,
} from "@/components/admin/collaboration-work-review-link";

// 图表弹窗按需加载：recharts 只在首次点开个人档案卡时才下载
const PersonalCard = dynamic(
  () => import("./personal-card").then((mod) => mod.PersonalCard),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex justify-end bg-[#1C1917]/20 backdrop-blur-[1px]">
        <div className="w-full max-w-2xl bg-white border-l border-[#E2E2DF] shadow-claude-dialog flex flex-col">
          {/* 档案卡头部骨架 */}
          <div className="px-6 py-4 border-b border-[#E2E2DF] flex items-center justify-between shrink-0 bg-[#FCFCFB]/40">
            <div className="space-y-1.5">
              <Skeleton className="h-6 w-32 rounded-md" />
              <Skeleton className="h-4 w-48 rounded-md" />
            </div>
            <Skeleton className="size-7 rounded-lg" />
          </div>
          {/* 档案卡内容区骨架 */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-28 rounded-md" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            </div>
            <div className="rounded-xl bg-white p-4 space-y-3 shadow-card-ring">
              <Skeleton className="h-4 w-36 rounded-md" />
              <Skeleton className="h-44 w-full rounded-xl" />
            </div>
            <div className="rounded-xl bg-white p-4 space-y-3 shadow-card-ring">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-52 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    ),
  },
);

// 视频诊断大抽屉按需加载：只在首次点击作品诊断时下载
const ContentDiagnosisWorkbench = dynamic(
  () =>
    import("@/app/(app)/admin/content/content-diagnosis-workbench").then(
      (mod) => mod.ContentDiagnosisWorkbench,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
        <Loader2 className="size-6 animate-spin text-white/80" />
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
  staff: StaffRow[];
  writerCount?: number;
  editorCount?: number;
  isOwnerOrTeamAdmin: boolean;
  /** 首屏共享数据集加载失败：明确报错，不把失败伪装成空数据 */
  loadFailed?: boolean;
  writerCandidates?: WriterCandidateRow[];
}

function generateMonthOptions() {
  const options: Array<{ year: number; month: number; label: string; value: string }> = [];
  const startYear = 2026;
  const startMonth = 7; // Earliest allowed month 2026-07

  const now = getShanghaiYearMonth();
  let currentYear = now.year;
  let currentMonth = now.month;

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
  staff,
  writerCount,
  editorCount,
  isOwnerOrTeamAdmin,
  loadFailed = false,
  writerCandidates = [],
}: CollaborationWorkbenchProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // 视频诊断大抽屉状态：支持就地直出，不发生路由跳转与页面卸载
  const [diagnosisDetail, setDiagnosisDetail] = useState<CollaborationDiagnosisDetail | null>(null);
  const [openingReportId, setOpeningReportId] = useState<string | null>(null);

  const monthOptions = useMemo(() => generateMonthOptions(), []);
  const currentMonthValue = `${year}-${month}`;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 默认 Tab 来自服务端默认参数，随路由变化同步
    setTab(defaultTab);
  }, [defaultTab]);

  const openDiagnosisByReportId = useCallback(async (reportId: string) => {
    if (openingReportId) return;
    setOpeningReportId(reportId);
    try {
      const response = await fetch(
        `/api/admin/collaboration/work-video?reportId=${encodeURIComponent(reportId)}`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        videoId?: string;
        video?: CollaborationDiagnosisDetail["video"] | null;
        snapshot?: CollaborationDiagnosisDetail["snapshot"] | null;
        reviewReadiness?: CollaborationDiagnosisDetail["reviewReadiness"] | null;
        error?: string;
      };
      if (!response.ok || !payload.videoId) {
        toast.error(payload.error || "暂时无法打开视频诊断");
        return;
      }
      if (payload.video) {
        setDiagnosisDetail({
          video: payload.video,
          snapshot: payload.snapshot ?? null,
          reviewReadiness: payload.reviewReadiness ?? null,
        });
      } else {
        toast.error("未能获取该作品的详细诊断数据");
      }
    } catch {
      toast.error("网络异常，暂时无法打开视频诊断");
    } finally {
      setOpeningReportId(null);
    }
  }, [openingReportId]);

  const handleTabChange = (nextTab: TabKey) => {
    setTab(nextTab);
    router.push(`/admin/collaboration?year=${year}&month=${month}&tab=${nextTab}`, { scroll: false });
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
    const now = getShanghaiYearMonth();
    let nextY = year;
    let nextM = month + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY++;
    }
    const currentY = now.year;
    const currentM = now.month;
    if (nextY > currentY || (nextY === currentY && nextM > currentM)) return;
    router.push(`/admin/collaboration?year=${nextY}&month=${nextM}&tab=${tab}`);
  };

  return (
    <CollaborationDiagnosisContext.Provider
      value={{ openDiagnosisByReportId, openingReportId }}
    >
      <div className="space-y-6">
        {/* 整合型流线控制舱：裸铺自然分层 */}
        <div className="space-y-3.5 pb-4 border-b border-[#E2E2DF]/80">
        {/* 控制舱顶栏：月份快捷翻页与健康度 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E2E2DF]/60">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* 快捷翻月控制组 */}
            <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-[#E2E2DF] shadow-2xs">
              <button
                type="button"
                onClick={handlePrevMonth}
                title="上一月"
                className="size-7 rounded flex items-center justify-center text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9] transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120"
              >
                <ChevronLeft className="size-4" />
              </button>
              <div className="w-32 sm:w-36">
                <Select value={currentMonthValue} onValueChange={handleMonthChange}>
                  <SelectTrigger className="h-7 text-[12.5px] sm:text-[13px] bg-transparent border-0 shadow-none font-medium hover:bg-[#EBEBE9] transition-colors focus-visible:ring-0 outline-none cursor-pointer">
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
                className="size-7 rounded flex items-center justify-center text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9] transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          {/* 右侧：健康度极轻静默芯片 */}
          <HealthBar
            summary={summary}
            year={year}
            month={month}
            canEdit={isOwnerOrTeamAdmin}
          />
        </div>

        {loadFailed && (
          <Alert variant="error">
            <span className="font-medium text-[#292524]">岗位数据加载稍有阻滞</span>
            <span className="text-[#78716C]">· 当前展示为空，请刷新重试</span>
          </Alert>
        )}

        {/* 浅砂微气垫导航 Tab（聚光灯单点回归） */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => handleTabChange("talents")}
            className={`h-7 px-3 sm:px-3.5 text-[12.5px] sm:text-[13px] font-medium rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
              tab === "talents"
                ? "bg-[#F1F1F0] text-[#1C1917] font-medium shadow-2xs"
                : "text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9]"
            }`}
          >
            达人 ({talents.length})
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("operators")}
            className={`h-7 px-3 sm:px-3.5 text-[12.5px] sm:text-[13px] font-medium rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
              tab === "operators"
                ? "bg-[#F1F1F0] text-[#1C1917] font-medium shadow-2xs"
                : "text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9]"
            }`}
          >
            运营 ({operators.length})
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("writers")}
            className={`h-7 px-3 sm:px-3.5 text-[12.5px] sm:text-[13px] font-medium rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
              tab === "writers"
                ? "bg-[#F1F1F0] text-[#1C1917] font-medium shadow-2xs"
                : "text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9]"
            }`}
          >
            文案 {writerCount !== undefined ? `(${writerCount})` : tab === "writers" ? `(${staff.length})` : ""}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("editors")}
            className={`h-7 px-3 sm:px-3.5 text-[12.5px] sm:text-[13px] font-medium rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 ${
              tab === "editors"
                ? "bg-[#F1F1F0] text-[#1C1917] font-medium shadow-2xs"
                : "text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9]"
            }`}
          >
            剪辑 {editorCount !== undefined ? `(${editorCount})` : tab === "editors" ? `(${staff.length})` : ""}
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
      ) : tab === "writers" ? (
        <WriterTab rows={staff} candidates={writerCandidates} canCertify={isOwnerOrTeamAdmin && !loadFailed}
          onSelectPerson={(id) => setSelectedPersonId(id)}
          onPrefetchPerson={(id) => prefetchPerson(id, year, month)} />
      ) : (
        <StaffTab
          rows={staff}
          role="editor"
          isLoading={false}
          onSelectPerson={(id) => setSelectedPersonId(id)}
          onPrefetchPerson={(id) => prefetchPerson(id, year, month)}
        />
      )}

      {/* 个人档案卡对话框 */}
      <PersonalCard
        userId={selectedPersonId}
        year={year}
        month={month}
        isDiagnosisOpen={Boolean(diagnosisDetail)}
        onClose={() => setSelectedPersonId(null)}
      />

      {/* 视频诊断右侧大抽屉：就地直出，零页面跳转与重载 */}
      {diagnosisDetail && (
        <ContentDiagnosisWorkbench
          video={diagnosisDetail.video}
          snapshot={diagnosisDetail.snapshot}
          reviewReadiness={diagnosisDetail.reviewReadiness ?? undefined}
          canOperateLifecycle={isOwnerOrTeamAdmin}
          onLifecycleChanged={() => {}}
          onClose={() => setDiagnosisDetail(null)}
        />
      )}
    </div>
  </CollaborationDiagnosisContext.Provider>
);
}
