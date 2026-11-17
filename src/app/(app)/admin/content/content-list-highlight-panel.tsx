"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ContentListFilterValue } from "./content-list-filters";
import {
  HIGHLIGHT_FIELDS,
  formatHighlightRuleLabel,
  getHighlightFieldMeta,
  type HighlightFieldKey,
  type HighlightRule,
} from "@/lib/content/domain/content-list-highlight";

export function FilterChipOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer truncate rounded-md border px-2 py-1 text-center text-[12px] transition-colors",
        selected
          ? "border-[#78716C]/50 bg-white text-[#141413] shadow-input"
          : "border-[#E2E2DF]/70 bg-white/70 text-[#78716C] hover:bg-white hover:text-[#1F1E1D]",
      )}
    >
      {label}
    </button>
  );
}

/**
 * 「数据高亮」单层平铺面板：直接点选字段网格 → 填「不低于/低于」→ 添加。
 * 非法输入（负数/非数字/下限≥上限）用红边提示并禁用添加，绝不静默接受。
 */
export function DataHighlightPanel({
  filters,
  handleAddHighlightRule,
  handleRemoveHighlightRule,
  handleToggleHighlightOnly,
}: {
  filters: ContentListFilterValue;
  handleAddHighlightRule: (key: HighlightFieldKey, rule: HighlightRule) => void;
  handleRemoveHighlightRule: (key: HighlightFieldKey) => void;
  handleToggleHighlightOnly: () => void;
}) {
  const [pendingField, setPendingField] = useState<HighlightFieldKey>("interactionRate");
  const [minInput, setMinInput] = useState("");
  const [maxInput, setMaxInput] = useState("");

  const meta = getHighlightFieldMeta(pendingField);
  const minNum = minInput.trim() === "" ? null : Number(minInput);
  const maxNum = maxInput.trim() === "" ? null : Number(maxInput);
  const minInvalid = minNum !== null && (!Number.isFinite(minNum) || minNum < 0);
  const maxInvalid = maxNum !== null && (!Number.isFinite(maxNum) || maxNum < 0);
  const orderInvalid =
    !minInvalid && !maxInvalid && minNum !== null && maxNum !== null && minNum >= maxNum;
  const bothEmpty = minNum === null && maxNum === null;
  const canAdd = !minInvalid && !maxInvalid && !orderInvalid && !bothEmpty;

  const activeRuleKeys = Object.keys(filters.highlightRules) as HighlightFieldKey[];

  const handleAdd = () => {
    if (!canAdd) return;
    handleAddHighlightRule(pendingField, { min: minNum, max: maxNum });
    setMinInput("");
    setMaxInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && canAdd) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="mx-1 mb-1 rounded-xl bg-[#F7F7F6] p-2 space-y-2">
      <div className="grid grid-cols-3 gap-1">
        {HIGHLIGHT_FIELDS.map((field) => (
          <FilterChipOption
            key={field.key}
            label={field.label}
            selected={pendingField === field.key}
            onClick={() => setPendingField(field.key)}
          />
        ))}
      </div>

      <div className="flex items-center gap-1 pt-1 border-t border-[#E2E2DF]/60">
        <Input
          type="number"
          min={0}
          step={meta.step}
          inputMode="decimal"
          value={minInput}
          onChange={(e) => setMinInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`不低于(${meta.unit})`}
          aria-label="高亮区间下限"
          className={cn(
            "h-7 flex-1 rounded-md bg-white px-2 text-[12px] shadow-input",
            minInvalid || orderInvalid ? "border-status-danger" : "border-[#E2E2DF]",
          )}
        />
        <span className="text-[12px] text-[#A8A29E]">~</span>
        <Input
          type="number"
          min={0}
          step={meta.step}
          inputMode="decimal"
          value={maxInput}
          onChange={(e) => setMaxInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`低于(${meta.unit})`}
          aria-label="高亮区间上限"
          className={cn(
            "h-7 flex-1 rounded-md bg-white px-2 text-[12px] shadow-input",
            maxInvalid || orderInvalid ? "border-status-danger" : "border-[#E2E2DF]",
          )}
        />
        <button
          type="button"
          disabled={!canAdd}
          onClick={handleAdd}
          className={cn(
            "shrink-0 rounded-md border px-2 h-7 text-[12px] transition-colors",
            canAdd
              ? "cursor-pointer border-[#E2E2DF] bg-white text-[#1F1E1D] hover:bg-[#EBEBE9]"
              : "cursor-not-allowed border-[#E2E2DF]/60 bg-[#F1F1F0] text-[#A8A29E]",
          )}
        >
          添加
        </button>
      </div>

      {(minInvalid || maxInvalid || orderInvalid) && (
        <div className="text-[12px] text-status-danger">
          {minInvalid || maxInvalid ? "请输入不小于 0 的数字" : "下限必须小于上限"}
        </div>
      )}

      {activeRuleKeys.length === 0 ? (
        <div className="text-[12px] text-[#78716C]">命中区间的数据会淡色高亮</div>
      ) : (
        <div className="space-y-1 pt-1 border-t border-[#E2E2DF]/60">
          <div className="text-[12px] text-[#78716C]">已设规则（同字段覆盖）</div>
          {activeRuleKeys.map((key) => {
            const rule = filters.highlightRules[key];
            if (!rule) return null;
            return (
              <div key={key} className="flex items-center gap-1">
                <span className="inline-flex items-center rounded-md bg-status-warning/[0.12] px-2 py-0.5 text-[12px] text-status-warning">
                  {formatHighlightRuleLabel(key, rule)}
                </span>
                <SimpleTooltip tip="删除该规则" align="end">
                  <button
                    type="button"
                    onClick={() => handleRemoveHighlightRule(key)}
                    className="ml-auto cursor-pointer rounded-md p-1 text-[#A8A29E] transition-colors hover:bg-status-danger/5 hover:text-status-danger"
                    aria-label={`删除规则 ${formatHighlightRuleLabel(key, rule)}`}
                  >
                    <X className="size-3" />
                  </button>
                </SimpleTooltip>
              </div>
            );
          })}
          <button
            type="button"
            onClick={handleToggleHighlightOnly}
            className="flex w-full cursor-pointer items-center gap-1 rounded-md px-1 py-1 text-[12px] text-[#1F1E1D] hover:bg-[#EBEBE9] transition-colors"
          >
            <Check
              className={cn(
                "size-3.5",
                filters.highlightOnly ? "text-status-warning" : "opacity-0",
              )}
            />
            <span>只看命中高亮的行</span>
          </button>
        </div>
      )}
    </div>
  );
}
