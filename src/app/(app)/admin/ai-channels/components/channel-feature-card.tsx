"use client";

import { ChevronDown, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { AiChannelRow, AiFeatureCardItem } from "./types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const AUTO_CHANNEL_VALUE = "__auto__";

interface ChannelFeatureCardProps {
  feature: AiFeatureCardItem;
  channels: AiChannelRow[];
  currentChannelId: string;
  isExpanded: boolean;
  saveState: "idle" | "pending" | "saving" | "saved" | "error";
  onToggleExpand: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
}

export function ChannelFeatureCard({
  feature,
  channels,
  currentChannelId,
  isExpanded,
  saveState,
  onToggleExpand,
  onPatch,
}: ChannelFeatureCardProps) {
  const isBoundToCurrent = feature.channel_id === currentChannelId;

  const handleChannelChange = (value: string | null) => {
    if (!value || value === AUTO_CHANNEL_VALUE) {
      onPatch({ channel_id: "", channel_name: null });
      return;
    }

    const nextChannel = channels.find((channel) => channel.id === value);
    onPatch({
      channel_id: value,
      channel_name: nextChannel?.name ?? null,
    });
  };

  const stateStyles = isExpanded
    ? "border-zinc-200 bg-white shadow-sm"
    : "border-zinc-200 bg-white hover:bg-zinc-50 transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]";

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
        stateStyles
      )}
    >
      <div
        className="flex cursor-pointer select-none flex-col justify-between gap-2 p-4 sm:flex-row sm:items-center"
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={`feature-config-${feature.id}`}
      >
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-zinc-800">
            {feature.metadata.title}
          </h4>
          <div className="h-4 w-px bg-zinc-200 hidden sm:block" />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn("px-1.5 py-0.5 rounded-md text-center sm:text-left", isBoundToCurrent ? "bg-zinc-100 text-zinc-800 font-medium" : "text-zinc-500")}>
              渠道: {feature.channel_name || "默认自动（failover）"}
            </span>
            <span className="text-zinc-400 px-1.5 py-0.5 text-center sm:text-left">
              模型: {feature.model.trim() || "跟随渠道默认模型"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto mt-2 sm:mt-0">
          <div className="flex items-center justify-end min-w-[70px]">
            <AnimatePresence mode="popLayout">
              {saveState === "pending" && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-[11px] text-[#D99E55]">
                  <Clock className="size-3 stroke-[1.5]" />待保存
                </motion.span>
              )}
              {saveState === "saving" && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-[11px] text-[#D99E55]">
                  <Skeleton className="size-3 rounded-full" />保存中
                </motion.span>
              )}
              {saveState === "saved" && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-[11px] text-[#6FAA7D]">
                  <CheckCircle2 className="size-3 stroke-[1.5]" />已保存
                </motion.span>
              )}
              {saveState === "error" && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-[11px] text-[#C9604D]">
                  <AlertCircle className="size-3 stroke-[1.5]" />保存失败
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 hidden sm:inline">启用</span>
            <Switch
              checked={feature.is_enabled}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={(checked) => onPatch({ is_enabled: checked })}
              aria-label={`${feature.metadata.title} 启用开关`}
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="size-6 rounded-full text-zinc-500 hover:bg-zinc-100 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-label={`${isExpanded ? "收起" : "展开"} ${feature.metadata.title} 配置`}
          >
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              <ChevronDown className="size-4" />
            </motion.div>
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id={`feature-config-${feature.id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-zinc-200 bg-zinc-50 p-4">
              <div className="space-y-2">
                <Label
                  htmlFor={`feature-channel-${feature.id}`}
                  className="text-[11px] font-medium text-zinc-500"
                >
                  指定渠道
                </Label>
                <Select
                  value={feature.channel_id || AUTO_CHANNEL_VALUE}
                  onValueChange={handleChannelChange}
                  items={[
                    { value: AUTO_CHANNEL_VALUE, label: "系统自动分配（failover）" },
                    ...channels.map((channel) => ({ value: channel.id, label: channel.name })),
                  ]}
                >
                  <SelectTrigger
                    id={`feature-channel-${feature.id}`}
                    className="h-8 rounded-lg border-zinc-200 bg-white text-[12px] shadow-sm transition-colors focus-visible:bg-white"
                  >
                    <SelectValue>
                      {(() => {
                        const currentId = feature.channel_id;
                        if (!currentId) return "系统自动分配（failover）";
                        const found = channels.find((c) => c.id === currentId);
                        return found?.name ?? feature.channel_name ?? "未知渠道";
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_CHANNEL_VALUE}>系统自动分配（failover）</SelectItem>
                    {channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {channel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-zinc-400">
                  留空则使用系统自动分配（failover）逻辑
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor={`feature-model-${feature.id}`}
                  className="text-[11px] font-medium text-zinc-500"
                >
                  指定模型
                </Label>
                <Input
                  id={`feature-model-${feature.id}`}
                  value={feature.model}
                  onChange={(e) => onPatch({ model: e.target.value })}
                  placeholder="留空则跟随渠道默认模型"
                  className="h-8 rounded-lg border-zinc-200 bg-white text-[12px] shadow-sm transition-colors focus-visible:bg-white"
                />
                <p className="text-[11px] text-zinc-400">
                  当前：{feature.model.trim() || "跟随渠道默认模型"}
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor={`feature-system-prompt-${feature.id}`}
                  className="text-[11px] font-medium text-zinc-500"
                >
                  系统提示词 (System Prompt)
                </Label>
                <Textarea
                  id={`feature-system-prompt-${feature.id}`}
                  value={feature.system_prompt}
                  onChange={(e) => onPatch({ system_prompt: e.target.value })}
                  placeholder="留空则使用该功能默认提示词"
                  className="min-h-[80px] resize-y rounded-lg border-zinc-200 bg-white text-[12px] shadow-sm transition-colors focus-visible:bg-white"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
