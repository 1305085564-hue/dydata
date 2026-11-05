import type { AiConfigSupabase } from "./batch-actions";
import { toTrimmedString } from "@/lib/type-guards";

export function normalizeChannelAddress(value: unknown): string {
  const url = new URL(toTrimmedString(value));
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("渠道地址须为 HTTP/HTTPS 地址，不能带钥匙、查询参数或片段");
  }
  return url.href.replace(/\/+$/, "");
}

/** Direct address entry reuses the address group; old provider-id creation stays compatible. */
export async function resolveChannelGroup(supabase: AiConfigSupabase, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!toTrimmedString(data.base_url)) return data;
  const baseUrl = normalizeChannelAddress(data.base_url);
  const { data: groups, error } = await supabase.from("ai_providers").select("id, base_url");
  if (error) throw new Error(error.message);
  const existing = (groups ?? []).find((group: { base_url: string }) => normalizeChannelAddress(group.base_url) === baseUrl);
  if (existing) return { ...data, provider_id: existing.id, label: toTrimmedString(data.label) || new URL(baseUrl).host };
  const { data: created, error: insertError } = await supabase.from("ai_providers")
    .insert({ name: toTrimmedString(data.provider_name) || new URL(baseUrl).host, base_url: baseUrl, is_enabled: true })
    .select("id").single();
  if (insertError || !created) throw new Error(insertError?.message || "创建地址分组失败");
  return { ...data, provider_id: created.id, label: toTrimmedString(data.label) || new URL(baseUrl).host };
}

export type SharedAddressImpact = { providerId: string; affectedKeyCount: number; affectedKeys: Array<{ id: string; label: string }> };

/** The caller updates the shared group only after this server-side confirmation. */
export async function requireSharedAddressConfirmation(supabase: AiConfigSupabase, providerId: string, baseUrl: string, confirmed: boolean): Promise<SharedAddressImpact> {
  const { data: provider, error } = await supabase.from("ai_providers").select("base_url").eq("id", providerId).single();
  if (error || !provider) throw new Error(error?.message || "地址分组不存在");
  const { data: keys, error: keysError } = await supabase.from("ai_provider_keys").select("id, label").eq("provider_id", providerId);
  if (keysError) throw new Error(keysError.message);
  const impact: SharedAddressImpact = { providerId, affectedKeyCount: (keys ?? []).length, affectedKeys: keys ?? [] };
  if (normalizeChannelAddress(provider.base_url) !== baseUrl && impact.affectedKeyCount > 1 && !confirmed) {
    throw Object.assign(new Error(`同地址的 ${impact.affectedKeyCount} 条渠道会一起改，请确认`), {
      status: 409, requiresConfirmation: true, sharedAddressImpact: impact,
    });
  }
  return impact;
}
