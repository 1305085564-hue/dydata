"use client";

import { useState, useMemo } from "react";
import { Activity, History, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  content_direction?: string;
  notes?: string;
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
}

/**
 * 今日提交主内容 - 完全基于 Claude 设计哲学重写
 *
 * 设计原则：
 * - L1 背景层：bg-[#FBF9F5] 象牙暖底
 * - L2 容器层：主角裸铺 + 配角微气垫（bg-[#F5F3EE]）
 * - L3 内容层：纯排版，靠留白/字阶/墨度建立层次
 * - 留白四级：断层 40px / 呼吸 24px / 紧凑 16px / 亲密 8px
 * - 唯一行动色：暖陶土橙 #D97757 仅用于主 CTA
 */
export function DashboardRedesignContent({
  today,
  accounts,
  todayReports,
  monthSubmittedDates,
  accountDisplayNameMap,
}: DashboardRedesignContentProps) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [activeBizDate, setActiveBizDate] = useState(today);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // 表单状态
  const [videoUrl, setVideoUrl] = useState("");
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [shares, setShares] = useState("");
  const [contentDirection, setContentDirection] = useState("");
  const [notes, setNotes] = useState("");

  // 当前账号的今日报告
  const currentReport = useMemo(() => {
    return todayReports.find(
      (r) => r.account_id === selectedAccountId && r.report_date === activeBizDate
    );
  }, [todayReports, selectedAccountId, activeBizDate]);

  // 本月提交统计
  const monthSubmitCount = useMemo(() => {
    return monthSubmittedDates.length;
  }, [monthSubmittedDates]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="min-h-screen bg-[#FBF9F5] antialiased">
      {/* L1 背景层：象牙暖底 */}
      <main className="mx-auto max-w-5xl px-4 py-5 lg:px-8">

        {/* ========== 头部区：断层 40px ========== */}
        <header className="mb-10">
          <div className="flex items-center justify-between">
            {/* 左侧：分类 + 交互式大标题 */}
            <div className="flex items-center gap-2">
              {/* 分类标签：11px uppercase tracking-wide */}
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-[#78716C]">
                <Activity size={12} className="text-[#78716C]" />
                数据台
              </div>

              {/* 交互式大标题：H1 24px semibold */}
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

              {/* TODO: 日历 Popover - 后续实现 */}
            </div>

            {/* 右侧：幽灵态快捷按钮 */}
            <nav className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#78716C] transition-all duration-150 hover:bg-[#F5F3EE] hover:text-[#1C1917]"
              >
                <History size={12} className="stroke-[1.6]" />
                <span className="hidden sm:inline">历史记录</span>
              </button>

              {/* TODO: 申请豁免按钮 - 后续实现 */}
            </nav>
          </div>
        </header>

        {/* ========== 账号选择器：Tab 形态，发丝分割线 ========== */}
        <div className="border-b border-[#ECE7DE]/60">
          <nav className="-mb-px flex gap-1" role="tablist">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                role="tab"
                aria-selected={selectedAccountId === account.id}
                onClick={() => setSelectedAccountId(account.id)}
                className={cn(
                  "border-b-2 border-transparent px-4 py-3 text-sm font-medium transition-all duration-150",
                  selectedAccountId === account.id
                    ? "border-[#43718E] bg-[#F5F3EE]/40 text-[#1C1917]" // 选中态：位置色底边 + 浅砂岩底色
                    : "text-[#78716C] hover:bg-[#F5F3EE]/20 hover:text-[#292524]" // 默认态：平静，Hover 提亮
                )}
              >
                {account.display_name}
              </button>
            ))}
          </nav>
        </div>

        {/* ========== 概览统计卡：配角有壳，呼吸 24px ========== */}
        <div className="mt-6 rounded-2xl bg-[#F5F3EE] p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            {/* 本月提交进度 */}
            <div className="space-y-1">
              <p className="text-[13px] text-[#78716C]">本月提交进度</p>
              <p className="text-2xl font-semibold tabular-nums text-[#1C1917]">
                {monthSubmitCount}{" "}
                <span className="text-lg font-normal text-[#78716C]">天</span>
              </p>
            </div>

            {/* Mini 日历点阵 - 后续实现 */}
            <div className="flex items-center gap-1">
              {monthSubmittedDates.slice(0, 14).map((date, idx) => (
                <div
                  key={date || idx}
                  className="size-2 rounded-full bg-[#6FAA7D]"
                  title={date}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ========== 数据填报表单：主角裸铺，呼吸 24px ========== */}
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            // TODO: 提交逻辑
            console.log("提交数据", {
              selectedAccountId,
              activeBizDate,
              videoUrl,
              views,
              likes,
              comments,
              shares,
              contentDirection,
              notes,
            });
          }}
        >
          {/* 发布链接 - 亲密 8px */}
          <div className="space-y-2">
            <label
              htmlFor="video-url"
              className="block text-sm font-medium text-[#292524]"
            >
              发布链接
            </label>
            <input
              id="video-url"
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="w-full rounded-lg border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-sm text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] placeholder:text-[#A8A29E] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
              placeholder="粘贴抖音视频链接"
            />
          </div>

          {/* 数据指标（四列网格）- 紧凑 16px */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { key: "views", label: "播放量", value: views, setter: setViews },
              { key: "likes", label: "点赞数", value: likes, setter: setLikes },
              { key: "comments", label: "评论数", value: comments, setter: setComments },
              { key: "shares", label: "转发数", value: shares, setter: setShares },
            ].map((metric) => (
              <div key={metric.key} className="space-y-2">
                <label
                  htmlFor={metric.key}
                  className="block text-sm font-medium text-[#292524]"
                >
                  {metric.label}
                </label>
                <input
                  id={metric.key}
                  type="number"
                  value={metric.value}
                  onChange={(e) => metric.setter(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-right text-sm tabular-nums text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                  placeholder="0"
                />
              </div>
            ))}
          </div>

          {/* 话术方向 - 紧凑 16px */}
          <div className="space-y-2">
            <label
              htmlFor="content-direction"
              className="block text-sm font-medium text-[#292524]"
            >
              话术方向
            </label>
            <select
              id="content-direction"
              value={contentDirection}
              onChange={(e) => setContentDirection(e.target.value)}
              className="w-full rounded-lg border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-sm text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
            >
              <option value="">选择话术方向</option>
              {selectedAccount?.content_direction && (
                <option value={selectedAccount.content_direction}>
                  {selectedAccount.content_direction}
                </option>
              )}
            </select>
          </div>

          {/* 备注 - 紧凑 16px */}
          <div className="space-y-2">
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-[#292524]"
            >
              备注 <span className="text-[#A8A29E]">(可选)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-sm text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
              placeholder="记录视频相关补充信息"
            />
          </div>

          {/* 提交按钮：唯一暖橙 CTA，右对齐，呼吸 24px */}
          <div className="flex justify-end pt-6">
            <button
              type="submit"
              className="rounded-lg bg-[#D97757] px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75"
            >
              提交数据
            </button>
          </div>
        </form>

        {/* ========== 已提交数据展示区 - 后续实现 ========== */}
        {currentReport && (
          <div className="mt-10 border-t border-[#ECE7DE]/80 pt-10">
            <h2 className="mb-6 text-lg font-semibold text-[#1C1917]">
              已提交数据
            </h2>
            <div className="space-y-2 text-sm text-[#292524]">
              <p>视频链接: {currentReport.video_url}</p>
              <p className="tabular-nums">
                播放量: {currentReport.views?.toLocaleString() ?? "—"}
              </p>
              <p className="tabular-nums">
                点赞数: {currentReport.likes?.toLocaleString() ?? "—"}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
