"use client";

import React, { useEffect, useState } from "react";
import { Clock, Database, Flame, RotateCcw, Trophy, X } from "lucide-react";
import type { TopicMoreFiltersState } from "./types";
import { DEFAULT_MORE_FILTERS } from "./types";

export interface TopicMoreFiltersDrawerProps {
  isOpen: boolean;
  filters: TopicMoreFiltersState;
  onChange: (filters: TopicMoreFiltersState) => void;
  onClose: () => void;
}

type FilterCategoryKey = "source" | "heat" | "duration" | "performance";
type FilterOption = { value: string; label: string; desc: string };

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

const OPTIONS: Record<FilterCategoryKey, FilterOption[]> = {
  source: [
    { value: "all", label: "全部来源", desc: "包含内部与外部所有有效干货选题" },
    { value: "internal", label: "团队内部", desc: "来自日报中 24 小时播放达到 3 万的验证选题" },
    { value: "external", label: "外部收集", desc: "来自管理员 Excel/CSV 批量导入的外部干货" },
  ],
  heat: [
    { value: "all", label: "全部热度", desc: "不限近 7 天参与状态" },
    { value: "has_participants", label: "有人写过", desc: "近 7 天内有成员写过或正在写" },
    { value: "has_completed", label: "有人写完", desc: "近 7 天内有成员完成过对应作品" },
    { value: "has_in_progress", label: "当前有人在写", desc: "近 7 天内仍有成员处于在写状态" },
    { value: "no_participants", label: "暂无写作记录", desc: "近 7 天内还没有成员写过" },
  ],
  duration: [
    { value: "all", label: "全部时长", desc: "不限视频长度" },
    { value: "under_2m", label: "2 分钟以内", desc: "短平快干货，适合高密度观点" },
    { value: "2_5m", label: "2–5 分钟", desc: "标准深度实战教程" },
    { value: "over_5m", label: "5 分钟以上", desc: "长篇深度拆解" },
  ],
  performance: [
    { value: "all", label: "全部成绩", desc: "不按历史成绩限制" },
    { value: "high_best_play", label: "历史最高播放较高", desc: "优先展示单条成片播放量高的选题" },
    { value: "high_qualified", label: "达标作品较多", desc: "优先展示多次跑出优质结果的选题" },
    { value: "high_avg_play", label: "历史平均播放较高", desc: "优先展示整体表现稳定的选题" },
  ],
};

const FILTER_FIELDS: Record<
  FilterCategoryKey,
  keyof TopicMoreFiltersState
> = {
  source: "sourceType",
  heat: "recentHeat",
  duration: "durationRange",
  performance: "performanceTier",
};

export function TopicMoreFiltersDrawer({
  isOpen,
  filters,
  onChange,
  onClose,
}: TopicMoreFiltersDrawerProps) {
  const [activeCategory, setActiveCategory] =
    useState<FilterCategoryKey>("source");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeField = FILTER_FIELDS[activeCategory];
  const selectedValue = filters[activeField];

  const handleSelect = (value: string) => {
    onChange({ ...filters, [activeField]: value } as TopicMoreFiltersState);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[65] bg-[#1C1917]/20 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="更多高级筛选"
        className="fixed top-[var(--app-top-offset,64px)] bottom-0 right-0 z-[70] flex w-full max-w-lg flex-col overflow-hidden border-l border-[#E5E0D6] bg-[#FBF9F5] shadow-claude-dialog animate-in slide-in-from-right duration-200"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#ECE7DE] bg-white px-5 py-3.5">
          <h3 className="text-base font-semibold text-[#1C1917]">更多筛选</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_MORE_FILTERS })}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-normal text-[#78716C] transition-colors hover:bg-[#F5F3EE] hover:text-[#1C1917] sm:min-h-0"
            >
              <RotateCcw className="size-3" />
              <span>重置</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 text-[#78716C] transition-colors hover:bg-[#F5F3EE] hover:text-[#1C1917] sm:min-h-0 sm:min-w-0"
              aria-label="关闭筛选"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="border-b border-[#ECE7DE] bg-[#FAF8F4] px-5 py-2.5 text-xs text-[#78716C]">
          选择后立即刷新选题列表，可同时组合多个条件。
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <nav
            aria-label="筛选分类"
            className="w-36 shrink-0 space-y-1 overflow-y-auto border-r border-[#ECE7DE] bg-[#FAF8F4]/80 p-2 sm:w-40"
          >
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              const isSelected = activeCategory === category.key;
              const field = FILTER_FIELDS[category.key];
              const hasValue = filters[field] !== "all";
              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setActiveCategory(category.key)}
                  className={`group flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all ${
                    isSelected
                      ? "bg-white font-semibold text-[#1C1917] shadow-2xs"
                      : "text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#292524]"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <Icon
                      className={`size-3.5 shrink-0 ${
                        isSelected
                          ? "text-[#D97757]"
                          : "text-[#78716C] group-hover:text-[#292524]"
                      }`}
                    />
                    <span className="truncate">{category.label}</span>
                  </span>
                  {hasValue && (
                    <span
                      className="ml-1 size-1.5 shrink-0 rounded-full bg-[#D97757]"
                      aria-label={`${category.label}已选择`}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex-1 space-y-4 overflow-y-auto bg-white p-4 sm:p-5">
            <div>
              <h4 className="mb-1 text-xs font-semibold text-[#1C1917]">
                {CATEGORIES.find((category) => category.key === activeCategory)?.label}
              </h4>
              <p className="text-[11.5px] leading-relaxed text-[#78716C]">
                选择一个条件，列表会立即按真实数据刷新。
              </p>
            </div>
            <div className="space-y-1.5">
              {OPTIONS[activeCategory].map((option) => {
                const isSelected = selectedValue === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleSelect(option.value)}
                    className={`flex min-h-[44px] w-full items-start justify-between rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-[#D97757]/50 bg-[#D97757]/5"
                        : "border-[#ECE7DE] bg-white hover:bg-[#FBF9F5]"
                    }`}
                  >
                    <span className="space-y-0.5 pr-2">
                      <span className="block text-xs font-medium text-[#292524]">
                        {option.label}
                      </span>
                      <span className="block text-[11.5px] leading-normal text-[#78716C]">
                        {option.desc}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 size-3.5 shrink-0 rounded-full border ${
                        isSelected
                          ? "border-[4px] border-[#D97757]"
                          : "border-[#CFC8BC]"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-[#ECE7DE] bg-[#FAF8F4] px-5 py-3.5">
          <span className="text-xs text-[#78716C]">条件已实时生效</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2 text-xs font-medium text-[#78716C] transition-colors hover:bg-[#F5F3EE] hover:text-[#1C1917] sm:min-h-0"
          >
            关闭
          </button>
        </div>
      </div>
    </>
  );
}
