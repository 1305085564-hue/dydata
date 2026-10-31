import { KEEP_LOGGED_IN_MAX_AGE } from "@/lib/supabase/session-cookie";

export const CLOUD_BASE_SESSION_COOKIE = "dydata-cloudbase-session";

export type CloudBaseSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  subject: string;
};

export type CloudBaseAuthToken = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  sub: string;
};

export function hasCloudBaseSessionChanged(previous: CloudBaseSession, next: CloudBaseSession) {
  return previous.accessToken !== next.accessToken ||
    previous.refreshToken !== next.refreshToken ||
    previous.expiresAt !== next.expiresAt ||
    previous.subject !== next.subject;
}

export function isCloudBaseBackend() {
  if (typeof window !== "undefined") return process.env.NEXT_PUBLIC_DYDATA_BACKEND === "cloudbase";
  return process.env.DYDATA_BACKEND === "cloudbase" || process.env.NEXT_PUBLIC_DYDATA_BACKEND === "cloudbase";
}

export function cloudBaseEnvironmentId() {
  const envId = typeof window === "undefined"
    ? process.env.CLOUDBASE_ENV_ID || process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID
    : process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
  if (!envId || !/^[a-zA-Z0-9-]+$/.test(envId)) {
    throw new Error("CloudBase 环境未配置");
  }
  return envId;
}

export function cloudBaseGatewayUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${cloudBaseEnvironmentId()}.api.tcloudbasegateway.com${normalizedPath}`;
}

export function cloudBaseRestUrl(input: string | URL, browserProxy = false) {
  const source = input instanceof URL ? input : new URL(input, "https://supabase-adapter.invalid");
  const marker = "/rest/v1/";
  const restIndex = source.pathname.indexOf(marker);
  if (restIndex < 0) throw new Error("CloudBase 数据请求路径无效");
  const restPath = source.pathname.slice(restIndex + marker.length);
  const search = source.search;
  if (browserProxy) {
    return `/api/cloudbase/rdb/rest/${restPath}${search}`;
  }
  return `${cloudBaseGatewayUrl(`/v1/rdb/rest/${restPath}`)}${search}`;
}

export function makeCloudBaseSession(token: CloudBaseAuthToken, now = Date.now()): CloudBaseSession {
  if (!token.access_token || !token.refresh_token || !Number.isFinite(token.expires_in) || !token.sub) {
    throw new Error("CloudBase 登录响应缺少必要字段");
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: now + Math.max(0, token.expires_in) * 1000,
    subject: token.sub,
  };
}

export function serializeCloudBaseSession(session: CloudBaseSession) {
  return encodeURIComponent(JSON.stringify(session));
}

export function parseCloudBaseSession(value?: string | null): CloudBaseSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<CloudBaseSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.subject !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) return null;
    return parsed as CloudBaseSession;
  } catch {
    return null;
  }
}

export function cloudBaseCookieOptions(keepLoggedIn: boolean, production = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true as const,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    ...(keepLoggedIn ? { maxAge: KEEP_LOGGED_IN_MAX_AGE } : {}),
  };
}

export function mapCloudBaseUser(profile: Record<string, unknown>) {
  if (typeof profile.sub !== "string" || !profile.sub) {
    throw new Error("CloudBase 用户响应缺少 subject");
  }
  const metadata: Record<string, unknown> = {};
  for (const key of ["name", "username", "phone", "providers", "meta"]) {
    if (profile[key] !== undefined) metadata[key] = profile[key];
  }
  const appMetadata: Record<string, unknown> = {};
  if (Array.isArray(profile.groups)) appMetadata.groups = profile.groups;
  return {
    id: profile.sub,
    email: typeof profile.email === "string" ? profile.email : undefined,
    user_metadata: metadata,
    app_metadata: appMetadata,
    aud: "authenticated",
    role: "authenticated",
  };
}

export class CloudBaseAuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code = "cloudbase_auth_error", safeMessage?: string) {
    super(safeMessage ?? (status === 401 ? "邮箱或密码不正确" : "CloudBase 认证暂时不可用"));
    this.name = "CloudBaseAuthError";
    this.status = status;
    this.code = code;
  }
}

function normalizeAuthFailure(path: string, status: number, payload: unknown): { status: number; code: string; message?: string } {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const code = typeof body.error_code === "number" ? String(body.error_code) : "";
  const errorName = typeof body.error === "string" ? body.error : "";
  const description = typeof body.error_description === "string" ? body.error_description : "";

  if (
    (path === "/auth/v1/signin" || path === "/auth/v1/user/me") &&
    status >= 400 && status < 500 &&
    code === "4013" &&
    errorName === "user_blocked"
  ) {
    return { status: 401, code: "user_blocked", message: "账号已归档，请联系 owner 恢复" };
  }

  if (
    path === "/auth/v1/user/me" &&
    status === 400 &&
    code === "9" &&
    /token.{0,24}(?:expiry|expired)|expired.{0,24}token/i.test(description)
  ) {
    return { status: 401, code: "token_expired" };
  }
  if (
    path === "/auth/v1/signin" &&
    status === 400 &&
    code === "4043" &&
    errorName === "invalid_username_or_password"
  ) {
    return { status: 401, code: "invalid_credentials" };
  }
  return { status, code: code || (status === 401 ? "invalid_credentials" : "cloudbase_auth_error") };
}

export async function cloudBaseAuthRequest<T = Record<string, unknown>>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    fetcher?: typeof fetch;
  } = {},
): Promise<T> {
  const headers = new Headers({ accept: "application/json" });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(cloudBaseGatewayUrl(path), {
      method: options.method ?? "GET",
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new CloudBaseAuthError(503, "cloudbase_unreachable");
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Empty signout responses are valid.
  }
  if (!response.ok) {
    const normalized = normalizeAuthFailure(path, response.status, payload);
    throw new CloudBaseAuthError(normalized.status, normalized.code, normalized.message);
  }
  return (payload ?? {}) as T;
}
