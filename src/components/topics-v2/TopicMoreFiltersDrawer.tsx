"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Check,
  RotateCcw,
  Flame,
  Clock,
  Trophy,
  Database,
} from "lucide-react";
import type { TopicMoreFiltersState } from "./types";
import { DEFAULT_MORE_FILTERS } from "./types";

interface TopicMoreFiltersDrawerProps {
  isOpen: boolean;
  filters: TopicMoreFiltersState;
  onChange: (filters: TopicMoreFiltersState) => void;
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
  filters,
  onChange,
  onClose,
}: TopicMoreFiltersDrawerProps) {
  const [activeCategory, setActiveCategory] =
    useState<FilterCategoryKey>("source");
  const [draftFilters, setDraftFilters] =
    useState<TopicMoreFiltersState>(filters);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftFilters(filters);
  }, [filters, isOpen]);

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

  const isCategoryActive = (key: FilterCategoryKey) => {
    switch (key) {
      case "source":
        return draftFilters.sourceType !== "all";
      case "heat":
        return draftFilters.recentHeat !== "all";
      case "duration":
        return draftFilters.durationRange !== "all";
      case "performance":
        return draftFilters.performanceTier !== "all";
      default:
        return false;
    }
  };

  const activeFilterCount =
    (draftFilters.sourceType !== "all" ? 1 : 0) +
    (draftFilters.recentHeat !== "all" ? 1 : 0) +
    (draftFilters.durationRange !== "all" ? 1 : 0) +
    (draftFilters.performanceTier !== "all" ? 1 : 0);

  const handleResetAll = () => {
    setDraftFilters(DEFAULT_MORE_FILTERS);
  };

  const handleApply = () => {
    onChange(draftFilters);
    onClose();
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
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-[#D97757]/10 px-2 py-0.5 text-xs font-semibold text-[#D97757] tabular-nums">
                已选 {activeFilterCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetAll}
                className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-normal text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors cursor-pointer"
              >
                <RotateCcw className="size-3" />
                <span>重置</span>
              </button>
            )}
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
              const hasActiveBadge = isCategoryActive(cat.key);

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
                  {hasActiveBadge && (
                    <span className="size-1.5 rounded-full bg-[#D97757] shrink-0" />
                  )}
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
                    { value: "internal", label: "团队内部", desc: "来自团队日报与复盘中 24h 播放 ≥ 3 万的验证选题" },
                    { value: "external", label: "外部收集", desc: "来自管理端通过 Excel/CSV 批量导入的外部爆款干货" },
                  ].map((opt) => {
                    const isChecked = draftFilters.sourceType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setDraftFilters((prev) => ({
                            ...prev,
                            sourceType: opt.value as TopicMoreFiltersState["sourceType"],
                          }))
                        }
                        className={`flex min-h-[44px] w-full items-start justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                          isChecked
                            ? "border-[#D97757]/40 bg-[#FAF8F4] text-[#1C1917]"
                            : "border-[#ECE7DE] bg-white text-[#292524] hover:bg-[#FBF9F5]"
                        }`}
                      >
                        <div className="space-y-0.5 pr-2">
                          <div className="text-xs font-semibold">
                            {opt.label}
                          </div>
                          <div className="text-[11.5px] text-[#78716C] leading-normal font-normal">
                            {opt.desc}
                          </div>
                        </div>
                        {isChecked && (
                          <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#D97757] text-white mt-0.5">
                            <Check className="size-2.5 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
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
                    { value: "has_participants", label: "有人参与", desc: "近 7 天内至少有 1 位团队成员参与创作" },
                    { value: "has_completed", label: "有人已经写完", desc: "近 7 天内已有成员完成脚本并发布作品" },
                    { value: "has_in_progress", label: "当前有人在写", desc: "当前有成员正在进行飞书脚本写作" },
                    { value: "no_participants", label: "暂时无人参与", desc: "近 7 天未被开采的优质冷门好题" },
                  ].map((opt) => {
                    const isChecked = draftFilters.recentHeat === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setDraftFilters((prev) => ({
                            ...prev,
                            recentHeat: opt.value as TopicMoreFiltersState["recentHeat"],
                          }))
                        }
                        className={`flex min-h-[44px] w-full items-start justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                          isChecked
                            ? "border-[#D97757]/40 bg-[#FAF8F4] text-[#1C1917]"
                            : "border-[#ECE7DE] bg-white text-[#292524] hover:bg-[#FBF9F5]"
                        }`}
                      >
                        <div className="space-y-0.5 pr-2">
                          <div className="text-xs font-semibold">
                            {opt.label}
                          </div>
                          <div className="text-[11.5px] text-[#78716C] leading-normal font-normal">
                            {opt.desc}
                          </div>
                        </div>
                        {isChecked && (
                          <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#D97757] text-white mt-0.5">
                            <Check className="size-2.5 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeCategory === "duration" && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-[#1C1917] mb-1">
                    视频时长
                  </h4>
                  <p className="text-[11.5px] text-[#78716C] leading-relaxed">
                    根据期望的内容体量与结构密度进行筛选
                  </p>
                </div>
                <div className="space-y-1.5 pt-1">
                  {[
                    { value: "all", label: "全部时长", desc: "不限制视频预估时长" },
                    { value: "under_2m", label: "2 分钟以内", desc: "短平快爆点，适合紧凑单点干货" },
                    { value: "2_5m", label: "3–5 分钟", desc: "标准深度解析，适合系统框架与案例拆解" },
                    { value: "over_5m", label: "5 分钟以上", desc: "长篇透彻长视频，适合大体量复盘与干货合辑" },
                  ].map((opt) => {
                    const isChecked = draftFilters.durationRange === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setDraftFilters((prev) => ({
                            ...prev,
                            durationRange: opt.value as TopicMoreFiltersState["durationRange"],
                          }))
                        }
                        className={`flex min-h-[44px] w-full items-start justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                          isChecked
                            ? "border-[#D97757]/40 bg-[#FAF8F4] text-[#1C1917]"
                            : "border-[#ECE7DE] bg-white text-[#292524] hover:bg-[#FBF9F5]"
                        }`}
                      >
                        <div className="space-y-0.5 pr-2">
                          <div className="text-xs font-semibold">
                            {opt.label}
                          </div>
                          <div className="text-[11.5px] text-[#78716C] leading-normal font-normal">
                            {opt.desc}
                          </div>
                        </div>
                        {isChecked && (
                          <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#D97757] text-white mt-0.5">
                            <Check className="size-2.5 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeCategory === "performance" && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-[#1C1917] mb-1">
                    历史成绩
                  </h4>
                  <p className="text-[11.5px] text-[#78716C] leading-relaxed">
                    以真实跑出过的历史成绩为第一证明进行筛选
                  </p>
                </div>
                <div className="space-y-1.5 pt-1">
                  {[
                    { value: "all", label: "全部成绩", desc: "默认全部已达标入库的选题" },
                    { value: "high_best_play", label: "历史最高播放优先", desc: "曾跑出过 10万+ 或全库巅峰表现的明星选题" },
                    { value: "high_qualified", label: "优质作品数量多", desc: "已被多条合格作品验证过高胜率的母本" },
                    { value: "high_avg_play", label: "平均播放表现稳健", desc: "多轮重做均保持高均播表现的常青选题" },
                  ].map((opt) => {
                    const isChecked = draftFilters.performanceTier === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setDraftFilters((prev) => ({
                            ...prev,
                            performanceTier: opt.value as TopicMoreFiltersState["performanceTier"],
                          }))
                        }
                        className={`flex min-h-[44px] w-full items-start justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                          isChecked
                            ? "border-[#D97757]/40 bg-[#FAF8F4] text-[#1C1917]"
                            : "border-[#ECE7DE] bg-white text-[#292524] hover:bg-[#FBF9F5]"
                        }`}
                      >
                        <div className="space-y-0.5 pr-2">
                          <div className="text-xs font-semibold">
                            {opt.label}
                          </div>
                          <div className="text-[11.5px] text-[#78716C] leading-normal font-normal">
                            {opt.desc}
                          </div>
                        </div>
                        {isChecked && (
                          <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#D97757] text-white mt-0.5">
                            <Check className="size-2.5 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底栏应用操作区 */}
        <div className="flex items-center justify-between border-t border-[#ECE7DE] bg-[#FAF8F4] px-5 py-3.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] sm:min-h-0 rounded-xl px-4 py-2 text-xs font-medium text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="min-h-[44px] sm:min-h-0 rounded-xl bg-[#D97757] px-6 py-2 text-xs font-semibold text-white hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 shadow-xs transition-all cursor-pointer"
          >
            应用筛选
          </button>
        </div>
      </div>
    </>
  );
}
