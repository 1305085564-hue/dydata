import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type HostnameResolver = (
  hostname: string
) => Promise<Array<{ address: string; family: number }>>;

function normalizeIpLiteral(address: string) {
  const withoutBrackets = address.replace(/^\[|\]$/g, "").toLowerCase();
  const mappedIpv4 = withoutBrackets.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ?? withoutBrackets;
}

export function isPublicIpAddress(rawAddress: string) {
  const address = normalizeIpLiteral(rawAddress);
  const family = isIP(address);

  if (family === 4) {
    const octets = address.split(".").map(Number);
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }

  if (family === 6) {
    if (address === "::" || address === "::1") return false;
    if (address.startsWith("fc") || address.startsWith("fd")) return false;
    if (/^fe[89ab]/.test(address) || address.startsWith("ff")) return false;
    if (address.startsWith("2001:db8:")) return false;
    return /^(2|3)[0-9a-f]{3}:/.test(address);
  }

  return false;
}

function parseExternalHttpsUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("AI 渠道地址格式不正确");
  }

  if (url.protocol !== "https:") {
    throw new Error("AI 渠道地址必须使用 HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("AI 渠道地址不能携带账号密码");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("AI 渠道地址必须指向公网服务");
  }

  if (isIP(hostname) && !isPublicIpAddress(hostname)) {
    throw new Error("AI 渠道地址必须指向公网服务");
  }

  return url;
}

const defaultResolver: HostnameResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

export async function assertSafeExternalHttpsUrl(
  value: string,
  resolver: HostnameResolver = defaultResolver
) {
  const url = parseExternalHttpsUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolver(hostname).catch(() => []);

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error("AI 渠道地址必须解析到公网服务");
  }

  return url.toString();
}

export const __internal = { parseExternalHttpsUrl };
