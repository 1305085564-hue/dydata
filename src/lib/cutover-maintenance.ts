const CUTOVER_PROBE_HEADER = "x-dydata-cutover-probe";
const MIN_PROBE_TOKEN_LENGTH = 32;
const MAX_PROBE_TOKEN_LENGTH = 512;
const MAX_PROBE_WINDOW_MS = 4 * 60 * 60 * 1000;
const ALLOWED_PROBE_HOSTS = new Set(["dydata.cc", "direct.dydata.cc"]);
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

type CutoverProbeRequest = Pick<Request, "url" | "headers">;

// Keep the pre-cutover middleware coverage unchanged when maintenance is off.
// The global matcher exists only so a POST/Server Action on any page cannot
// bypass the maintenance gate during an explicitly authorized cutover window.
export function isApplicationMiddlewarePath(pathname: string) {
  return ["/", "/login", "/register", "/forgot-password", "/auth/logout"].includes(pathname) ||
    ["/dashboard", "/admin", "/violations", "/content-tools", "/douyin", "/api"]
      .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isHighEntropyProbeToken(value: string | undefined): value is string {
  return Boolean(
    value &&
      value.length >= MIN_PROBE_TOKEN_LENGTH &&
      value.length <= MAX_PROBE_TOKEN_LENGTH &&
      /^[A-Za-z0-9_-]+$/.test(value),
  );
}

function constantTimeTokenEquals(expected: string, actual: string) {
  if (expected.length !== actual.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return difference === 0;
}

function isValidProbeExpiry(value: string | undefined, now: number) {
  if (!value || !UTC_TIMESTAMP_PATTERN.test(value)) return false;

  const expiry = Date.parse(value);
  if (!Number.isFinite(expiry)) return false;

  const canonicalValue = value.replace(/(?:\.(\d{1,3}))?Z$/, (_match, fraction: string | undefined) =>
    `.${(fraction ?? "").padEnd(3, "0")}Z`,
  );
  if (new Date(expiry).toISOString() !== canonicalValue) return false;

  return expiry > now && expiry - now <= MAX_PROBE_WINDOW_MS;
}

function isAuthorizedCutoverProbe(request: CutoverProbeRequest | undefined) {
  if (!request) return false;

  const configuredToken = process.env.DYDATA_CUTOVER_PROBE_TOKEN;
  const receivedToken = request.headers.get(CUTOVER_PROBE_HEADER) ?? undefined;
  if (!isHighEntropyProbeToken(configuredToken) || !isHighEntropyProbeToken(receivedToken)) {
    return false;
  }
  if (!constantTimeTokenEquals(configuredToken, receivedToken)) return false;

  const now = Date.now();
  if (!isValidProbeExpiry(process.env.DYDATA_CUTOVER_PROBE_EXPIRES_AT, now)) return false;

  try {
    const url = new URL(request.url);
    return url.protocol === "https:" &&
      ALLOWED_PROBE_HOSTS.has(url.hostname) &&
      url.port === "" &&
      url.username === "" &&
      url.password === "";
  } catch {
    return false;
  }
}

export function cutoverMaintenanceResponse(
  pathname: string,
  enabled = process.env.DYDATA_WRITE_FREEZE === "1",
  request?: CutoverProbeRequest,
) {
  if (!enabled || pathname === "/api/health") return null;
  if (isAuthorizedCutoverProbe(request)) return null;

  return new Response("系统正在切换到新服务器，预计明天上午前恢复。维护期间请勿重复提交，稍后重新打开即可正常使用；如有急事请联系管理员。", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "retry-after": "300", "x-dydata-maintenance": "1" },
  });
}
