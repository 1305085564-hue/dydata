import type { SupabaseClient } from "@supabase/supabase-js";

export const TOPICS_FEISHU_WORKSPACE_KEY = "topics_feishu_workspace_url";

export type FeishuWorkspaceUrlValidation =
  | { ok: true; url: string }
  | { ok: false; reason: "empty" | "invalid" };

/** 飞书固定地址只允许安全的 https 链接；未配置与非法地址都要能被明确识别。 */
export function validateFeishuWorkspaceUrl(raw: unknown): FeishuWorkspaceUrlValidation {
  if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) {
    return { ok: false, reason: "empty" };
  }
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (parsed.protocol !== "https:" || !parsed.hostname) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, url: parsed.toString() };
}

export async function loadFeishuWorkspaceUrl(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", TOPICS_FEISHU_WORKSPACE_KEY)
    .maybeSingle();
  if (error || !data) return null;
  const value = (data as { value?: unknown }).value;
  const url = typeof value === "string"
    ? value
    : value && typeof value === "object" && typeof (value as { url?: unknown }).url === "string"
      ? (value as { url: string }).url
      : null;
  if (!url) return null;
  const validated = validateFeishuWorkspaceUrl(url);
  return validated.ok ? validated.url : null;
}
