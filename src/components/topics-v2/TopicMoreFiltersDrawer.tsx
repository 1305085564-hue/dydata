"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  RotateCcw,
  Flame,
  Clock,
  Trophy,
  Database,
  Info,
} from "lucide-react";
import type { TopicMoreFiltersState } from "./types";

export interface TopicMoreFiltersDrawerProps {
  isOpen: boolean;
  filters?: TopicMoreFiltersState;
  onChange?: (filters: TopicMoreFiltersState) => void;
  onClose: () => void;
}

type FilterCategoryKey = "source" | "heat" | "duration" | "performance";

const CATEGORIES: Array<{
  key: FilterCategoryKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "source", label: "数据来源", icon: Database },
  { key: "heat", label: "近 7 天热度", icon: Flame },
  { key: "duration", label: "视频时长", icon: Clock },
  { key: "performance", label: "历史成绩", icon: Trophy },
];

export function TopicMoreFiltersDrawer({
  isOpen,
  onClose,
}: TopicMoreFiltersDrawerProps) {
  const [activeCategory, setActiveCategory] =
    useState<FilterCategoryKey>("source");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleResetAll = () => {
    // 待后端接入后重置生效
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-[65] bg-[#1C1917]/20 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 侧边级联筛选浮层 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="更多高级筛选"
        className="fixed top-[var(--app-top-offset,64px)] bottom-0 right-0 z-[70] flex w-full max-w-lg flex-col overflow-hidden border-l border-[#E5E0D6] bg-[#FBF9F5] shadow-claude-dialog animate-in slide-in-from-right duration-200"
      >
        {/* 顶栏 */}
        <div className="flex items-center justify-between border-b border-[#ECE7DE] bg-white px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[#1C1917]">更多筛选</h3>
            <span className="rounded-md bg-[#FAF8F4] border border-[#ECE7DE] px-2 py-0.5 text-xs text-[#78716C]">
              待后端接入
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-normal text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors cursor-pointer"
            >
              <RotateCcw className="size-3" />
              <span>重置</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors cursor-pointer"
              aria-label="关闭筛选"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* 待接入提示横幅 */}
        <div className="bg-[#FAF8F4] border-b border-[#ECE7DE] px-5 py-3 text-xs text-[#78716C] flex items-start gap-2">
          <Info className="size-4 text-[#D97757] shrink-0 mt-0.5" />
          <p className="leading-relaxed font-normal">
            来源、热度、时长与历史成绩的级联高级筛选接口正在等待 Codex 后端接入。在接口打通前，条件保持待接入状态，暂不伪装生效。
          </p>
        </div>

        {/* 主体左右分栏布局 */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* 左侧大项导航 */}
          <nav
            aria-label="筛选分类"
            className="w-36 sm:w-40 border-r border-[#ECE7DE] bg-[#FAF8F4]/80 p-2 space-y-1 overflow-y-auto shrink-0"
          >
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = activeCategory === cat.key;

              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCategory(cat.key)}
                  className={`group flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? "bg-white text-[#1C1917] shadow-2xs font-semibold"
                      : "text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#292524]"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Icon
                      className={`size-3.5 shrink-0 ${
                        isSelected
                          ? "text-[#D97757]"
                          : "text-[#78716C] group-hover:text-[#292524]"
                      }`}
                    />
                    <span className="truncate">{cat.label}</span>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* 右侧具体选项展开区 */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-white space-y-4">
            {activeCategory === "source" && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-[#1C1917] mb-1">
                    数据来源
                  </h4>
                  <p className="text-[11.5px] text-[#78716C] leading-relaxed">
                    按团队内部验证沉淀或外部收集干货进行分流
                  </p>
                </div>
                <div className="space-y-1.5 pt-1">
                  {[
                    { value: "all", label: "全部来源", desc: "包含内部与外部所有有效干货选题" },
                    { value: "internal", label: "团队内部（待接入）", desc: "来自团队日报与复盘中 24h 播放 ≥ 3 万的验证选题" },
                    { value: "external", label: "外部收集（待接入）", desc: "来自管理端通过 Excel/CSV 批量导入的外部爆款干货" },
                  ].map((opt) => (
                    <div
                      key={opt.value}
                      className="flex min-h-[44px] w-full items-start justify-between rounded-xl border border-[#ECE7DE] bg-white p-3 text-left opacity-70"
                    >
                      <div className="space-y-0.5 pr-2">
                        <div className="text-xs font-medium text-[#292524]">
                          {opt.label}
                        </div>
                        <div className="text-[11.5px] text-[#78716C] leading-normal font-normal">
                          {opt.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeCategory === "heat" && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-[#1C1917] mb-1">
                    近 7 天热度
                  </h4>
                  <p className="text-[11.5px] text-[#78716C] leading-relaxed">
                    允许多人同时创作，按近 7 天真实参与人数与创作进展筛选
                  </p>
                </div>
                <div className="space-y-1.5 pt-1">
                  {[
                    { value: "all", label: "全部热度", desc: "不限参与状态" },
                    { value: "active", label: "有人参与（待接入）", desc: "近 7 天内有成员正在写或已写成片" },
                    { value: "in_progress", label: "当前有人在写（待接入）", desc: "当前有组员在飞书文档立卷创作中" },
                    { value: "unclaimed", label: "暂无参与（待接入）", desc: "近 7 天内无人选写，适合抢占首发" },
                  ].map((opt) => (
                    <div
                      key={opt.value}
                      className="flex min-h-[44px] w-full items-start justify-between rounded-xl border border-[#ECE7DE] bg-white p-3 text-left opacity-70"
                    >
                      <div className="space-y-0.5 pr-2">
                        <div className="text-xs font-medium text-[#292524]">
                          {opt.label}
                        </div>
                        <div className="text-[11.5px] text-[#78716C] leading-normal font-normal">
                          {opt.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeCategory === "duration" && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-[#1C1917] mb-1">
                    预估视频时长
                  </h4>
                  <p className="text-[11.5px] text-[#78716C] leading-relaxed">
                    按成片目标时长区间筛选
                  </p>
                </div>
                <div className="space-y-1.5 pt-1">
                  {[
                    { value: "all", label: "全部时长", desc: "不限视频长度" },
                    { value: "under_2m", label: "2 分钟以内（待接入）", desc: "短平快干货，适合高密度观点" },
                    { value: "2_5m", label: "3–5 分钟（待接入）", desc: "标准深度实战教程" },
                    { value: "over_5m", label: "5 分钟以上（待接入）", desc: "长篇深度大课式拆解" },
                  ].map((opt) => (
                    <div
                      key={opt.value}
                      className="flex min-h-[44px] w-full items-start justify-between rounded-xl border border-[#ECE7DE] bg-white p-3 text-left opacity-70"
                    >
                      <div className="space-y-0.5 pr-2">
                        <div className="text-xs font-medium text-[#292524]">
                          {opt.label}
                        </div>
                        <div className="text-[11.5px] text-[#78716C] leading-normal font-normal">
                          {opt.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeCategory === "performance" && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-[#1C1917] mb-1">
                    历史成绩证明
                  </h4>
                  <p className="text-[11.5px] text-[#78716C] leading-relaxed">
                    按已被数据验证的爆款表现维度排序或筛选
                  </p>
                </div>
                <div className="space-y-1.5 pt-1">
                  {[
                    { value: "all", label: "默认排序", desc: "综合推荐权重排序" },
                    { value: "best_play", label: "历史最高播放优先（待接入）", desc: "优先展示单条成片播放量极高的爆款" },
                    { value: "qualified_count", label: "达标优质作品最多（待接入）", desc: "优先展示被多次验证跑出优质结果的母题" },
                  ].map((opt) => (
                    <div
                      key={opt.value}
                      className="flex min-h-[44px] w-full items-start justify-between rounded-xl border border-[#ECE7DE] bg-white p-3 text-left opacity-70"
                    >
                      <div className="space-y-0.5 pr-2">
                        <div className="text-xs font-medium text-[#292524]">
                          {opt.label}
                        </div>
                        <div className="text-[11.5px] text-[#78716C] leading-normal font-normal">
                          {opt.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底栏 */}
        <div className="flex items-center justify-between border-t border-[#ECE7DE] bg-[#FAF8F4] px-5 py-3.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] sm:min-h-0 items-center justify-center rounded-xl px-4 py-2 text-xs font-medium text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors cursor-pointer"
          >
            关闭
          </button>
          <span className="text-xs text-[#78716C]">
            待 Codex 接入后端后启用
          </span>
        </div>
      </div>
    </>
  );
}
