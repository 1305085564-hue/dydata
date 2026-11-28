import {
getServiceSupabaseClient,
type ChannelConfig
} from "@/lib/ai/client-routing";
import { recordProviderFailure,recordProviderSuccess } from "@/lib/ai/provider-health-recorder";
import { AiChannelError } from "./client-errors";

export async function markChannelSuccess(channel: ChannelConfig) {
  try {
    if (channel.source === "provider_key_model" && channel.providerKeyId) {
      const supabase = getServiceSupabaseClient();
      if (!supabase) return;
      await recordProviderSuccess({
        service: supabase,
        providerKeyId: channel.providerKeyId,
        providerKeyModelId: channel.providerKeyModelId,
      });
    }
  } catch (error) {
    // 健康记录是遥测旁路。上游已经成功时，记录失败不能覆盖业务结果。
    console.warn("[ai-client] provider success marker skipped", error);
  }
}

export async function markChannelFailure(channel: ChannelConfig, error: AiChannelError) {
  if (channel.source === "provider_key_model" && channel.providerKeyId) {
    const supabase = getServiceSupabaseClient();
    if (!supabase) return;
    try {
      await recordProviderFailure({
        service: supabase,
        providerKeyId: channel.providerKeyId,
        providerKeyModelId: channel.providerKeyModelId,
        errorType: error.errorType,
        message: error.message,
      });
    } catch (error) {
      console.warn("[ai-client] provider key failure marker skipped", error);
    }
  }
}
