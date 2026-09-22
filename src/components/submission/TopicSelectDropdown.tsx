"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Compass, Search, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchTopicJson } from "@/lib/topics/v2-client-contract";
import type { TopicPoolItem } from "@/components/topics-v2/types";

export interface SelectedTopicInfo {
  id: string;
  title: string;
  hook?: string | null;
  outline?: string | null;
  topicTag?: string | null;
}

interface TopicSelectDropdownProps {
  selectedTopicId: string | null;
  selectedTopicTitle?: string | null;
  onSelectTopic: (topic: SelectedTopicInfo | null) => void;
  className?: string;
}

interface TopicPoolApiResponse {
  items: TopicPoolItem[];
  total: number;
}

export function TopicSelectDropdown({
  selectedTopicId,
  selectedTopicTitle,
  onSelectTopic,
  className,
}: TopicSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [myClaims, setMyClaims] = useState<TopicPoolItem[]>([]);
  const [searchResults, setSearchResults] = useState<TopicPoolItem[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 加载当前用户认领中的选题
  const loadMyClaims = useCallback(async () => {
    try {
      setLoadingClaims(true);
      const data = await fetchTopicJson<TopicPoolApiResponse>("/api/topics/pool?view=my_claims");
      if (data && Array.isArray(data.items)) {
        setMyClaims(data.items);
      }
    } catch {
      // 静默降级，不阻断填报主流程
      setMyClaims([]);
    } finally {
      setLoadingClaims(false);
    }
  }, []);

  // 展开时按需加载我的认领
  useEffect(() => {
    if (isOpen && myClaims.length === 0 && !loadingClaims) {
      void loadMyClaims();
    }
  }, [isOpen, myClaims.length, loadingClaims, loadMyClaims]);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // 搜索全库选题（带防抖）
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    setLoadingSearch(true);
    const timer = setTimeout(async () => {
      try {
        const data = await fetchTopicJson<TopicPoolApiResponse>(
          `/api/topics/pool?view=all&q=${encodeURIComponent(trimmed)}`
        );
        if (data && Array.isArray(data.items)) {
          setSearchResults(data.items);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 聚焦搜索框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const handleSelect = (item: TopicPoolItem) => {
    const outlineText = Array.isArray(item.outline)
      ? item.outline.join("\n")
      : typeof item.outline === "string"
        ? item.outline
        : null;

    onSelectTopic({
      id: item.id,
      title: item.title,
      hook: item.hook ?? null,
      outline: outlineText,
      topicTag: item.topics?.name ?? item.emotion_tag ?? null,
    });
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectTopic(null);
  };

  const displayedTitle =
    selectedTopicTitle ||
    myClaims.find((c) => c.id === selectedTopicId)?.title ||
    searchResults.find((c) => c.id === selectedTopicId)?.title;

  return (
    <div ref={containerRef} className={cn("relative inline-block text-left", className)}>
      {/* 触发触点 */}
      {selectedTopicId ? (
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E2DF] bg-white px-2.5 py-1 text-[12px] shadow-input transition-all hover:border-[#78716C]/40">
          <Compass className="size-3.5 text-[#D97757]" />
          <span className="text-[#78716C]">关联选题:</span>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="max-w-[200px] truncate font-medium text-[#1C1917] hover:underline cursor-pointer"
            title={displayedTitle || "已关联选题"}
          >
            《{displayedTitle || "已选选题"}》
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full text-[#78716C] hover:bg-[#F1F1F0] hover:text-[#C0685C] transition-colors cursor-pointer"
            title="取消关联"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] font-medium text-[#78716C] hover:text-[#292524] hover:bg-[#F1F1F0] transition-colors cursor-pointer"
        >
          <Compass className="size-3.5 text-[#78716C]" />
          <span>关联选题 (可选)</span>
        </button>
      )}

      {/* 浮动选择面板 */}
      {isOpen && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-80 sm:w-96 rounded-2xl border border-[#E2E2DF] bg-white p-3 shadow-claude-float">
          {/* 搜索框 */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索认领选题或全库选题..."
              className="h-8 w-full rounded-lg border border-[#E2E2DF] bg-[#FCFCFB] pl-8 pr-7 text-[13px] text-[#1C1917] placeholder:text-[#A8A29E] outline-none transition-colors focus:border-[#78716C] focus:bg-white focus:ring-1 focus:ring-[#D97757]/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917]"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* 列表区域 */}
          <div className="max-h-64 overflow-y-auto space-y-1 scrollbar-thin">
            {/* 搜索态 */}
            {searchQuery.trim() ? (
              <div>
                <div className="px-2 py-1 text-[11px] font-medium text-[#78716C]">
                  全站搜索结果 ({searchResults.length})
                </div>
                {loadingSearch ? (
                  <div className="flex items-center justify-center py-6 text-[12px] text-[#78716C] gap-2">
                    <Loader2 className="size-3.5 animate-spin text-[#D97757]" />
                    <span>正在检索选题...</span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-6 text-center text-[12px] text-[#78716C]">
                    未搜索到相关选题
                  </div>
                ) : (
                  searchResults.map((item) => (
                    <TopicItemRow
                      key={item.id}
                      item={item}
                      isSelected={item.id === selectedTopicId}
                      onSelect={() => handleSelect(item)}
                    />
                  ))
                )}
              </div>
            ) : (
              /* 默认展示：我的认领选题 */
              <div>
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-medium text-[#78716C]">
                  <span>我认领的选题 (制作中)</span>
                  {myClaims.length > 0 && <span className="tabular-nums">{myClaims.length} 个</span>}
                </div>

                {loadingClaims ? (
                  <div className="flex items-center justify-center py-6 text-[12px] text-[#78716C] gap-2">
                    <Loader2 className="size-3.5 animate-spin text-[#D97757]" />
                    <span>调阅我的选题...</span>
                  </div>
                ) : myClaims.length === 0 ? (
                  <div className="py-5 text-center text-[12px] text-[#78716C] space-y-1">
                    <p>暂无认领中选题</p>
                    <p className="text-[11px] text-[#A8A29E]">在上方输入关键字可搜索团队共享题库</p>
                  </div>
                ) : (
                  myClaims.map((item) => (
                    <TopicItemRow
                      key={item.id}
                      item={item}
                      isSelected={item.id === selectedTopicId}
                      onSelect={() => handleSelect(item)}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* 底部辅助操作 */}
          {selectedTopicId && (
            <div className="mt-2.5 pt-2 border-t border-[#E2E2DF]/60 flex items-center justify-between text-[12px]">
              <span className="text-[#78716C]">已选定关联</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[#C0685C] hover:underline cursor-pointer font-medium"
              >
                取消关联 (改自拟)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TopicItemRow({
  item,
  isSelected,
  onSelect,
}: {
  item: TopicPoolItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full flex items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors cursor-pointer",
        isSelected
          ? "bg-[#F1F1F0] text-[#1C1917] font-medium"
          : "hover:bg-[#FCFCFB] text-[#292524] hover:text-[#1C1917]"
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate">{item.title}</span>
          {(item.topics?.name || item.emotion_tag) && (
            <span className="shrink-0 rounded bg-[#E4E4E1] px-1 py-0.2 text-[10px] text-[#78716C]">
              {item.topics?.name || item.emotion_tag}
            </span>
          )}
        </div>
        {item.hook && (
          <p className="truncate text-[11px] text-[#78716C] group-hover:text-[#292524]/80">
            {item.hook}
          </p>
        )}
      </div>
      {isSelected && <Check className="mt-0.5 size-3.5 shrink-0 text-[#D97757] stroke-[2.5]" />}
    </button>
  );
}
