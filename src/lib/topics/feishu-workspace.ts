import type { SupabaseClient } from "@supabase/supabase-js";

export const TOPICS_FEISHU_WORKSPACE_KEY = "topics_feishu_workspace_url";

export type FeishuWorkspaceUrlValidation =
  | { ok: true; url: string }
  | { ok: false; reason: "empty" | "invalid" };

/** 内网 / 环回 / 元数据地址黑名单：管理员配置的飞书地址不允许指向这些范围，
 *  避免 SSRF（浏览器打开可泄露云元数据 / 内网服务）。 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal", // GCP 元数据
  "metadata.azure.com", // Azure 元数据（IMDS）
  "169.254.169.254", // AWS/GCP/Azure 元数据 IP（aws docs / gcp / az）
  "metadata.aws.internal",
]);

function normalizeHostname(hostname: string): string {
  const lower = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (lower.startsWith("[") && lower.endsWith("]")) {
    return lower.slice(1, -1);
  }
  return lower;
}

/** 判定主机是否落在内网 / 环回 / 链路本地 / 运营商级元数据范围。
 *  覆盖 IPv4 私网段、环回、链路本地、元数据 IP，以及 IPv6 环回/ULA/链路本地。 */
function isInternalOrLoopbackHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (BLOCKED_HOSTNAMES.has(normalized) || normalized.endsWith(".localhost")) return true;
  // IPv4 字面量
  const m = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = m.slice(1, 3).map(Number);
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 127) return true;                      // 127.0.0.0/8 环回
    if (a === 169 && b === 254) return true;          // 169.254.0.0/16 链路本地 + 云元数据
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 0 || (a === 255 && b === 255)) return true; // 0.0.0.0 / 255.255.255.255
  }
  // IPv6 环回、ULA(fc00::/7) 与链路本地(fe80::/10)。
  if (normalized === "::1" || /^0*:0*:0*:0*:0*:0*:0*:1$/i.test(normalized)) return true;
  if (/^(fc|fd)[0-9a-f]{0,2}:/i.test(normalized)) return true;
  if (/^fe[89ab][0-9a-f]?:/i.test(normalized)) return true;
  if (/^::ffff:(127|10|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168)\./i.test(normalized)) return true;
  return false;
}

/** 飞书固定地址只允许安全的 https 链接；未配置与非法地址都要能被明确识别。
 *  额外封禁内网 / 环回 / 元数据地址，避免 SSRF。 */
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
  if (isInternalOrLoopbackHost(parsed.hostname)) {
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
