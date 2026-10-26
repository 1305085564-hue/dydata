"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MemberOption {
  id: string;
  name: string;
}

interface MemberSelectProps {
  value: string;
  onChange: (userId: string) => void;
  profiles: MemberOption[];
  label: string;
}

export function MemberSelect({ value, onChange, profiles, label }: MemberSelectProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");

  const filteredProfiles = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    if (!needle) return profiles;
    return profiles.filter((p) => p.name.toLowerCase().includes(needle));
  }, [keyword, profiles]);

  const isAll = !value;
  const selectedProfile = !isAll ? profiles.find((p) => p.id === value) : null;
  const displayLabel = selectedProfile?.name ?? label;

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setKeyword("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex h-7 items-center justify-between gap-1 rounded-md border border-[#E2E2DF] bg-white px-3 text-[14px] text-[#1F1E1D] shadow-input cursor-pointer select-none transition-colors hover:bg-[#EBEBE9] outline-none focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10 data-[state=open]:border-[#78716C]",
        )}
      >
        <span className={cn("whitespace-nowrap", isAll && "text-[#78716C]")}>
          {displayLabel}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-[#78716C] transition-transform", open && "rotate-180")} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        {/* 搜索框 */}
        <div className="border-b border-[#E2E2DF] p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[#A8A29E]" />
            <Input
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索成员…"
              className="h-8 pl-7 text-[14px]"
            />
          </div>
        </div>
        {/* 成员列表：max-h-80 约显示 16 行，比原来的 max-h-56（约 7 行）多一倍以上 */}
        <div className="max-h-80 overflow-y-auto p-1 scrollbar-thin [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#E2E2DF]">
          {/* 全部成员 */}
          <button
            type="button"
            onClick={() => handleSelect("")}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[14px] text-left transition-colors",
              isAll
                ? "bg-[#E4E4E1] text-[#141413]"
                : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
            )}
          >
            <span className="flex-1 truncate">全部成员</span>
            {isAll && <Check className="size-3.5 text-[#D97757]" />}
          </button>

          {filteredProfiles.length === 0 ? (
            <div className="px-2.5 py-3 text-[12px] text-[#A8A29E] text-center">
              没有匹配的成员
            </div>
          ) : (
            filteredProfiles.map((p) => {
              const selected = p.id === value;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[14px] text-left transition-colors",
                    selected
                      ? "bg-[#E4E4E1] text-[#141413]"
                      : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
                  )}
                >
                  <span className="flex-1 truncate">{p.name}</span>
                  {selected && <Check className="size-3.5 text-[#D97757]" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
