"use client";

import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { AiFeatureCardItem } from "./types";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChannelFeatureCardProps {
  feature: AiFeatureCardItem;
  currentChannelId: string;
  isExpanded: boolean;
  saveState: "idle" | "pending" | "saving" | "saved" | "error";
  onToggleExpand: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
}

export function ChannelFeatureCard({
  feature,
  currentChannelId,
  isExpanded,
  saveState,
  onToggleExpand,
  onPatch,
}: ChannelFeatureCardProps) {
  const isBoundToCurrent = feature.channel_id === currentChannelId;
  const isAutoAllocated = !feature.channel_id;
  const isBoundToOther = !isBoundToCurrent && !isAutoAllocated;

  const handleSwitchChange = (checked: boolean) => {
    onPatch({ channel_id: checked ? currentChannelId : "" });
  };

  const hasCustomModel = Boolean(feature.model.trim());

  return (
    <div 
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border transition-all duration-200",
        isBoundToCurrent 
          ? "border-primary/30 bg-primary/5 shadow-[0_4px_12px_rgba(var(--primary),0.05)]" 
          : "border-border/60 bg-white/60 hover:bg-white/80"
      )}
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-[var(--color-text-primary)] leading-none">{feature.metadata.title}</h4>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-full font-normal border-border/50 text-[var(--color-text-tertiary)]">
              {feature.metadata.group}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            {isBoundToCurrent ? (
              <span className="text-primary font-medium">已绑定此渠道</span>
            ) : isAutoAllocated ? (
              <span className="text-[var(--color-text-tertiary)]">自动分配</span>
            ) : (
              <span className="text-[var(--color-text-secondary)]">已绑定至: {feature.channel_name || '其他渠道'}</span>
            )}
            
            {saveState === "saving" && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
            {saveState === "saved" && <span className="text-[10px] text-emerald-500">已保存</span>}
            {saveState === "error" && <span className="text-[10px] text-destructive">保存失败</span>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch 
            checked={isBoundToCurrent} 
            onCheckedChange={handleSwitchChange}
          />
          <Button 
            variant="ghost" 
            size="icon" 
            className="size-8 rounded-full text-muted-foreground hover:bg-black/5"
            onClick={onToggleExpand}
          >
            {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border/40 bg-white/40 p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">专属模型</Label>
              {hasCustomModel ? (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onPatch({ model: "", _clearCustomModel: true })}
                >
                  清除专属模型
                </Button>
              ) : (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-[10px]"
                  onClick={() => onPatch({ _setCustomModel: true })}
                >
                  设置专属模型
                </Button>
              )}
            </div>
            
            <Input 
              value={feature.model} 
              onChange={(e) => onPatch({ model: e.target.value })}
              placeholder="留空则跟随渠道默认模型"
              disabled={!hasCustomModel && !feature.model}
              className="rounded-xl border-border/60 bg-white focus-visible:bg-white h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">系统提示词 (System Prompt)</Label>
            <Textarea 
              value={feature.system_prompt} 
              onChange={(e) => onPatch({ system_prompt: e.target.value })}
              placeholder="该功能的专属系统提示词..."
              className="min-h-[100px] resize-y rounded-xl border-border/60 bg-white focus-visible:bg-white text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
