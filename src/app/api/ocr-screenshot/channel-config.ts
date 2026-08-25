/**
 * 截图识别通道开关的读取入口：异步读 ai_feature_bindings 的 channel_settings，默认 baidu。
 * 保存即生效（每次请求直读数据库，无缓存），读取失败按默认 baidu 兜底。
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseOcrScreenshotChannel,
  type OcrChannelSettingsRow,
  type OcrScreenshotChannel,
} from "@/lib/ai-config/ocr-channel";

export type { OcrScreenshotChannel };

export type OcrChannelSettingsFetcher = () => Promise<OcrChannelSettingsRow | null>;

export async function fetchOcrChannelSettingsRow(): Promise<OcrChannelSettingsRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_feature_bindings")
    .select("channel_settings")
    .eq("feature_key", "ocr_screenshot")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as OcrChannelSettingsRow | null) ?? null;
}

export async function resolveOcrScreenshotChannel(
  fetcher: OcrChannelSettingsFetcher = fetchOcrChannelSettingsRow,
): Promise<OcrScreenshotChannel> {
  try {
    return parseOcrScreenshotChannel(await fetcher());
  } catch {
    return "baidu";
  }
}
