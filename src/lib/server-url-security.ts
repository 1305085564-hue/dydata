import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

type ExternalRequestInit = NonNullable<Parameters<typeof undiciFetch>[1]>;
type ExternalResponse = Awaited<ReturnType<typeof undiciFetch>>;
type ExternalFetch = typeof undiciFetch;
type ResolvedAddress = { address: string; family: 4 | 6 };
type PinnedLookup = (
  hostname: string,
  options: { all?: boolean },
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | ResolvedAddress[],
    family?: number,
  ) => void,
) => void;

export type HostnameResolver = (
  hostname: string
) => Promise<Array<{ address: string; family: number }>>;

export type SafeExternalHttpsTarget = {
  url: URL;
  hostname: string;
  addresses: ResolvedAddress[];
  pinnedAddress: ResolvedAddress;
};

type PinnedRequestDependencies = {
  resolver?: HostnameResolver;
  fetchImpl?: ExternalFetch;
  agentFactory?: (lookup: PinnedLookup, target: SafeExternalHttpsTarget) => Agent;
};

function normalizeIpLiteral(address: string) {
  const withoutBrackets = address.replace(/^\[|\]$/g, "").toLowerCase();
  const mappedIpv4 = withoutBrackets.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ?? withoutBrackets;
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
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

  const hostname = normalizeHostname(url.hostname);
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

export async function resolveSafeExternalHttpsTarget(
  value: string,
  resolver: HostnameResolver = defaultResolver,
): Promise<SafeExternalHttpsTarget> {
  const url = parseExternalHttpsUrl(value);
  const hostname = normalizeHostname(url.hostname);
  const resolved = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolver(hostname).catch(() => []);
  const addresses = resolved
    .map(({ address, family }) => ({
      address: normalizeIpLiteral(address),
      family,
    }))
    .filter(
      (entry): entry is ResolvedAddress =>
        (entry.family === 4 || entry.family === 6) && isIP(entry.address) === entry.family,
    );

  if (
    addresses.length === 0 ||
    addresses.length !== resolved.length ||
    addresses.some(({ address }) => !isPublicIpAddress(address))
  ) {
    throw new Error("AI 渠道地址必须解析到公网服务");
  }

  return {
    url,
    hostname,
    addresses,
    pinnedAddress: addresses[0],
  };
}

function createPinnedLookup(target: SafeExternalHttpsTarget): PinnedLookup {
  return (requestedHostname, options, callback) => {
    if (normalizeHostname(requestedHostname) !== target.hostname) {
      const error = Object.assign(new Error("hostname changed after validation"), {
        code: "ENOTFOUND",
      }) as NodeJS.ErrnoException;
      callback(error, "", 0);
      return;
    }

    if (options?.all) {
      callback(null, [target.pinnedAddress]);
      return;
    }
    callback(null, target.pinnedAddress.address, target.pinnedAddress.family);
  };
}

export async function withPinnedExternalResponse<T>(
  value: string,
  init: ExternalRequestInit,
  consume: (response: ExternalResponse) => Promise<T>,
  dependencies: PinnedRequestDependencies = {},
): Promise<T> {
  const target = await resolveSafeExternalHttpsTarget(value, dependencies.resolver);
  const pinnedLookup = createPinnedLookup(target);
  const dispatcher = dependencies.agentFactory
    ? dependencies.agentFactory(pinnedLookup, target)
    : new Agent({
        connect: {
          lookup: pinnedLookup,
          servername: target.hostname,
        },
        connections: 1,
      });
  const fetchImpl = dependencies.fetchImpl ?? undiciFetch;
  let response: ExternalResponse | undefined;
  let completed = false;

  try {
    response = await fetchImpl(target.url, {
      ...init,
      dispatcher,
      redirect: "manual",
    });
    const result = await consume(response);
    completed = true;
    return result;
  } catch (error) {
    await response?.body?.cancel().catch(() => undefined);
    await dispatcher.destroy(error instanceof Error ? error : new Error("AI upstream request failed"));
    throw error;
  } finally {
    if (completed) {
      if (response && !response.bodyUsed) {
        await response.body?.cancel().catch(() => undefined);
      }
      await dispatcher.close();
    }
  }
}

export async function assertSafeExternalHttpsUrl(
  value: string,
  resolver: HostnameResolver = defaultResolver
) {
  return (await resolveSafeExternalHttpsTarget(value, resolver)).url.toString();
}

export const __internal = { createPinnedLookup, parseExternalHttpsUrl };
