import {
  CLOUD_BASE_SESSION_COOKIE,
  cloudBaseCookieOptions,
  parseCloudBaseSession,
  serializeCloudBaseSession,
  hasCloudBaseSessionChanged,
  type CloudBaseSession,
} from "./core";
import { KEEP_LOGGED_IN_COOKIE_NAME } from "@/lib/supabase/session-cookie";
import {
  asCloudBaseAuthError,
  refreshCloudBaseSession,
  signInCloudBase,
  signOutCloudBase,
  validateCloudBaseSession,
  verifyCloudBaseAccessToken,
} from "./auth";

type CookieStore = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
};

function authError(error: unknown) {
  const safe = asCloudBaseAuthError(error);
  return { message: safe.message, code: safe.code, status: safe.status };
}

function unsupported(name: string) {
  return { data: null, error: { message: `CloudBase 暂不支持 ${name}`, code: "unsupported_operation" } };
}

export function createCloudBaseServerAuth(cookieStore: CookieStore, keepLoggedIn: boolean) {
  const readSession = () => parseCloudBaseSession(cookieStore.get(CLOUD_BASE_SESSION_COOKIE)?.value);
  const writeSession = (session: CloudBaseSession) => cookieStore.set(
    CLOUD_BASE_SESSION_COOKIE,
    serializeCloudBaseSession(session),
    cloudBaseCookieOptions(keepLoggedIn),
  );
  const clearSession = () => cookieStore.set(CLOUD_BASE_SESSION_COOKIE, "", { ...cloudBaseCookieOptions(false), maxAge: 0 });

  return {
    async getUser(jwt?: string) {
      const session = readSession();
      const token = jwt ?? session?.accessToken;
      if (!token) return { data: { user: null }, error: null };
      try {
        if (jwt) {
          return { data: { user: await verifyCloudBaseAccessToken(jwt) }, error: null };
        }
        const verified = await validateCloudBaseSession({
          accessToken: token,
          refreshToken: jwt ? "" : session?.refreshToken ?? "",
          expiresAt: session?.expiresAt ?? 0,
          subject: session?.subject ?? "",
        });
        if (session && hasCloudBaseSessionChanged(session, verified.session)) {
          try { writeSession(verified.session); } catch { /* Middleware owns cookie refresh in read-only Server Components. */ }
        }
        return { data: { user: verified.user }, error: null };
      } catch (error) {
        return { data: { user: null }, error: authError(error) };
      }
    },
    async getSession() {
      return { data: { session: null }, error: { message: "CloudBase token 不通过会话接口暴露", code: "session_hidden" } };
    },
    async signInWithPassword(credentials: { email?: string; phone?: string; password: string }) {
      const username = credentials.email ?? credentials.phone;
      if (!username || !credentials.password) return { data: { user: null, session: null }, error: { message: "请输入账号和密码", code: "invalid_credentials" } };
      try {
        const result = await signInCloudBase(username, credentials.password);
        writeSession(result.session);
        return { data: { user: result.user, session: null }, error: null };
      } catch (error) {
        return { data: { user: null, session: null }, error: authError(error) };
      }
    },
    async signOut() {
      const session = readSession();
      try { await signOutCloudBase(session); } catch { /* Always clear the local session after logout. */ }
      clearSession();
      cookieStore.set(KEEP_LOGGED_IN_COOKIE_NAME, "", { ...cloudBaseCookieOptions(false), maxAge: 0 });
      return { error: null };
    },
    async refreshSession() {
      const session = readSession();
      if (!session) return { data: { user: null, session: null }, error: { message: "没有可续期的登录状态", code: "session_missing" } };
      try {
        const refreshed = await refreshCloudBaseSession(session);
        writeSession(refreshed.session);
        return { data: { user: refreshed.user, session: null }, error: null };
      } catch (error) {
        return { data: { user: null, session: null }, error: authError(error) };
      }
    },
    async signUp() { return unsupported("注册"); },
    async exchangeCodeForSession() { return unsupported("邮件链接登录"); },
    async verifyOtp() { return unsupported("验证码登录"); },
    async resetPasswordForEmail() { return unsupported("找回密码"); },
    async updateUser() { return unsupported("修改账号"); },
    async onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } }, error: { message: "CloudBase 不支持客户端会话事件订阅", code: "unsupported_operation" } }; },
  };
}

async function browserAuthRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...Object.fromEntries(new Headers(init?.headers)) },
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    return { data: null, error: { message: typeof payload.error === "string" ? payload.error : "登录状态验证失败", code: typeof payload.code === "string" ? payload.code : "cloudbase_auth_error", status: response.status } };
  }
  return { data: payload, error: null };
}

export function createCloudBaseBrowserAuth() {
  return {
    async signInWithPassword(credentials: { email?: string; phone?: string; password: string }) {
      const username = credentials.email ?? credentials.phone;
      if (!username || !credentials.password) return { data: { user: null, session: null }, error: { message: "请输入账号和密码", code: "invalid_credentials" } };
      const result = await browserAuthRequest("/api/cloudbase/auth/signin", { method: "POST", body: JSON.stringify({ username, password: credentials.password }) });
      return result.error
        ? { data: { user: null, session: null }, error: result.error }
        : { data: { user: result.data?.user ?? null, session: null }, error: null };
    },
    async getUser() {
      const result = await browserAuthRequest("/api/cloudbase/auth/user");
      return result.error
        ? { data: { user: null }, error: result.error }
        : { data: { user: result.data?.user ?? null }, error: null };
    },
    async signOut() {
      const result = await browserAuthRequest("/api/cloudbase/auth/signout", { method: "POST", body: "{}" });
      return { error: result.error };
    },
    async refreshSession() {
      const result = await browserAuthRequest("/api/cloudbase/auth/refresh", { method: "POST", body: "{}" });
      return result.error ? { data: { user: null, session: null }, error: result.error } : { data: { user: result.data?.user ?? null, session: null }, error: null };
    },
    async getSession() {
      return { data: { session: null }, error: { message: "CloudBase token 不通过浏览器会话接口暴露", code: "session_hidden" } };
    },
    async signUp() { return unsupported("注册"); },
    async exchangeCodeForSession() { return unsupported("邮件链接登录"); },
    async verifyOtp() { return unsupported("验证码登录"); },
    async resetPasswordForEmail() { return unsupported("找回密码"); },
    async updateUser() { return unsupported("修改账号"); },
    async onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } }, error: { message: "CloudBase 不支持客户端会话事件订阅", code: "unsupported_operation" } }; },
  };
}
