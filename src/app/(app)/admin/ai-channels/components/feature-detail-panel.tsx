"use client";

import { CheckCircle2, Clock, AlertCircle, RefreshCcw } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { AiChannelRow, AiFeatureCardItem, FeatureSaveState } from "./types";

const AUTO_CHANNEL_VALUE = "__auto__";

interface FeatureDetailPanelProps {
  feature: AiFeatureCardItem | null;
  channels: AiChannelRow[];
  saveState: FeatureSaveState;
  onPatch: (patch: Record<string, unknown>) => void;
}

export function FeatureDetailPanel({
  feature,
  channels,
  saveState,
  onPatch,
}: FeatureDetailPanelProps) {
  if (!feature) {
    return (
      <div className="flex min-h-[480px] flex-1 items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white p-12 text-center">
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-zinc-500">从左侧列表挑一个 AI 功能</p>
          <p className="text-[12px] text-zinc-400">渠道、模型与系统提示词将在此处编辑。</p>
        </div>
      </div>
    );
  }

  const handleChannelChange = (value: string | null) => {
    if (!value || value === AUTO_CHANNEL_VALUE) {
      onPatch({ channel_id: "", channel_name: null });
      return;
    }
    const nextChannel = channels.find((channel) => channel.id === value);
    onPatch({ channel_id: value, channel_name: nextChannel?.name ?? null });
  };

  const promptChars = feature.system_prompt.length;
  const hasCustomPrompt = feature.system_prompt.trim().length > 0;

  return (
    <motion.div
      key={feature.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-1 flex-col gap-6 rounded-2xl border border-zinc-200 bg-white"
    >
      <header className="flex flex-col gap-4 border-b border-zinc-200 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="border-l-2 border-[#D97757] pl-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            {feature.metadata.group}
          </p>
          <h3 className="mt-1.5 text-[18px] font-medium leading-[1.4] tracking-tight text-zinc-800">
            {feature.metadata.title}
          </h3>
          <p className="mt-2 text-[12px] leading-[1.7] text-zinc-500">
            位置：{feature.metadata.location}
          </p>
        </div>

        <div className="flex items-center gap-4 sm:self-start">
          <SaveStateChip state={saveState} />
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-zinc-500">启用</span>
            <Switch
              checked={feature.is_enabled}
              onCheckedChange={(checked) => onPatch({ is_enabled: checked })}
              aria-label={`${feature.metadata.title} 启用开关`}
            />
          </div>
        </div>
      </header>

      <div className="grid gap-4 px-6 sm:grid-cols-2">
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
              className="h-9 rounded-lg border-transparent bg-zinc-100/70 text-[13px] transition-colors focus-visible:bg-white focus-visible:border-zinc-200"
            >
              <SelectValue>
                {(() => {
                  if (!feature.channel_id) return "系统自动分配（failover）";
                  const found = channels.find((c) => c.id === feature.channel_id);
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
          <p className="text-[11px] text-zinc-400">留空则走 failover 自动分配</p>
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
            className="h-9 rounded-lg border-transparent bg-zinc-100/70 font-mono text-[13px] text-zinc-800 transition-colors focus-visible:bg-white focus-visible:border-zinc-200"
          />
          <p className="text-[11px] text-zinc-400">
            当前：{feature.model.trim() || "跟随渠道默认模型"}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-6">
        <div className="flex items-end justify-between">
          <Label
            htmlFor={`feature-system-prompt-${feature.id}`}
            className="text-[11px] font-medium text-zinc-500"
          >
            系统提示词 · System Prompt
          </Label>
          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <span className="tabular-nums">{promptChars.toLocaleString()} 字符</span>
            {hasCustomPrompt && (
              <button
                type="button"
                onClick={() => onPatch({ system_prompt: "" })}
                className="inline-flex items-center gap-1 text-zinc-500 transition-colors hover:text-zinc-800"
              >
                <RefreshCcw className="size-3 stroke-[1.5]" />
                恢复默认
              </button>
            )}
          </div>
        </div>

        <Textarea
          id={`feature-system-prompt-${feature.id}`}
          value={feature.system_prompt}
          onChange={(e) => onPatch({ system_prompt: e.target.value })}
          placeholder="留空则使用该功能默认提示词。在这里可以写完整的角色设定、输入约定、输出格式样例。"
          className="min-h-[360px] flex-1 resize-y rounded-xl border-transparent bg-zinc-100/70 p-4 font-mono text-[13px] leading-[1.7] text-zinc-800 transition-colors focus-visible:bg-white focus-visible:border-zinc-200 xl:min-h-[440px]"
        />
      </div>

      <section className="m-6 mt-2 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
          业务说明
        </p>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <MetaRow label="作用" value={feature.metadata.purpose} />
          <MetaRow label="建议什么时候配" value={feature.metadata.recommendedWhen} />
          <MetaRow label="输入" value={feature.metadata.inputSummary} />
          <MetaRow label="输出" value={feature.metadata.outputSummary} />
        </dl>
      </section>
    </motion.div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">
        {label}
      </dt>
      <dd className="text-[13px] leading-[1.7] text-zinc-700">{value}</dd>
    </div>
  );
}

function SaveStateChip({ state }: { state: FeatureSaveState }) {
  return (
    <div className="flex min-w-[78px] items-center justify-end">
      <AnimatePresence mode="popLayout">
        {state === "pending" && (
          <motion.span
            key="pending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1 text-[11px] text-[#D99E55]"
          >
            <Clock className="size-3 stroke-[1.5]" />
            待保存
          </motion.span>
        )}
        {state === "saving" && (
          <motion.span
            key="saving"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1 text-[11px] text-[#D99E55]"
          >
            <Skeleton className="size-3 rounded-full" />
            保存中
          </motion.span>
        )}
        {state === "saved" && (
          <motion.span
            key="saved"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "flex items-center gap-1 text-[11px] text-[#6FAA7D]",
            )}
          >
            <CheckCircle2 className="size-3 stroke-[1.5]" />
            已保存
          </motion.span>
        )}
        {state === "error" && (
          <motion.span
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1 text-[11px] text-[#C9604D]"
          >
            <AlertCircle className="size-3 stroke-[1.5]" />
            保存失败
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
