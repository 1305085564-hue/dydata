"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { AiChannelRow, AiFeatureCardItem } from "./types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  const isAutoAllocated = !feature.channel_id;
  const isBoundToOther = !isBoundToCurrent && !isAutoAllocated;

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

  // Determine the visual style based on the state
  const stateStyles = isBoundToCurrent
    ? "border-primary/20 bg-primary/[0.03] shadow-[0_4px_12px_rgba(var(--primary),0.05)] ring-1 ring-primary/10 hover:shadow-md hover:-translate-y-0.5"
    : isAutoAllocated
    ? "border-border/40 bg-white/40 hover:bg-white/60 hover:border-border/60 hover:-translate-y-0.5 hover:shadow-sm"
    : "border-border/30 bg-muted/20 opacity-80 hover:opacity-100 hover:border-border/50";

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border transition-all duration-300",
        stateStyles
      )}
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h4 className={cn("font-medium leading-none transition-colors",
              isBoundToOther ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-primary)]"
            )}>
              {feature.metadata.title}
            </h4>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-full font-normal border-border/50 text-[var(--color-text-tertiary)] bg-transparent">
              {feature.metadata.group}
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-xs h-4 relative">
            <AnimatePresence mode="wait">
              {isBoundToCurrent ? (
                <motion.span
                  key="current"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="text-primary font-medium"
                >
                  当前查看渠道
                </motion.span>
              ) : isAutoAllocated ? (
                <motion.span
                  key="auto"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="text-[var(--color-text-tertiary)]"
                >
                  默认自动（failover）
                </motion.span>
              ) : (
                <motion.span
                  key="other"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="text-[var(--color-text-secondary)]"
                >
                  已指定：{feature.channel_name || "其他渠道"}
                </motion.span>
              )}
            </AnimatePresence>

            <div className="ml-auto flex min-w-[48px] items-center justify-end">
              <AnimatePresence mode="popLayout">
                {saveState === "pending" && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[10px] text-amber-600">
                    待保存
                  </motion.span>
                )}
                {saveState === "saving" && (
                  <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                    <Loader2 className="size-3 animate-spin text-muted-foreground" />
                  </motion.div>
                )}
                {saveState === "saved" && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[10px] text-emerald-500">
                    已保存
                  </motion.span>
                )}
                {saveState === "error" && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[10px] text-destructive">
                    保存失败
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full text-muted-foreground hover:bg-black/5"
          onClick={onToggleExpand}
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

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/20 bg-gradient-to-b from-white/20 to-white/60 p-4 space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor={`feature-channel-${feature.id}`}
                  className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]"
                >
                  指定渠道
                </Label>
                <Select
                  value={feature.channel_id || AUTO_CHANNEL_VALUE}
                  onValueChange={handleChannelChange}
                >
                  <SelectTrigger
                    id={`feature-channel-${feature.id}`}
                    className="h-8 rounded-lg border-border/40 bg-white/50 text-xs shadow-sm transition-colors focus-visible:bg-white"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_CHANNEL_VALUE}>默认自动（failover）</SelectItem>
                    {channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {channel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">
                  留空不指定渠道，继续走全局自动 / failover 逻辑
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor={`feature-model-${feature.id}`}
                  className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]"
                >
                  指定模型
                </Label>
                <Input
                  id={`feature-model-${feature.id}`}
                  value={feature.model}
                  onChange={(e) => onPatch({ model: e.target.value })}
                  placeholder="留空则跟随渠道默认模型"
                  className="rounded-lg border-border/40 bg-white/50 focus-visible:bg-white h-8 text-xs shadow-sm transition-colors"
                />
                <p className="text-[11px] text-[var(--color-text-tertiary)]">
                  当前：{feature.model.trim() || "跟随渠道默认模型"}
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor={`feature-system-prompt-${feature.id}`}
                  className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]"
                >
                  系统提示词 (System Prompt)
                </Label>
                <Textarea
                  id={`feature-system-prompt-${feature.id}`}
                  value={feature.system_prompt}
                  onChange={(e) => onPatch({ system_prompt: e.target.value })}
                  placeholder="该功能的专属系统提示词..."
                  className="min-h-[80px] resize-y rounded-lg border-border/40 bg-white/50 focus-visible:bg-white text-xs shadow-sm transition-colors"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
