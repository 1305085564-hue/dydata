"use client";

import { Search, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";

interface ExpandableSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ExpandableSearch({
  value,
  onChange,
  placeholder = "搜索标题/文案…",
}: ExpandableSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 有内容时保持展开
  const shouldExpand = isExpanded || value.length > 0;

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const handleClear = () => {
    onChange("");
    setIsExpanded(false);
  };

  return (
    <div className="relative flex items-center">
      {shouldExpand ? (
        <div className="relative flex items-center">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => {
              if (value.length === 0) {
                setIsExpanded(false);
              }
            }}
            placeholder={placeholder}
            aria-label="搜索标题或文案"
            className="min-h-[44px] sm:min-h-0 sm:h-7 w-32 md:w-40 rounded-md border-[#E2E2DF] bg-white pl-7 pr-7 text-[12px] shadow-input"
          />
          <Search className="absolute left-2 size-3.5 text-[#78716C] pointer-events-none" aria-hidden="true" />
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 size-3.5 text-[#78716C] hover:text-[#1F1E1D] transition-colors cursor-pointer"
              aria-label="清除搜索"
            >
              <X className="size-full" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 sm:w-7 rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#1F1E1D] cursor-pointer transition-colors"
          aria-label="展开搜索"
        >
          <Search className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
