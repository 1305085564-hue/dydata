import { AlertCircle, Clock } from "lucide-react";
import type { ChannelIdentity } from "@/lib/ai/channel-governance";
import { AI_CONFIG_MESSAGES, formatSleepCountdown } from "@/lib/ai-config/presentation";

/** 渠道的五种状态小标签（能用 / 待复测 / 暂时歇着 / 需要你处理 / 已停用），值班表与渠道维护共用。 */
export function ChannelStatusChip({ identity, sleepUntil }: { identity: ChannelIdentity; sleepUntil?: string | null }) {
  switch (identity) {
    case "active":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-[#4B6B4E]/10 px-2 py-0.5 text-[12px] text-[#4B6B4E]">
          <span className="size-1.5 rounded-full bg-[#4B6B4E]" />
          {AI_CONFIG_MESSAGES["channel.usable"]}
        </span>
      );
    case "retest":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-[#8A6A2F]/10 px-2 py-0.5 text-[12px] text-[#8A6A2F]">
          <span className="size-1.5 rounded-full bg-[#8A6A2F]" />
          {AI_CONFIG_MESSAGES["channel.retest"]}
        </span>
      );
    case "sleeping":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-[#F1F1F0] px-2 py-0.5 text-[12px] text-[#78716C]">
          <Clock className="size-3" />
          {AI_CONFIG_MESSAGES["channel.cooling"]} · {formatSleepCountdown(sleepUntil ?? null)}
        </span>
      );
    case "invalid":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-status-danger/[0.10] px-2 py-0.5 text-[12px] text-status-danger-text">
          <AlertCircle className="size-3" />
          {AI_CONFIG_MESSAGES["channel.action_required"]}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-[#F1F1F0] px-2 py-0.5 text-[12px] text-[#78716C]">
          {AI_CONFIG_MESSAGES["channel.disabled"]}
        </span>
      );
  }
}
