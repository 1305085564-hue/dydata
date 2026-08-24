"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Activity, History, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubmissionCalendar } from "./submission-calendar";
import { AccountTabs } from "./account-tabs";
import { SubmissionOverviewCard } from "./submission-overview-card";
import { VideoSubmitForm } from "./video-submit-form";
import type { VideoSubmitFormData, SubmitPanelMode } from "./types";

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
}

interface TodayReport {
  account_id: string;
  report_date: string;
  video_url?: string;
  play_count?: number;
}

interface ExemptionGrant {
  id: string;
  user_id: string;
  exempt_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface DashboardRedesignContentProps {
  today: string;
  userDisplayName: string;
  userRole: "member" | "admin" | "owner";
  accounts: Account[];
  userId: string;
  todayReports: TodayReport[];
  monthSubmittedDates: string[];
  accountDisplayNameMap: Record<string, string>;
  exemptionGrants?: ExemptionGrant[];
}

export function DashboardRedesignContent({
  today,
  accounts,
  userId,
  todayReports,
  monthSubmittedDates,
  exemptionGrants = [],
}: DashboardRedesignContentProps) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [activeBizDate, setActiveBizDate] = useState(today);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [submitMode, setSubmitMode] = useState<SubmitPanelMode>("empty");
  const calendarRef = useRef<HTMLDivElement>(null);

  // 当前账号的今日报告
  const currentReport = useMemo(() => {
    return todayReports.find(
      (r) => r.account_id === selectedAccountId && r.report_date === activeBizDate
    );
  }, [todayReports, selectedAccountId, activeBizDate]);

  // 切换账号时重置状态
  const handleAccountChange = useCallback((accountId: string) => {
    setSelectedAccountId(accountId);
    setSubmitMode("empty");
  }, []);

  // 点击外部关闭日历
  useEffect(() => {
    if (!isCalendarOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsCalendarOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isCalendarOpen]);

  // 提交处理
  const handleSubmit = async (data: VideoSubmitFormData) => {
    // TODO: 调用实际 API
    console.log("提交数据", data);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // 提交成功后刷新数据
  };

  return (
    <div className="min-h-screen bg-[#FBF9F5] antialiased">
      <main className="mx-auto max-w-5xl px-4 py-5 lg:px-8">
        {/* ========== 头部区域：断层 40px ========== */}
        <header className="mb-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-[#78716C]">
                <Activity size={12} className="text-[#78716C]" />
                数据台
              </div>

              <div className="relative" ref={calendarRef}>
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                  className="group relative inline-flex items-center gap-2 rounded-xl py-1 outline-none transition-colors active:scale-[0.985] active:duration-75"
                >
                  <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-[#1C1917] transition-colors group-hover:text-[#D97757] sm:text-2xl">
                    {activeBizDate === today ? (
                      <>
                        <span>今日提交</span>
                        <span className="text-base font-normal tabular-nums text-[#78716C] transition-colors group-hover:text-[#292524] sm:text-lg">
                          · {activeBizDate}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex items-center gap-1 text-[#D97757]">
                          <span className="inline-block size-1.5 animate-pulse rounded-full bg-[#D97757] sm:size-2" />
                          补交历史
                        </span>
                        <span className="text-base font-normal tabular-nums text-[#78716C] transition-colors group-hover:text-[#292524] sm:text-lg">
                          · {activeBizDate}
                        </span>
                      </>
                    )}
                  </h1>
                  <ChevronDown
                    className={cn(
                      "size-3 stroke-[2] text-[#78716C] transition-all duration-150 group-hover:text-[#D97757] sm:size-4",
                      isCalendarOpen && "rotate-180 text-[#D97757]"
                    )}
                  />
                </button>

                {isCalendarOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150">
                    <div
                      className="w-[calc(100vw-2.5rem)] max-w-[330px] rounded-2xl border border-[#E5E0D6] bg-white/98 p-4 backdrop-blur-md"
                      style={{
                        boxShadow:
                          "0 1px 3px rgba(0,0,0,0.02), 0 8px 24px -4px rgba(28,25,23,0.05)",
                      }}
                    >
                      <SubmissionCalendar
                        today={today}
                        submittedDates={monthSubmittedDates}
                        selectedDate={activeBizDate}
                        onDateSelect={(date) => {
                          setActiveBizDate(date);
                          setIsCalendarOpen(false);
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <nav className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#78716C] transition-all duration-150 hover:bg-[#F5F3EE] hover:text-[#1C1917]"
              >
                <History size={12} className="stroke-[1.6]" />
                <span className="hidden sm:inline">历史记录</span>
              </button>
            </nav>
          </div>
        </header>

        {/* ========== 账号选择器 ========== */}
        <AccountTabs
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onAccountChange={handleAccountChange}
        />

        {/* ========== 概览统计卡：呼吸 24px ========== */}
        <div className="mt-6">
          <SubmissionOverviewCard
            monthSubmittedDates={monthSubmittedDates}
            exemptionGrants={exemptionGrants}
            today={today}
          />
        </div>

        {/* ========== 数据填报表单：呼吸 24px ========== */}
        <div className="mt-6">
          <VideoSubmitForm
            accountId={selectedAccountId}
            userId={userId}
            today={today}
            bizDate={activeBizDate}
            initialData={currentReport}
            mode={submitMode}
            onSubmit={handleSubmit}
            onModeChange={setSubmitMode}
          />
        </div>
      </main>
    </div>
  );
}
